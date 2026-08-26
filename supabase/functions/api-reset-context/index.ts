import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
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
 * api-reset-context
 *
 * Zera o histórico que a IA recebe (bd_data.conversation_history) para um
 * contato, sem apagar nada: grava contacts.ia_context_reset_at = agora e a RPC
 * get_conversation_messages_toon passa a considerar só mensagens posteriores.
 * O inbox continua mostrando a conversa inteira.
 *
 * Serve para simular um cliente novo em testes com o mesmo número.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body (JSON):
 *   - contact_id (obrigatório)
 *   - restore (opcional, bool): true devolve o histórico completo (volta a NULL)
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

        const contactId = body!.contact_id;
        const restore = body!.restore === true;

        const missing = missingFields(corsHeaders, body!, ["contact_id"],
            "Envie o id do contato cujo contexto da IA deve ser zerado (contacts.id).");
        if (missing) return missing;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const resetAt = restore ? null : new Date().toISOString();

        const { data, error } = await supabase
            .from("contacts")
            .update({ ia_context_reset_at: resetAt })
            .eq("id", contactId)
            .select("id, push_name, number, ia_context_reset_at")
            .maybeSingle();

        if (error) {
            return dbErrorResponse(corsHeaders, "context_reset_failed",
                restore
                    ? `devolver o histórico completo do contato ${contactId} (contacts.ia_context_reset_at = NULL)`
                    : `zerar o contexto da IA do contato ${contactId} (contacts.ia_context_reset_at = ${resetAt})`,
                error);
        }
        if (!data) {
            return apiError(corsHeaders, {
                status: 404,
                code: "contact_not_found",
                message: `Contato não encontrado: nenhum contato com o id ${contactId} existe neste banco. Envie o UUID de contacts.id (não o telefone).`,
            });
        }

        return json({
            success: true,
            contact_id: data.id,
            contact_name: data.push_name,
            number: data.number,
            ia_context_reset_at: data.ia_context_reset_at,
            message: restore
                ? "Histórico completo devolvido para a IA."
                : "Contexto limpo: a IA passa a ver este contato como um cliente novo.",
        });
    } catch (err) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de reset de contexto da IA (api-reset-context)", err);
    }
});
