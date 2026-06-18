import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Time bands: morning (06-10), midday (10-14), afternoon (14-20)
const BANDS = [
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

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
        if (!envApiKey || apiKey !== envApiKey) {
            return new Response(
                JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { user_id, service_name } = await req.json();
        if (!user_id || !service_name) {
            return new Response(
                JSON.stringify({ error: "Missing user_id or service_name" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // 1. Find the service (application) by name
        const { data: sc } = await supabase
            .from("services_client")
            .select("id, name, duration_minutes, professionals")
            .eq("user_id", user_id)
            .ilike("name", service_name)
            .eq("status", true)
            .limit(1)
            .maybeSingle();

        if (!sc) {
            return new Response(
                JSON.stringify({ error: `Aplicação "${service_name}" não encontrada` }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const duration = sc.duration_minutes || 30;
        const profIds: string[] = sc.professionals || [];

        if (profIds.length === 0) {
            return new Response(
                JSON.stringify({ error: "Nenhum profissional atrelado a este serviço" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 2. Fetch professionals
        const { data: professionals } = await supabase
            .from("professionals")
            .select("id, name, work_hours, work_days")
            .in("id", profIds);

        if (!professionals || professionals.length === 0) {
            return new Response(
                JSON.stringify({ error: "Profissionais não encontrados" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 3. Search next 3 available days starting from tomorrow
        const today = new Date();
        const availability: any[] = [];
        let searchDate = new Date(today);
        searchDate.setDate(searchDate.getDate() + 1); // start tomorrow
        searchDate.setHours(0, 0, 0, 0);

        const MAX_DAYS_SEARCH = 30; // don't search more than 30 days ahead

        for (let attempt = 0; attempt < MAX_DAYS_SEARCH && availability.length < 3; attempt++) {
            const dateStr = formatDate(searchDate);
            const dayOfWeek = searchDate.getDay();

            // Collect slots from all professionals for this day
            const daySlots: { time: string; professional: string; minuteOfDay: number }[] = [];

            for (const prof of professionals) {
                const workDays: number[] = prof.work_days || [0, 1, 2, 3, 4, 5, 6];
                if (!workDays.includes(dayOfWeek)) continue;

                const wh = prof.work_hours || {};
                const whStart = parseWorkTime(wh.start) ?? 8 * 60;
                const whEnd = parseWorkTime(wh.end) ?? 20 * 60;
                const breakStart = parseWorkTime(wh.break_start);
                const breakEnd = parseWorkTime(wh.break_end);

                // Fetch existing appointments for this professional on this date
                const startOfDay = `${dateStr}T00:00:00`;
                const endOfDay = `${dateStr}T23:59:59`;

                const { data: appointments } = await supabase
                    .from("appointments")
                    .select("start_time, end_time")
                    .eq("professional_id", prof.id)
                    .neq("status", "canceled")
                    .gte("start_time", startOfDay)
                    .lte("start_time", endOfDay);

                const busySlots = (appointments || []).map((a: any) => {
                    const s = new Date(a.start_time);
                    const e = new Date(a.end_time);
                    return { start: s.getHours() * 60 + s.getMinutes(), end: e.getHours() * 60 + e.getMinutes() };
                });

                // Generate available slots with 10-min intervals
                for (let m = whStart; m + duration <= whEnd; m += 10) {
                    // Check break conflict
                    if (breakStart !== null && breakEnd !== null) {
                        if (m < breakEnd && m + duration > breakStart) continue;
                    }

                    // Check appointment conflict
                    let conflict = false;
                    for (const busy of busySlots) {
                        if (m < busy.end && m + duration > busy.start) {
                            conflict = true;
                            break;
                        }
                    }
                    if (conflict) continue;

                    const timeStr = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
                    daySlots.push({ time: timeStr, professional: prof.name, minuteOfDay: m });
                }
            }

            if (daySlots.length === 0) {
                searchDate.setDate(searchDate.getDate() + 1);
                continue;
            }

            // Pick up to 1 slot per band (prefer earliest in each band)
            const pickedSlots: { time: string; professional: string }[] = [];

            for (const band of BANDS) {
                const inBand = daySlots
                    .filter(s => s.minuteOfDay >= band.start && s.minuteOfDay < band.end)
                    .sort((a, b) => a.minuteOfDay - b.minuteOfDay);

                if (inBand.length > 0) {
                    // Pick one near the middle of available slots for variety
                    const mid = Math.floor(inBand.length / 2);
                    pickedSlots.push({ time: inBand[mid].time, professional: inBand[mid].professional });
                }
            }

            if (pickedSlots.length > 0) {
                availability.push({
                    date: dateStr,
                    day_label: DAY_NAMES[dayOfWeek],
                    slots: pickedSlots,
                });
            }

            searchDate.setDate(searchDate.getDate() + 1);
        }

        return new Response(
            JSON.stringify({
                service: sc.name,
                duration_minutes: duration,
                availability,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
