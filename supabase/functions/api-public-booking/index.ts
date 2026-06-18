import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pad(n: number): string { return String(n).padStart(2, "0"); }

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { action, user_id, contact_id, service_id, professional_id, date, time } = await req.json();

        if (!user_id) {
            return new Response(JSON.stringify({ error: "Missing user_id" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // ── get_services: categories + service_names + applications ──
        if (action === "get_services") {
            const { data: sc } = await supabase.from("services_client")
                .select("id, name, price, duration_minutes, category_id, service_name_id, professionals")
                .eq("user_id", user_id).eq("status", true);

            const catIds = [...new Set((sc || []).map((s: any) => s.category_id))];
            const snIds = [...new Set((sc || []).map((s: any) => s.service_name_id))];

            const { data: cats } = await supabase.from("services_category").select("id, name, category_type").in("id", catIds).order("name");
            const { data: sns } = await supabase.from("service_name").select("id, name, category_id").in("id", snIds).order("name");

            return new Response(JSON.stringify({
                categories: cats || [],
                service_names: sns || [],
                applications: (sc || []).map((s: any) => ({
                    id: s.id, name: s.name, price: s.price, duration_minutes: s.duration_minutes,
                    category_id: s.category_id, service_name_id: s.service_name_id, professionals: s.professionals || [],
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_professionals: by IDs ──
        if (action === "get_professionals") {
            const { professional_ids } = await req.json().catch(() => ({}));
            const ids = professional_ids || [];
            if (ids.length === 0) {
                return new Response(JSON.stringify({ professionals: [] }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            // We already have the body parsed, use the ids from the outer parse
            return new Response(JSON.stringify({ professionals: [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_professionals_by_ids ──
        if (action === "get_professionals_by_ids") {
            const body2 = { action, user_id, contact_id, service_id, professional_id, date, time };
            // professional_ids comes from body
            return new Response(JSON.stringify({ error: "Use get_slots instead" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_prof_list: fetch professionals by array of IDs ──
        if (action === "get_prof_list") {
            // Re-parse body to get professional_ids
            const { data: profs } = await supabase.from("professionals")
                .select("id, name, photo_url, role");
            return new Response(JSON.stringify({ professionals: profs || [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_slots: available time slots for a professional on a date ──
        if (action === "get_slots") {
            if (!professional_id || !date || !service_id) {
                return new Response(JSON.stringify({ error: "Missing professional_id, date or service_id" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Get service duration
            const { data: svc } = await supabase.from("services_client")
                .select("duration_minutes").eq("id", service_id).single();
            const duration = svc?.duration_minutes || 30;

            // Get professional work settings
            const { data: prof } = await supabase.from("professionals")
                .select("work_hours, work_days").eq("id", professional_id).single();

            const wh = prof?.work_hours || {};
            const workDays: number[] = prof?.work_days || [1, 2, 3, 4, 5];
            const reqDate = new Date(date + "T12:00:00");
            if (!workDays.includes(reqDate.getDay())) {
                return new Response(JSON.stringify({ slots: [] }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const parseT = (t: any): number => {
                if (!t) return 0;
                if (typeof t === "string" && t.includes(":")) { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
                return parseFloat(t) * 60 || 0;
            };

            const whStart = parseT(wh.start) || 8 * 60;
            const whEnd = parseT(wh.end) || 20 * 60;
            const brkStart = wh.break_start ? parseT(wh.break_start) : null;
            const brkEnd = wh.break_end ? parseT(wh.break_end) : null;

            // Existing appointments
            const { data: apts } = await supabase.from("appointments")
                .select("start_time, end_time").eq("professional_id", professional_id).neq("status", "canceled")
                .gte("start_time", `${date}T00:00:00`).lte("start_time", `${date}T23:59:59`);

            const busy = (apts || []).map((a: any) => {
                const s = new Date(a.start_time); const e = new Date(a.end_time);
                return { start: s.getHours() * 60 + s.getMinutes(), end: e.getHours() * 60 + e.getMinutes() };
            });

            const available: string[] = [];
            for (let m = whStart; m + duration <= whEnd; m += 10) {
                if (brkStart !== null && brkEnd !== null && m < brkEnd && m + duration > brkStart) continue;
                let conflict = false;
                for (const b of busy) { if (m < b.end && m + duration > b.start) { conflict = true; break; } }
                if (!conflict) available.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
            }

            return new Response(JSON.stringify({ slots: available }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── create_booking: create appointment ──
        if (action === "create_booking") {
            if (!contact_id || !service_id || !professional_id || !date || !time) {
                return new Response(JSON.stringify({ error: "Missing required fields" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const { data: svc } = await supabase.from("services_client")
                .select("name, price, duration_minutes, category_id, service_name_id").eq("id", service_id).single();
            if (!svc) throw new Error("Serviço não encontrado");

            const duration = svc.duration_minutes || 30;
            const startISO = `${date}T${time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + duration * 60000);

            if (startDate < new Date()) {
                return new Response(JSON.stringify({ error: "Não é possível agendar no passado" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Check overlap
            const { data: overlap } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: professional_id,
                p_start_time: startDate.toISOString(),
                p_end_time: endDate.toISOString(),
                p_exclude_id: null,
            });
            if (overlap) {
                return new Response(JSON.stringify({ error: "Horário indisponível" }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const { data: created, error: insertErr } = await supabase.from("appointments").insert({
                user_id,
                professional_id,
                contact_id,
                service_id,
                category_id: svc.category_id,
                service_name_id: svc.service_name_id,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                price: svc.price || 0,
                type: "appointment",
            }).select().single();

            if (insertErr) throw insertErr;

            return new Response(JSON.stringify({ success: true, appointment_id: created.id }),
                { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        throw new Error("Invalid action");

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
