import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const BANDS_3 = [
    { label: "manha", start: 6 * 60, end: 10 * 60 },
    { label: "meio_dia", start: 10 * 60, end: 14 * 60 },
    { label: "tarde", start: 14 * 60, end: 20 * 60 },
];

function parseWorkTime(t: any): number | null {
    if (t == null) return null;
    if (typeof t === "string" && t.includes(":")) {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
    }
    const num = parseFloat(t);
    return isNaN(num) ? null : num * 60;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function formatDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

interface Slot { time: string; professional: string; minuteOfDay: number; }

/** Get all free slots for a given date across all professionals */
async function getSlotsForDate(
    supabase: any, professionals: any[], dateStr: string, dayOfWeek: number, duration: number
): Promise<Slot[]> {
    const slots: Slot[] = [];

    for (const prof of professionals) {
        const workDays: number[] = prof.work_days || [0, 1, 2, 3, 4, 5, 6];
        if (!workDays.includes(dayOfWeek)) continue;

        const wh = prof.work_hours || {};
        const whStart = parseWorkTime(wh.start) ?? 8 * 60;
        const whEnd = parseWorkTime(wh.end) ?? 20 * 60;
        const breakStart = parseWorkTime(wh.break_start);
        const breakEnd = parseWorkTime(wh.break_end);

        const { data: appointments } = await supabase
            .from("appointments")
            .select("start_time, end_time")
            .eq("professional_id", prof.id)
            .neq("status", "canceled")
            .gte("start_time", `${dateStr}T00:00:00`)
            .lte("start_time", `${dateStr}T23:59:59`);

        const busy = (appointments || []).map((a: any) => {
            const s = new Date(a.start_time);
            const e = new Date(a.end_time);
            return { start: s.getHours() * 60 + s.getMinutes(), end: e.getHours() * 60 + e.getMinutes() };
        });

        for (let m = whStart; m + duration <= whEnd; m += 10) {
            if (breakStart !== null && breakEnd !== null && m < breakEnd && m + duration > breakStart) continue;
            let conflict = false;
            for (const b of busy) { if (m < b.end && m + duration > b.start) { conflict = true; break; } }
            if (conflict) continue;
            slots.push({ time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, professional: prof.name, minuteOfDay: m });
        }
    }

    return slots.sort((a, b) => a.minuteOfDay - b.minuteOfDay);
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
        if (!envApiKey || apiKey !== envApiKey) {
            return new Response(JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const body = await req.json();
        const { user_id, service_name, date, period } = body;

        if (!user_id || !service_name) {
            return new Response(JSON.stringify({ error: "Missing user_id or service_name" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Find the service
        const { data: sc } = await supabase
            .from("services_client")
            .select("id, name, duration_minutes, professionals")
            .eq("user_id", user_id)
            .ilike("name", service_name)
            .eq("status", true)
            .limit(1)
            .maybeSingle();

        if (!sc) {
            return new Response(JSON.stringify({ error: `Aplicação "${service_name}" não encontrada` }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const duration = sc.duration_minutes || 30;
        const profIds: string[] = sc.professionals || [];
        if (profIds.length === 0) {
            return new Response(JSON.stringify({ error: "Nenhum profissional atrelado a este serviço" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: professionals } = await supabase
            .from("professionals").select("id, name, work_hours, work_days").in("id", profIds);
        if (!professionals || professionals.length === 0) {
            return new Response(JSON.stringify({ error: "Profissionais não encontrados" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const MAX_SEARCH = 30;

        // ════════════════════════════════════════════
        // MODE 2: date + period → all slots in period
        // ════════════════════════════════════════════
        if (date && period) {
            const periodLower = period.toLowerCase();
            const cutoff = 12 * 60; // manha < 12h, tarde >= 12h
            const filterFn = periodLower === "manha"
                ? (s: Slot) => s.minuteOfDay < cutoff
                : (s: Slot) => s.minuteOfDay >= cutoff;
            const periodLabel = periodLower === "manha" ? "manhã" : "tarde";

            // Try the requested date first
            const reqDate = new Date(date + "T12:00:00");
            const dateStr = formatDate(reqDate);
            const allSlots = await getSlotsForDate(supabase, professionals, dateStr, reqDate.getDay(), duration);
            const filtered = allSlots.filter(filterFn);

            if (filtered.length > 0) {
                return new Response(JSON.stringify({
                    service: sc.name,
                    duration_minutes: duration,
                    date: dateStr,
                    day_label: DAY_NAMES[reqDate.getDay()],
                    period: periodLabel,
                    slots: filtered.map(s => ({ time: s.time, professional: s.professional })),
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // No slots in requested date+period → find next available day with slots in that period
            let search = new Date(reqDate);
            search.setDate(search.getDate() + 1);

            for (let i = 0; i < MAX_SEARCH; i++) {
                const sDateStr = formatDate(search);
                const sSlots = await getSlotsForDate(supabase, professionals, sDateStr, search.getDay(), duration);
                const sFiltered = sSlots.filter(filterFn);

                if (sFiltered.length > 0) {
                    return new Response(JSON.stringify({
                        service: sc.name,
                        duration_minutes: duration,
                        requested_date: dateStr,
                        message: `Sem horários no período da ${periodLabel} em ${dateStr}. Próxima disponibilidade:`,
                        date: sDateStr,
                        day_label: DAY_NAMES[search.getDay()],
                        period: periodLabel,
                        slots: sFiltered.map(s => ({ time: s.time, professional: s.professional })),
                    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }

                search.setDate(search.getDate() + 1);
            }

            return new Response(JSON.stringify({
                service: sc.name,
                message: `Nenhum horário disponível no período da ${periodLabel} nos próximos 30 dias`,
                slots: [],
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ════════════════════════════════════════════
        // MODE 1: no date/period → 3 next days summary
        // ════════════════════════════════════════════
        const today = new Date();
        const availability: any[] = [];
        let searchDate = new Date(today);
        searchDate.setDate(searchDate.getDate() + 1);
        searchDate.setHours(0, 0, 0, 0);

        for (let attempt = 0; attempt < MAX_SEARCH && availability.length < 3; attempt++) {
            const dateStr = formatDate(searchDate);
            const daySlots = await getSlotsForDate(supabase, professionals, dateStr, searchDate.getDay(), duration);

            if (daySlots.length > 0) {
                const pickedSlots: { time: string; professional: string }[] = [];
                for (const band of BANDS_3) {
                    const inBand = daySlots.filter(s => s.minuteOfDay >= band.start && s.minuteOfDay < band.end);
                    if (inBand.length > 0) {
                        const mid = Math.floor(inBand.length / 2);
                        pickedSlots.push({ time: inBand[mid].time, professional: inBand[mid].professional });
                    }
                }
                if (pickedSlots.length > 0) {
                    availability.push({
                        date: dateStr,
                        day_label: DAY_NAMES[searchDate.getDay()],
                        slots: pickedSlots,
                    });
                }
            }

            searchDate.setDate(searchDate.getDate() + 1);
        }

        return new Response(JSON.stringify({
            service: sc.name,
            duration_minutes: duration,
            availability,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
