import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    apiError,
    dbErrorResponse,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";
import { loadSandboxContext, logSandboxCall } from "../_shared/sandbox.ts";

/**
 * api-add-note-sandbox
 *
 * Gêmea de `api-add-note` no ambiente de teste: a nota interna da IA vai para
 * `sandbox_notes` e aparece no painel do paciente fictício.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body: { conversation_id | user_id, text, author_name? }
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-origin",
};

serveMonitored("api-add-note-sandbox", async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const text = typeof body!.text === "string" ? body!.text.trim() : "";
        if (!text) {
            return apiError(corsHeaders, {
                status: 400,
                code: "empty_note_text",
                message: "O campo `text` da nota está vazio. Envie o texto da nota que deve ficar registrado na conversa.",
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const ctx = await loadSandboxContext(supabase, {
            conversationId: body!.conversation_id,
            userId: body!.user_id,
        });

        const { data: note, error } = await supabase
            .from("sandbox_notes")
            .insert({
                session_id: ctx.session.id,
                user_id: ctx.userId,
                contact_id: ctx.contact.id,
                content: text,
            })
            .select("id, created_at")
            .single();

        if (error) {
            return dbErrorResponse(corsHeaders, "note_insert_failed",
                "gravar a nota da IA no ambiente de teste", error);
        }

        await logSandboxCall(supabase, ctx, {
            function_name: "api-add-note-sandbox",
            label: `IA anotou na conversa: "${text.slice(0, 80)}"`,
            request: body,
        });

        return json({
            success: true,
            note_id: note.id,
            conversation_id: ctx.conversation.id,
            contact_id: ctx.contact.id,
        });
    } catch (err) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de notas do ambiente de teste (api-add-note-sandbox)", err, req);
    }
});
