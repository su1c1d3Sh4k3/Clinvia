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
 *   number          (obrigatório*) — número do cliente (qualquer formato)
 *   text            (obrigatório**) — texto da mensagem
 *   audio_base64    (obrigatório**) — áudio em base64 (aceita data URI); enviado como PTT/voz
 *   mime_type       (opcional)   — mime do áudio (default audio/mpeg)
 *   instance_id     (obrigatório) — instância que recebeu a mensagem (bd_data.instance_id)
 *   conversation_id (opcional)   — se enviado, pula a resolução por número
 *   contact_id      (opcional)   — se enviado, pula a busca de contato por número
 *   (* dispensável quando conversation_id ou contact_id são enviados)
 *   (** enviar text OU audio_base64)
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
        const number: string | undefined = body.number || body.phone_number;
        const text: string | undefined = body.text;
        const audioBase64: string | undefined = body.audio_base64 || body.audio;
        const mimeType: string = body.mime_type || "audio/mpeg";
        const instanceId: string | undefined = body.instance_id;
        let conversationId: string | undefined = body.conversation_id;
        let contactId: string | undefined = body.contact_id;

        if (!userId || !instanceId || (!text && !audioBase64)) {
            return json({
                success: false,
                error: "missing_params",
                message: "Campos obrigatórios: user_id, instance_id e text ou audio_base64 (+ number, conversation_id ou contact_id)",
            }, 400);
        }
        if (!conversationId && !contactId && !number) {
            return json({
                success: false,
                error: "missing_recipient",
                message: "Informe number, contact_id ou conversation_id para identificar o destinatário",
            }, 400);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // ── Valida instância e ownership ──
        const { data: instance } = await supabase
            .from("instances")
            .select("id, user_id, provider, status")
            .eq("id", instanceId)
            .eq("user_id", userId)
            .maybeSingle();

        if (!instance) {
            return json({
                success: false,
                error: "instance_not_found",
                message: "Instância não encontrada para este user_id",
            }, 404);
        }

        // ── Resolve conversa ──
        if (!conversationId) {
            // 1. Resolve contato pelo número, se necessário
            if (!contactId) {
                const cleaned = (number || "").replace(/\D/g, "");
                if (!cleaned) {
                    return json({ success: false, error: "invalid_number", message: "Número inválido" }, 400);
                }
                const { data: contact } = await supabase
                    .from("contacts")
                    .select("id")
                    .eq("user_id", userId)
                    .ilike("number", `${cleaned}%`)
                    .limit(1)
                    .maybeSingle();
                if (!contact) {
                    return json({
                        success: false,
                        error: "contact_not_found",
                        message: `Contato não encontrado para o número ${number}`,
                    }, 404);
                }
                contactId = contact.id;
            }

            // 2. Conversa aberta/pendente mais recente (prioriza a da instância informada)
            const { data: convs } = await supabase
                .from("conversations")
                .select("id, instance_id")
                .eq("user_id", userId)
                .eq("contact_id", contactId)
                .in("status", ["pending", "open"])
                .order("created_at", { ascending: false })
                .limit(5);

            const match = (convs || []).find((c) => c.instance_id === instanceId) || (convs || [])[0];
            if (!match) {
                return json({
                    success: false,
                    error: "conversation_not_found",
                    message: "Nenhuma conversa aberta ou pendente encontrada para este contato",
                }, 404);
            }
            conversationId = match.id;
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
