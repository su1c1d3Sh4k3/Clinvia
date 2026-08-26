import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * api-send-message
 *
 * API externa (n8n) para enviar mensagem de texto a um cliente.
 * Roteia automaticamente para Meta Cloud API ou UAZAPI conforme o
 * provider da instância — a decisão é feita pelo evolution-send-message,
 * que já trata erros, auto-disconnect e persiste a mensagem no banco.
 *
 * Auth: header `x-api-key` = SCHEDULING_API_KEY (mesmo das demais api-*).
 *
 * Body:
 *   user_id         (obrigatório) — dono da conta (bd_data.user_id)
 *   conversation_id (obrigatório) — conversa de destino (bd_data.conversation_id);
 *                                   contato e instância são derivados dela
 *   text            (obrigatório*) — texto da mensagem
 *   audio_base64    (obrigatório*) — áudio em base64 (aceita data URI); enviado como PTT/voz
 *   mime_type       (opcional)   — mime do áudio (default audio/mpeg)
 *   (* enviar text OU audio_base64)
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
        if (!envApiKey || apiKey !== envApiKey) {
            return json({ success: false, error: "unauthorized", message: "Unauthorized" }, 401);
        }

        const body = await req.json();
        const userId: string | undefined = body.user_id;
        const text: string | undefined = body.text;
        const audioBase64: string | undefined = body.audio_base64 || body.audio;
        const mimeType: string = body.mime_type || "audio/mpeg";
        const conversationId: string | undefined = body.conversation_id;

        if (!userId || !conversationId || (!text && !audioBase64)) {
            return json({
                success: false,
                error: "missing_params",
                message: "Campos obrigatórios: user_id, conversation_id e text ou audio_base64",
            }, 400);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // ── A conversa carrega o destinatário e a conexão ──
        const { data: conv } = await supabase
            .from("conversations")
            .select("id, user_id, instance_id, instagram_instance_id")
            .eq("id", conversationId)
            .eq("user_id", userId)
            .maybeSingle();

        if (!conv) {
            return json({
                success: false,
                error: "conversation_not_found",
                message: "Conversa não encontrada para este user_id",
            }, 404);
        }

        // Instagram tem função própria (instagram-send-message)
        if (!conv.instance_id) {
            return json({
                success: false,
                error: "unsupported_channel",
                message: "Conversa sem instância WhatsApp — canal não suportado por esta API",
            }, 400);
        }

        const { data: instance } = await supabase
            .from("instances")
            .select("id, user_id, provider, status")
            .eq("id", conv.instance_id)
            .maybeSingle();

        if (!instance) {
            return json({
                success: false,
                error: "instance_not_found",
                message: "Instância da conversa não encontrada",
            }, 404);
        }

        // ── Áudio em base64: upload no bucket público 'media' → URL ──
        // A URL funciona nos dois providers: UAZAPI recebe em `file` (tipo ptt)
        // e a Meta Cloud API baixa via `audio.link`.
        let mediaUrl: string | undefined;
        if (audioBase64) {
            const extByMime: Record<string, string> = {
                "audio/mpeg": "mp3",
                "audio/mp3": "mp3",
                "audio/ogg": "ogg",
                "audio/opus": "ogg",
                "audio/mp4": "m4a",
                "audio/aac": "aac",
                "audio/amr": "amr",
                "audio/wav": "wav",
            };
            // Aceita data URI ("data:audio/ogg;base64,...") ou base64 puro
            const dataUriMatch = audioBase64.match(/^data:([^;]+);base64,(.*)$/s);
            const effectiveMime = dataUriMatch?.[1] || mimeType;
            const rawBase64 = (dataUriMatch?.[2] || audioBase64).replace(/\s/g, "");

            let fileBytes: Uint8Array;
            try {
                fileBytes = Uint8Array.from(atob(rawBase64), (c) => c.charCodeAt(0));
            } catch {
                return json({ success: false, error: "invalid_base64", message: "audio_base64 não é um base64 válido" }, 400);
            }

            // Rejeita payloads truncados/inválidos (ex.: expressão n8n não resolvida).
            // A Meta aceita o envio e falha async (131053) — melhor falhar aqui, síncrono.
            if (fileBytes.length < 1024) {
                return json({
                    success: false,
                    error: "invalid_audio",
                    message: `audio_base64 decodificado tem apenas ${fileBytes.length} bytes — payload truncado ou inválido. Envie o base64 completo do arquivo de áudio.`,
                }, 400);
            }

            const ext = extByMime[effectiveMime.toLowerCase()] || "mp3";
            const fileName = `media/${conversationId}/${Date.now()}_api_audio.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from("media")
                .upload(fileName, fileBytes, { contentType: effectiveMime, cacheControl: "3600", upsert: true });

            if (uploadError) {
                console.error("[api-send-message] audio upload error:", uploadError);
                return json({ success: false, error: "upload_failed", message: "Falha ao processar o áudio" }, 500);
            }

            mediaUrl = supabase.storage.from("media").getPublicUrl(fileName).data.publicUrl;
        }

        // ── Delega para evolution-send-message ──
        // Ele decide o provider: instance.provider === 'meta' → meta-send-message
        // (Graph API); caso contrário → UAZAPI. Também salva a mensagem no banco.
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

        const sendResp = await fetch(`${supabaseUrl}/functions/v1/evolution-send-message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
                conversationId,
                body: text,
                messageType: mediaUrl ? "audio" : "text",
                mediaUrl,
                message: { wasSentByApi: true },
            }),
        });

        const sendBody = await sendResp.json().catch(() => ({}));

        return json({
            ...sendBody,
            provider: instance.provider === "meta" ? "meta" : "uazapi",
            conversation_id: conversationId,
        }, sendResp.status);
    } catch (error: any) {
        console.error("[api-send-message] Error:", error?.message, error?.stack);
        return json({
            success: false,
            error: "internal_error",
            message: error?.message || "Erro desconhecido",
        }, 500);
    }
});
