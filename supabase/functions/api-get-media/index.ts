import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

/**
 * api-get-media
 *
 * API externa (n8n) para obter mídia recebida (áudio, imagem, documento...)
 * em base64, pronta para transcrição/análise.
 *
 * Funciona para AMBOS os providers de forma transparente: no inbound,
 * UAZAPI (downloadMediaFromUzapi) e Meta Cloud API (meta-webhook via Graph
 * API — GET /<media_id> → URL efêmera → download com Bearer) já salvam a
 * mídia no bucket público 'media' e gravam a URL em messages.media_url.
 * Esta API localiza a mensagem e devolve o conteúdo em base64.
 *
 * Auth: header `x-api-key` = SCHEDULING_API_KEY (mesmo das demais api-*).
 *
 * Body:
 *   user_id         (obrigatório) — dono da conta (bd_data.user_id)
 *   message_id      (opção 1) — id do provider (UAZAPI messageid ou wamid da
 *                    Meta), presente no payload encaminhado ao n8n
 *   conversation_id (opção 2) — pega a última mensagem inbound com mídia
 *   media_url       (opção 3) — URL direta da mídia (bucket 'media')
 *
 * Resposta: { success, base64, mime_type, message_type, file_name, media_url, provider }
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
        const messageId: string | undefined = body.message_id;
        const conversationId: string | undefined = body.conversation_id;
        let mediaUrl: string | undefined = body.media_url;

        if (!userId || (!messageId && !conversationId && !mediaUrl)) {
            return json({
                success: false,
                error: "missing_params",
                message: "Campos obrigatórios: user_id e message_id, conversation_id ou media_url",
            }, 400);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        let messageType: string | null = null;
        let mimeType: string | null = null;
        let fileName: string | null = null;
        let provider: string | null = null;

        // ── Localiza a mensagem (quando não veio media_url direta) ──
        if (!mediaUrl) {
            let query = supabase
                .from("messages")
                .select("id, media_url, media_mimetype, media_filename, message_type, conversation_id")
                .eq("user_id", userId)
                .not("media_url", "is", null)
                .order("created_at", { ascending: false })
                .limit(1);

            if (messageId) {
                query = query.eq("evolution_id", messageId);
            } else {
                query = query.eq("conversation_id", conversationId).eq("direction", "inbound");
            }

            const { data: msg } = await query.maybeSingle();

            if (!msg?.media_url) {
                return json({
                    success: false,
                    error: "media_not_found",
                    message: "Mensagem com mídia não encontrada (a mídia pode ter falhado no download original)",
                }, 404);
            }

            mediaUrl = msg.media_url;
            messageType = msg.message_type;
            mimeType = msg.media_mimetype;
            fileName = msg.media_filename;

            // Provider da instância (informativo)
            const { data: conv } = await supabase
                .from("conversations")
                .select("instance_id, instances(provider)")
                .eq("id", msg.conversation_id)
                .maybeSingle();
            provider = (conv as any)?.instances?.provider === "meta" ? "meta" : "uazapi";
        }

        // ── Baixa a mídia e converte para base64 ──
        const fileResp = await fetch(mediaUrl!, { signal: AbortSignal.timeout(30_000) });
        if (!fileResp.ok) {
            console.error("[api-get-media] media fetch failed:", fileResp.status, mediaUrl);
            return json({
                success: false,
                error: "media_fetch_failed",
                message: `Falha ao baixar a mídia (HTTP ${fileResp.status})`,
            }, 502);
        }

        const bytes = new Uint8Array(await fileResp.arrayBuffer());
        if (bytes.length === 0) {
            return json({ success: false, error: "empty_media", message: "Arquivo de mídia vazio" }, 502);
        }

        const effectiveMime = mimeType || fileResp.headers.get("content-type") || "application/octet-stream";

        return json({
            success: true,
            base64: base64Encode(bytes),
            mime_type: effectiveMime,
            message_type: messageType,
            file_name: fileName,
            media_url: mediaUrl,
            provider,
            size_bytes: bytes.length,
        });
    } catch (error: any) {
        console.error("[api-get-media] Error:", error?.message, error?.stack);
        return json({
            success: false,
            error: "internal_error",
            message: error?.message || "Erro desconhecido",
        }, 500);
    }
});
