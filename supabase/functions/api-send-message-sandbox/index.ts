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
 * api-send-message-sandbox
 *
 * Gêmea de `api-send-message` no ambiente de teste. NADA sai por WhatsApp:
 * a resposta da IA vira uma linha em `sandbox_messages` e aparece no chat da
 * página Sandbox da IA.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body:
 *   conversation_id (bd_data.conversation_id) — ou user_id como alternativa
 *   text          — texto da mensagem
 *   audio_base64  — áudio em base64 (aceita data URI); vira um balão de áudio
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const EXT_BY_MIME: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/wav": "wav",
};

serveMonitored("api-send-message-sandbox", async (req) => {
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

        const text: string | undefined = body!.text;
        const audioBase64: string | undefined = body!.audio_base64 || body!.audio;
        const mimeType: string = body!.mime_type || "audio/mpeg";

        if (!text && !audioBase64) {
            return apiError(corsHeaders, {
                status: 400,
                code: "missing_content",
                message: "Nenhum conteúdo para enviar: informe `text` (mensagem de texto) ou `audio_base64` (áudio em base64). Os dois chegaram vazios.",
                details: `Campos recebidos: ${Object.keys(body!).join(", ") || "(nenhum)"}`,
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

        let mediaUrl: string | null = null;
        if (audioBase64) {
            const dataUriMatch = audioBase64.match(/^data:([^;]+);base64,(.*)$/s);
            const effectiveMime = dataUriMatch?.[1] || mimeType;
            const rawBase64 = (dataUriMatch?.[2] || audioBase64).replace(/\s/g, "");

            let fileBytes: Uint8Array;
            try {
                fileBytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
            } catch (decodeErr) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_base64",
                    message: "audio_base64 não é um base64 válido — a decodificação falhou. Envie o conteúdo do arquivo em base64 puro ou como data URI ('data:audio/ogg;base64,...').",
                    details: String((decodeErr as Error)?.message ?? decodeErr),
                });
            }

            const ext = EXT_BY_MIME[effectiveMime.toLowerCase()] || "mp3";
            const fileName = `sandbox/${ctx.session.id}/${Date.now()}_audio.${ext}`;
            const { error: uploadError } = await supabase.storage
                .from("media")
                .upload(fileName, fileBytes, { contentType: effectiveMime, cacheControl: "3600", upsert: true });
            if (uploadError) {
                return dbErrorResponse(corsHeaders, "audio_upload_failed",
                    `subir o áudio do ambiente de teste (${fileBytes.length} bytes) para o bucket 'media'`, uploadError);
            }
            mediaUrl = supabase.storage.from("media").getPublicUrl(fileName).data.publicUrl;
        }

        const { data: inserted, error: insertError } = await supabase
            .from("sandbox_messages")
            .insert({
                session_id: ctx.session.id,
                user_id: ctx.userId,
                conversation_id: ctx.conversation.id,
                role: "assistant",
                content: text ?? "",
                message_type: mediaUrl ? "audio" : "text",
                media_url: mediaUrl,
            })
            .select("id, created_at")
            .single();

        if (insertError) {
            return dbErrorResponse(corsHeaders, "sandbox_message_insert_failed",
                "gravar a resposta da IA no ambiente de teste", insertError);
        }

        await supabase.from("sandbox_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", ctx.conversation.id);

        await logSandboxCall(supabase, ctx, {
            function_name: "api-send-message-sandbox",
            label: mediaUrl
                ? "IA respondeu com um áudio"
                : `IA respondeu: "${String(text).slice(0, 80)}"`,
            request: { text, audio: !!mediaUrl },
        });

        return json({
            success: true,
            message_id: inserted.id,
            created_at: inserted.created_at,
            conversation_id: ctx.conversation.id,
            provider: "sandbox",
        });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de envio de mensagem do ambiente de teste (api-send-message-sandbox)", error, req);
    }
});
