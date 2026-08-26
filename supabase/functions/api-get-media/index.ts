import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import {
    apiError,
    dbErrorResponse,
    describeDbError,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";

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
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const userId: string | undefined = body!.user_id;
        const messageId: string | undefined = body!.message_id;
        const conversationId: string | undefined = body!.conversation_id;
        let mediaUrl: string | undefined = body!.media_url;

        const missing = missingFields(corsHeaders, body!, ["user_id"],
            "Envie o id da conta (bd_data.user_id no prompt da IA).");
        if (missing) return missing;

        // localizador é alternativa (um dos três), fora do alcance de missingFields
        if (!messageId && !conversationId && !mediaUrl) {
            return apiError(corsHeaders, {
                status: 400,
                code: "missing_media_locator",
                message: "Nenhum localizador de mídia informado: envie `message_id` (id do provider — messageid da UAZAPI ou wamid da Meta), `conversation_id` (pega a última mídia recebida na conversa) ou `media_url` (URL direta no bucket 'media').",
                details: `Campos recebidos: ${Object.keys(body!).join(", ") || "(nenhum)"}`,
            });
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

            const { data: msg, error: msgError } = await query.maybeSingle();

            if (msgError) {
                return dbErrorResponse(corsHeaders, "message_lookup_failed",
                    messageId
                        ? `buscar a mensagem de id do provider "${messageId}" na conta ${userId}`
                        : `buscar a última mensagem recebida com mídia da conversa ${conversationId}`,
                    msgError);
            }

            if (!msg?.media_url) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "media_not_found",
                    message: messageId
                        ? `Nenhuma mensagem com mídia salva foi encontrada para message_id "${messageId}" nesta conta. Confira se o id é o do provider (messageid da UAZAPI / wamid da Meta) e se o download original da mídia não falhou.`
                        : `A conversa ${conversationId} não tem nenhuma mensagem recebida com mídia salva. Confira o conversation_id ou envie o message_id da mídia desejada.`,
                });
            }

            mediaUrl = msg.media_url;
            messageType = msg.message_type;
            mimeType = msg.media_mimetype;
            fileName = msg.media_filename;

            // Provider da instância (informativo) — falha aqui NÃO derruba a resposta:
            // a mídia já foi localizada. Mas também não se inventa "uazapi" quando o
            // vínculo não pôde ser lido: `provider` fica null e o motivo vai pro log.
            const { data: conv, error: convError } = await supabase
                .from("conversations")
                .select("instance_id, instances(provider)")
                .eq("id", msg.conversation_id)
                .maybeSingle();

            if (convError) {
                console.warn("[api-get-media]", describeDbError(
                    `identificar o provider da conversa ${msg.conversation_id} (campo informativo)`, convError));
            } else if (!conv) {
                console.warn(`[api-get-media] conversa ${msg.conversation_id} da mensagem ${msg.id} não existe mais — provider não identificado`);
            } else if ((conv as any).instance_id && !(conv as any).instances) {
                console.warn(`[api-get-media] conexão ${(conv as any).instance_id} da conversa ${msg.conversation_id} não existe mais — provider não identificado`);
            } else {
                provider = (conv as any).instances?.provider === "meta" ? "meta" : "uazapi";
            }
        }

        // ── Baixa a mídia e converte para base64 ──
        let fileResp: Response;
        try {
            fileResp = await fetch(mediaUrl!, { signal: AbortSignal.timeout(30_000) });
        } catch (fetchErr) {
            const isTimeout = (fetchErr as Error)?.name === "TimeoutError" || (fetchErr as Error)?.name === "AbortError";
            return apiError(corsHeaders, {
                status: 504,
                code: isTimeout ? "media_fetch_timeout" : "media_fetch_unreachable",
                message: isTimeout
                    ? `O download da mídia passou de 30s e foi cancelado (URL: ${mediaUrl}). Tente novamente; se persistir, o arquivo pode estar indisponível no storage.`
                    : `Não foi possível acessar a URL da mídia (${mediaUrl}). Confira se a URL é válida e pública.`,
                details: String((fetchErr as Error)?.message ?? fetchErr),
            });
        }

        if (!fileResp.ok) {
            return apiError(corsHeaders, {
                status: 502,
                code: "media_fetch_failed",
                message: `Falha ao baixar a mídia (HTTP ${fileResp.status}) em ${mediaUrl}. O arquivo pode ter sido removido do bucket 'media' ou a URL expirou.`,
                details: `HTTP ${fileResp.status} ${fileResp.statusText}`,
            });
        }

        const bytes = new Uint8Array(await fileResp.arrayBuffer());
        if (bytes.length === 0) {
            return apiError(corsHeaders, {
                status: 502,
                code: "empty_media",
                message: `O arquivo de mídia baixado está vazio (0 bytes) em ${mediaUrl} — o upload original provavelmente falhou. Peça o reenvio da mídia ao cliente.`,
            });
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
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de download de mídia (api-get-media)", error);
    }
});
