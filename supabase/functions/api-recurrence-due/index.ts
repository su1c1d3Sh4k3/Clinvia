import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveConversationsForContacts } from "../_shared/resolve-conversation.ts";
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
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
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const userId = body!.user_id;
        const date = body!.date;

        const missing = missingFields(corsHeaders, body!, ["user_id", "date"],
            "Envie o id da conta (bd_data.user_id no prompt da IA) e a data das abordagens no formato YYYY-MM-DD.");
        if (missing) return missing;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
            return apiError(corsHeaders, {
                status: 400,
                code: "invalid_date",
                message: `Campo date inválido: "${date}" não está no formato YYYY-MM-DD (ex.: 2026-08-26). Envie a data do dia cujas abordagens de recorrência devem ser listadas.`,
            });
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

        if (error) {
            return dbErrorResponse(corsHeaders, "recurrence_query_failed",
                `listar as recorrências com abordagem pendente em ${date} para a conta ${userId}`, error);
        }

        // As demais APIs (agendamento, CRM, envio) trabalham por conversation_id
        // — sem conversation_id o n8n não consegue encadear nada, então uma falha
        // aqui derruba a resposta (ConversationResolutionError já é descritiva e
        // cai no catch externo com status/código próprios).
        const convByContact = await resolveConversationsForContacts(
            supabase,
            userId,
            (data || []).map((e: any) => e.contact_id).filter(Boolean),
        );

        // Build clean response: one entry per matching approach
        const results: any[] = [];
        for (const entry of data || []) {
            const conv = entry.contact_id ? convByContact.get(entry.contact_id) : undefined;
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
                        conversation_id: conv?.conversationId ?? null,
                        instance_id: conv?.instanceId ?? null,
                    });
                }
            }
        }

        return json({ success: true, count: results.length, data: results });
    } catch (err) {
        return unexpectedErrorResponse(corsHeaders,
            "Falha inesperada na API de recorrências pendentes (api-recurrence-due)", err);
    }
});

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
