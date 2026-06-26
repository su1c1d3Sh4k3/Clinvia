import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * api-recurrence-due
 *
 * Retorna todas as recorrências com abordagem pendente na data informada.
 * Exclui registros com scheduled = true.
 *
 * Body (JSON):
 *   - user_id (obrigatório): ID do dono
 *   - date   (obrigatório): data no formato YYYY-MM-DD
 */
serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const userId = body.user_id;
        const date = body.date;

        if (!userId) {
            return json({ success: false, error: "user_id is required" }, 400);
        }

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return json({ success: false, error: "date is required (YYYY-MM-DD)" }, 400);
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);

        // Fetch all recurrences for this user where any approach date matches
        // and scheduled = false
        const { data, error } = await supabase
            .from("recurrence_tracking")
            .select(`
                id,
                contact_id,
                appointment_id,
                service_client_id,
                contact_name,
                service_name,
                application_name,
                procedure_date,
                recurrence_date,
                approach_1_date,
                approach_1_status,
                approach_2_date,
                approach_2_status,
                approach_3_date,
                approach_3_status,
                scheduled
            `)
            .eq("user_id", userId)
            .eq("scheduled", false)
            .or(`approach_1_date.eq.${date},approach_2_date.eq.${date},approach_3_date.eq.${date}`);

        if (error) throw error;

        // Build clean response: one entry per matching approach
        const results: any[] = [];
        for (const entry of data || []) {
            const approaches = [
                { field: "approach_1_date", date: entry.approach_1_date, status: entry.approach_1_status },
                { field: "approach_2_date", date: entry.approach_2_date, status: entry.approach_2_status },
                { field: "approach_3_date", date: entry.approach_3_date, status: entry.approach_3_status },
            ];

            for (const match of approaches) {
                if (match.date === date) {
                    results.push({
                        id: entry.id,
                        contact_id: entry.contact_id,
                        appointment_id: entry.appointment_id,
                        service_client_id: entry.service_client_id,
                        contact_name: entry.contact_name,
                        service_name: entry.service_name,
                        application_name: entry.application_name,
                        procedure_date: entry.procedure_date,
                        recurrence_date: entry.recurrence_date,
                        approach: match.field,
                        approach_status: match.status,
                    });
                }
            }
        }

        return json({ success: true, count: results.length, data: results });
    } catch (err: any) {
        console.error("[api-recurrence-due] error:", err);
        return json({ success: false, error: String(err?.message || err) }, 500);
    }
});

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
