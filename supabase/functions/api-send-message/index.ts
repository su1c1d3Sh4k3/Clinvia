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
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const userId: string | undefined = body!.user_id;
        const text: string | undefined = body!.text;
        const audioBase64: string | undefined = body!.audio_base64 || body!.audio;
        const mimeType: string = body!.mime_type || "audio/mpeg";
        const conversationId: string | undefined = body!.conversation_id;

        const missing = missingFields(corsHeaders, body!, ["user_id", "conversation_id"],
            "user_id é bd_data.user_id e conversation_id é bd_data.conversation_id no prompt da IA.");
        if (missing) return missing;

        // conteúdo é alternativa (text OU audio_base64), fora do alcance de missingFields
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

        // ── A conversa carrega o destinatário e a conexão ──
        const { data: conv, error: convError } = await supabase
            .from("conversations")
            .select("id, user_id, instance_id, instagram_instance_id")
            .eq("id", conversationId)
            .eq("user_id", userId)
            .maybeSingle();

        if (convError) {
            return dbErrorResponse(corsHeaders, "conversation_lookup_failed",
                `buscar a conversa ${conversationId} de destino do envio`, convError);
        }
        if (!conv) {
            return apiError(corsHeaders, {
                status: 404,
                code: "conversation_not_found",
                message: `Conversa não encontrada: nenhuma conversa com o id ${conversationId} pertence ao user_id ${userId}. Confira se o conversation_id veio de bd_data.conversation_id e se o user_id é o da mesma conta.`,
            });
        }

        // Instagram tem função própria (instagram-send-message)
        if (!conv.instance_id) {
            return apiError(corsHeaders, {
                status: 400,
                code: "unsupported_channel",
                message: `A conversa ${conversationId} não está vinculada a uma conexão de WhatsApp${conv.instagram_instance_id ? " — é uma conversa do Instagram" : ""}. Esta API só envia por WhatsApp; para Instagram use a função instagram-send-message.`,
            });
        }

        const { data: instance, error: instanceError } = await supabase
            .from("instances")
            .select("id, user_id, provider, status")
            .eq("id", conv.instance_id)
            .maybeSingle();

        if (instanceError) {
            return dbErrorResponse(corsHeaders, "instance_lookup_failed",
                `buscar a conexão ${conv.instance_id} vinculada à conversa ${conversationId}`, instanceError);
        }
        if (!instance) {
            return apiError(corsHeaders, {
                status: 404,
                code: "instance_not_found",
                message: `A conexão ${conv.instance_id}, vinculada à conversa ${conversationId}, não existe mais no banco (foi removida). Reconecte a instância em Conexões ou envie por outra conversa.`,
            });
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
            } catch (decodeErr) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_base64",
                    message: "audio_base64 não é um base64 válido — a decodificação falhou. Envie o conteúdo do arquivo em base64 puro ou como data URI ('data:audio/ogg;base64,...').",
                    details: String((decodeErr as Error)?.message ?? decodeErr),
                });
            }

            // Rejeita payloads truncados/inválidos (ex.: expressão n8n não resolvida).
            // A Meta aceita o envio e falha async (131053) — melhor falhar aqui, síncrono.
            if (fileBytes.length < 1024) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_audio",
                    message: `audio_base64 decodificado tem apenas ${fileBytes.length} bytes — payload truncado ou inválido. Envie o base64 completo do arquivo de áudio.`,
                });
            }

            const ext = extByMime[effectiveMime.toLowerCase()] || "mp3";
            const fileName = `media/${conversationId}/${Date.now()}_api_audio.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from("media")
                .upload(fileName, fileBytes, { contentType: effectiveMime, cacheControl: "3600", upsert: true });

            if (uploadError) {
                return dbErrorResponse(corsHeaders, "audio_upload_failed",
                    `subir o áudio (${fileBytes.length} bytes, ${effectiveMime}) para o bucket 'media' em ${fileName}`, uploadError);
            }

            mediaUrl = supabase.storage.from("media").getPublicUrl(fileName).data.publicUrl;
        }

        // ── Delega para evolution-send-message ──
        // Ele decide o provider: instance.provider === 'meta' → meta-send-message
        // (Graph API); caso contrário → UAZAPI. Também salva a mensagem no banco.
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

        const provider = instance.provider === "meta" ? "meta" : "uazapi";

        let sendResp: Response;
        try {
            sendResp = await fetch(`${supabaseUrl}/functions/v1/evolution-send-message`, {
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
        } catch (fetchErr) {
            return apiError(corsHeaders, {
                status: 502,
                code: "send_dispatch_failed",
                message: `Não foi possível chamar a função de envio (evolution-send-message) para a conversa ${conversationId} — a mensagem NÃO foi enviada. Tente novamente; se persistir, verifique se a edge function evolution-send-message está publicada.`,
                details: String((fetchErr as Error)?.message ?? fetchErr),
                extra: { provider, conversation_id: conversationId },
            });
        }

        // lê como texto primeiro: erro do evolution-send-message pode não ser JSON
        // (ex.: 546/boot error), e engolir isso deixava a resposta sem motivo nenhum
        const rawSend = await sendResp.text();
        let sendBody: Record<string, unknown> = {};
        try {
            sendBody = rawSend ? JSON.parse(rawSend) : {};
        } catch {
            sendBody = {};
        }

        if (!sendResp.ok) {
            const detail = String(
                (sendBody as any)?.message || (sendBody as any)?.error || rawSend || ""
            ).slice(0, 500);
            return apiError(corsHeaders, {
                status: sendResp.status,
                code: "send_failed",
                message: `Falha ao enviar a mensagem pela conexão ${provider} da conversa ${conversationId}: evolution-send-message respondeu HTTP ${sendResp.status}${detail ? ` — ${detail}` : " sem detalhar o motivo"}.`,
                details: detail || undefined,
                extra: { provider, conversation_id: conversationId },
            });
        }

        return json({
            ...sendBody,
            provider,
            conversation_id: conversationId,
        }, sendResp.status);
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de envio de mensagem (api-send-message)", error);
    }
});
