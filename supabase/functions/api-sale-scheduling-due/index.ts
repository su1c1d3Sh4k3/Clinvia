import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { resolveConversationsForContacts } from "../_shared/resolve-conversation.ts";
import {
    apiError,
    dbErrorResponse,
    describeDbError,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
    unknownAction,
} from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const VALID_ACTIONS = ["list", "mark_contacted"];

/**
 * api-sale-scheduling-due (n8n tool)
 *
 * Vendas com "Agendamento IA" cujo prazo de contato venceu.
 * Estados de ia_scheduling_status: pendente → vencido → contato_realizado → agendado.
 *
 * Auth: header x-api-key = SCHEDULING_API_KEY
 *
 * Body (JSON):
 *   - user_id (obrigatório)
 *   - action (opcional):
 *       "list" (default) → atualiza pendente→vencido e retorna vendas vencidas
 *       "mark_contacted"  → body.sale_id obrigatório; marca contato_realizado
 */
serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const userId = body!.user_id;
        const action = body!.action || "list";

        const missing = missingFields(corsHeaders, body!, ["user_id"],
            "Envie o id da conta (bd_data.user_id no prompt da IA).");
        if (missing) return missing;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        if (action === "mark_contacted") {
            const saleId = body!.sale_id;
            const missingSale = missingFields(corsHeaders, body!, ["sale_id"],
                "Envie o sale_id devolvido pela ação list (campo sale_id de cada item).");
            if (missingSale) return missingSale;

            const { data, error } = await supabase
                .from("sales")
                .update({ ia_scheduling_status: "contato_realizado" })
                .eq("id", saleId)
                .eq("user_id", userId)
                .eq("ia_scheduling", true)
                .select("id, ia_scheduling_status")
                .maybeSingle();
            if (error) {
                return dbErrorResponse(corsHeaders, "sale_mark_contacted_failed",
                    `marcar a venda ${saleId} como "contato_realizado"`, error);
            }
            if (!data) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "sale_not_found",
                    message: `Nenhuma venda com id ${saleId} foi encontrada na conta ${userId} com Agendamento IA ativo. Confira se o sale_id veio da ação list — vendas de outra conta ou sem ia_scheduling não podem ser marcadas.`,
                });
            }
            return json({ success: true, sale: data });
        }

        if (action !== "list") {
            return unknownAction(corsHeaders, action, VALID_ACTIONS);
        }

        // Atualiza pendente → vencido (sale_date + ia_contact_days <= hoje).
        // Falha aqui NÃO derruba a lista: as vendas já marcadas como vencidas
        // continuam válidas — só as que venceriam agora ficam de fora, e o motivo
        // volta em `overdue_update_warning` em vez de sumir no log.
        let overdueWarning: string | null = null;
        const { error: overdueErr } = await supabase.rpc("update_overdue_ia_scheduling");
        if (overdueErr) {
            overdueWarning = describeDbError(
                "atualizar as vendas de pendente para vencido (RPC update_overdue_ia_scheduling) — a lista abaixo pode estar incompleta",
                overdueErr,
            );
            console.warn("[api-sale-scheduling-due]", overdueWarning);
        }

        const { data: sales, error } = await supabase
            .from("sales")
            .select(
                "id, product_name, service_client_id, sale_date, ia_contact_days, ia_scheduling_status, total_amount, professional_id, contact:contacts!sales_contact_id_fkey(id, push_name, number)"
            )
            .eq("user_id", userId)
            .eq("ia_scheduling", true)
            .eq("ia_scheduling_status", "vencido")
            .is("appointment_id", null)
            .order("sale_date", { ascending: true });

        if (error) {
            return dbErrorResponse(corsHeaders, "sales_due_query_failed",
                `listar as vendas com Agendamento IA vencido da conta ${userId}`, error);
        }

        // As demais APIs (agendamento, CRM, envio) trabalham por conversation_id
        // — sem conversation_id o n8n não consegue encadear nada, então uma falha
        // aqui derruba a resposta (ConversationResolutionError já é descritiva e
        // cai no catch externo com status/código próprios).
        const convByContact = await resolveConversationsForContacts(
            supabase,
            userId,
            (sales || []).map((s: any) => s.contact?.id).filter(Boolean),
        );

        const rows = (sales || []).map((s: any) => {
            const conv = s.contact?.id ? convByContact.get(s.contact.id) : undefined;
            return {
                sale_id: s.id,
                service_name: s.product_name,
                service_client_id: s.service_client_id,
                sale_date: s.sale_date,
                ia_contact_days: s.ia_contact_days,
                status: s.ia_scheduling_status,
                total_amount: s.total_amount,
                professional_id: s.professional_id,
                contact_id: s.contact?.id ?? null,
                contact_name: s.contact?.push_name ?? null,
                contact_number: s.contact?.number ? String(s.contact.number).split("@")[0] : null,
                conversation_id: conv?.conversationId ?? null,
                instance_id: conv?.instanceId ?? null,
            };
        });

        console.log(`[api-sale-scheduling-due] user=${userId} due=${rows.length}`);
        return json({
            success: true,
            count: rows.length,
            sales: rows,
            ...(overdueWarning ? { overdue_update_warning: overdueWarning } : {}),
        });
    } catch (err) {
        return unexpectedErrorResponse(corsHeaders,
            "Falha inesperada na API de vendas com Agendamento IA vencido (api-sale-scheduling-due)", err);
    }
});
