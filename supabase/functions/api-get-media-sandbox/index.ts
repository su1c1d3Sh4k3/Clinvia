import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { fetchProvider } from "../_shared/provider-errors.ts";
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";
import { loadSandboxContext, logSandboxCall } from "../_shared/sandbox.ts";

/**
 * api-get-media-sandbox
 *
 * Gêmea de `api-get-media` no ambiente de teste. Contrato de payload e de
 * resposta IDÊNTICO ao de produção — muda só a origem: a mídia é procurada em
 * `sandbox_messages`, nunca nas mensagens reais da conta.
 *
 * Por que existe: o fluxo do n8n usa esta tool para transcrever o áudio que o
 * paciente mandou. Sem a gêmea, o nó do sandbox apontava para a função de
 * PRODUÇÃO — que só não devolveu mídia de ninguém porque filtra por
 * `conversation_id`, e o id do teste não existe lá. Proteção por acidente não
 * é proteção.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body:
 *   user_id         (obrigatório) — dono da conta (bd_data.user_id)
 *   message_id      (opção 1) — id da mensagem do teste
 *   conversation_id (opção 2) — pega a última mensagem do paciente com mídia
 *   media_url       (opção 3) — URL direta da mídia
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-origin",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
}

serveMonitored("api-get-media-sandbox", async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const messageId: string | undefined = body!.message_id;
        const conversationId: string | undefined = body!.conversation_id;
        let mediaUrl: string | undefined = body!.media_url;

        const missing = missingFields(corsHeaders, body!, ["user_id"],
            "Envie o id da conta (bd_data.user_id no prompt da IA).");
        if (missing) return missing;

        if (!messageId && !conversationId && !mediaUrl) {
            return apiError(corsHeaders, {
                status: 400,
                code: "missing_media_locator",
                message: "Nenhum localizador de mídia informado: envie `message_id` (id da mensagem do ambiente de teste), `conversation_id` (pega a última mídia recebida na conversa do teste) ou `media_url` (URL direta no bucket 'media').",
                details: `Campos recebidos: ${Object.keys(body!).join(", ") || "(nenhum)"}`,
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const ctx = await loadSandboxContext(supabase, {
            conversationId,
            userId: body!.user_id,
        });

        let messageType: string | null = null;

        // ── Localiza a mensagem do TESTE (quando não veio media_url direta) ──
        if (!mediaUrl) {
            let query = supabase
                .from("sandbox_messages")
                .select("id, media_url, message_type")
                .eq("session_id", ctx.session.id)
                .not("media_url", "is", null)
                .order("created_at", { ascending: false })
                .limit(1);

            if (messageId) {
                query = query.eq("id", messageId);
            } else {
                query = query.eq("conversation_id", ctx.conversation.id).eq("role", "user");
            }

            const { data: msg, error: msgError } = await query.maybeSingle();

            if (msgError) {
                return dbErrorResponse(corsHeaders, "message_lookup_failed",
                    messageId
                        ? `buscar a mensagem ${messageId} no ambiente de teste`
                        : `buscar a última mensagem com mídia da conversa do ambiente de teste`,
                    msgError, req);
            }

            if (!msg?.media_url) {
                // O fluxo do n8n chama esta tool ÀS CEGAS em toda mensagem que
                // entra e deixa o Switch decidir depois (`onError` é
                // `continueRegularOutput`, então o 404 não quebra nada). Numa
                // conversa de texto isso é o esperado, não uma falha — e pintar
                // de vermelho no painel do ambiente de teste, uma vez por
                // mensagem, ensina o cliente a ignorar a cor. Só é falha quando
                // alguém pediu uma mídia NOMEADA (`message_id`) e ela não existe.
                await logSandboxCall(supabase, ctx, {
                    function_name: "api-get-media-sandbox",
                    label: messageId
                        ? `Procurou a mídia da mensagem ${messageId} e não encontrou`
                        : "Conferiu se o paciente mandou mídia — esta mensagem é só texto",
                    ok: !messageId,
                    status_code: 404,
                    request: body,
                });
                return apiError(corsHeaders, {
                    status: 404,
                    code: "media_not_found",
                    message: messageId
                        ? `Nenhuma mensagem com mídia foi encontrada para message_id "${messageId}" no ambiente de teste.`
                        : "A conversa do ambiente de teste não tem nenhuma mensagem do paciente com mídia. Mande um áudio ou uma imagem no chat do teste antes de pedir a transcrição.",
                });
            }

            mediaUrl = msg.media_url;
            messageType = msg.message_type;
        }

        // ── Baixa a mídia e converte para base64 ──
        let fileResp: Response;
        try {
            fileResp = await fetchProvider(mediaUrl!, { signal: AbortSignal.timeout(30_000) });
        } catch (fetchErr) {
            const isTimeout = (fetchErr as Error)?.name === "TimeoutError" || (fetchErr as Error)?.name === "AbortError";
            return apiError(corsHeaders, {
                status: 504,
                code: isTimeout ? "media_fetch_timeout" : "media_fetch_unreachable",
                message: isTimeout
                    ? `O download da mídia do teste passou de 30s e foi cancelado (URL: ${mediaUrl}).`
                    : `Não foi possível acessar a URL da mídia do teste (${mediaUrl}). Confira se a URL é válida e pública.`,
                details: String((fetchErr as Error)?.message ?? fetchErr),
            });
        }

        if (!fileResp.ok) {
            return apiError(corsHeaders, {
                status: 502,
                code: "media_fetch_failed",
                message: `Falha ao baixar a mídia do teste (HTTP ${fileResp.status}) em ${mediaUrl}. O arquivo pode ter sido removido do bucket 'media'.`,
                details: `HTTP ${fileResp.status} ${fileResp.statusText}`,
            });
        }

        const bytes = new Uint8Array(await fileResp.arrayBuffer());
        if (bytes.length === 0) {
            return apiError(corsHeaders, {
                status: 502,
                code: "empty_media",
                message: `O arquivo de mídia do teste baixado está vazio (0 bytes) em ${mediaUrl} — o upload original provavelmente falhou. Mande a mídia de novo no chat do teste.`,
            });
        }

        const effectiveMime = fileResp.headers.get("content-type") || "application/octet-stream";

        await logSandboxCall(supabase, ctx, {
            function_name: "api-get-media-sandbox",
            label: `Baixou a mídia que o paciente mandou (${messageType || "arquivo"}, ${bytes.length} bytes)`,
            request: body,
        });

        return json({
            success: true,
            base64: base64Encode(bytes),
            mime_type: effectiveMime,
            message_type: messageType,
            file_name: null,
            media_url: mediaUrl,
            provider: "sandbox",
            size_bytes: bytes.length,
        });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de download de mídia do ambiente de teste (api-get-media-sandbox)", error, req);
    }
});
