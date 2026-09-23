import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { readJsonBody, requireApiKey, unexpectedErrorResponse } from "../_shared/api-errors.ts";
import { loadSandboxContext, logSandboxCall } from "../_shared/sandbox.ts";

/**
 * api-reset-context-sandbox
 *
 * Gêmea de `api-reset-context` no ambiente de teste: zera o histórico que a IA
 * enxerga (sandbox_contacts.ia_context_reset_at). As mensagens continuam na
 * tela — só somem do contexto enviado ao n8n.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body: { conversation_id } ou { user_id }, restore? (bool)
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serveMonitored("api-reset-context-sandbox", async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const ctx = await loadSandboxContext(supabase, {
            conversationId: body!.conversation_id,
            userId: body!.user_id,
        });

        const restore = body!.restore === true;
        const resetAt = restore ? null : new Date().toISOString();

        await supabase.from("sandbox_contacts")
            .update({ ia_context_reset_at: resetAt })
            .eq("id", ctx.contact.id);

        await logSandboxCall(supabase, ctx, {
            function_name: "api-reset-context-sandbox",
            label: restore
                ? "Devolveu o histórico completo para a IA"
                : "Limpou o contexto: a IA volta a tratar o paciente como novo",
            request: body,
        });

        return json({
            success: true,
            contact_id: ctx.contact.id,
            contact_name: ctx.contact.push_name,
            number: ctx.contact.number,
            ia_context_reset_at: resetAt,
            message: restore
                ? "Histórico completo devolvido para a IA."
                : "Contexto limpo: a IA passa a ver este contato como um cliente novo.",
        });
    } catch (err) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de reset de contexto do ambiente de teste (api-reset-context-sandbox)", err, req);
    }
});
