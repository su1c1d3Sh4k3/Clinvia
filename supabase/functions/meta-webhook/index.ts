import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";
import { reportIncident } from "../_shared/report-incident.ts";
import { fetchProvider } from "../_shared/provider-errors.ts";
/**
 * meta-webhook
 *
 * Receives webhooks from Meta WhatsApp Cloud API, normalizes the payload
 * to the UZAPI format that webhook-handle-message already understands,
 * then forwards internally. ZERO changes to existing webhook handler.
 *
 * Also handles:
 * - GET: Webhook verification (hub.challenge)
 * - POST statuses: Normalizes to webhook-handle-status format
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-origin",
};

// ── Helpers ──

async function validateMetaSignature(
    rawBody: string,
    signatureHeader: string | null,
    appSecret: string
): Promise<boolean> {
    if (!signatureHeader || !appSecret) return false;
    try {
        const providedSignature = signatureHeader.replace(/^sha256=/, "");
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(appSecret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const signature = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(rawBody)
        );
        const computedHex = new TextDecoder().decode(
            hexEncode(new Uint8Array(signature))
        );
        if (computedHex.length !== providedSignature.length) return false;
        let result = 0;
        for (let i = 0; i < computedHex.length; i++) {
            result |= computedHex.charCodeAt(i) ^ providedSignature.charCodeAt(i);
        }
        return result === 0;
    } catch {
        return false;
    }
}

/** Identidade do corpo bruto — é o que faz reentrega da Meta conflitar em vez de duplicar. */
async function sha256Hex(texto: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return new TextDecoder().decode(hexEncode(new Uint8Array(digest)));
}

/**
 * Só navegação no JSON que já está em memória — nenhuma consulta. A regra da
 * gravação bruta é "sem join, sem lookup", e o nome da instância existe aqui
 * apenas para que a linha da fila seja diagnosticável a olho nu.
 */
function phoneNumberIdDoPayload(payload: any): string | null {
    for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            const id = change?.value?.metadata?.phone_number_id;
            if (id) return String(id);
        }
    }
    return null;
}

function mapMetaTypeToUzapi(metaType: string): string {
    const map: Record<string, string> = {
        text: "conversation",
        image: "imagemessage",
        audio: "audiomessage",
        video: "videomessage",
        document: "documentmessage",
        sticker: "stickermessage",
        reaction: "reactionmessage",
        interactive: "conversation",
        button: "conversation",
        location: "conversation",
        contacts: "conversation",
    };
    return map[metaType] || "conversation";
}

function extractTextFromMeta(msg: any): string {
    if (msg.type === "text") return msg.text?.body || "";
    if (msg.type === "interactive") {
        const it = msg.interactive || {};
        // Resposta de botão/lista enviada pelo cliente
        const replyTitle = it.button_reply?.title || it.list_reply?.title;
        if (replyTitle) return replyTitle;
        // Menu interativo RECEBIDO (list/button/cta de outro bot/empresa):
        // renderiza como texto com as opções para aparecer no inbox
        const parts: string[] = [];
        if (it.header?.text) parts.push(`*${it.header.text}*`);
        if (it.body?.text) parts.push(it.body.text);
        const opts: string[] = [];
        for (const b of it.action?.buttons || []) {
            const t = b.reply?.title || b.title || b.text;
            if (t) opts.push(`▪ ${t}`);
        }
        for (const s of it.action?.sections || []) {
            if (s.title) opts.push(`*${s.title}*`);
            for (const r of s.rows || []) {
                if (r.title) opts.push(`▪ ${r.title}${r.description ? ` — ${r.description}` : ""}`);
            }
        }
        if (it.action?.name === "cta_url" && it.action?.parameters?.display_text) {
            opts.push(`🔗 ${it.action.parameters.display_text}: ${it.action.parameters.url || ""}`);
        }
        if (opts.length > 0) parts.push(opts.join("\n"));
        if (it.footer?.text) parts.push(`_${it.footer.text}_`);
        return parts.join("\n\n") || "📋 Mensagem interativa (menu de opções)";
    }
    // Tipo não suportado pela Cloud API (ex.: menu interativo de outro bot) —
    // Meta não entrega o conteúdo, só o aviso. Mostra placeholder no inbox.
    if (msg.type === "unsupported") {
        return "⚠️ Mensagem interativa não suportada pela API do WhatsApp — o conteúdo (menu de opções) só é visível no aplicativo do celular.";
    }
    if (msg.type === "button") return msg.button?.text || "";
    if (msg.type === "reaction") return msg.reaction?.emoji || "";
    if (msg.type === "location") {
        const loc = msg.location || {};
        return `📍 ${loc.name || "Localização"} (${loc.latitude}, ${loc.longitude})`;
    }
    if (msg.type === "contacts") {
        const c = msg.contacts?.[0];
        return c?.name?.formatted_name || "Contato compartilhado";
    }
    return msg[msg.type]?.caption || "";
}

function extractContentFromMeta(msg: any): any {
    const content: any = {};

    // Context info (reply)
    if (msg.context) {
        content.contextInfo = {
            stanzaID: msg.context.message_id || null,
            quotedMessage: null,
            participant: msg.context.from
                ? `${msg.context.from}@s.whatsapp.net`
                : null,
        };
    }

    // Media metadata
    const mediaObj = msg[msg.type];
    if (mediaObj) {
        if (mediaObj.filename) content.fileName = mediaObj.filename;
        if (mediaObj.mime_type) content.mimetype = mediaObj.mime_type;
        // Store media ID for download
        if (mediaObj.id) content._meta_media_id = mediaObj.id;
        if (mediaObj.caption) content.text = mediaObj.caption;
    }

    // Interactive button response
    if (msg.type === "interactive") {
        const br = msg.interactive?.button_reply;
        const lr = msg.interactive?.list_reply;
        if (br) {
            content.selectedID = br.id || "";
            content.selectedDisplayText = br.title || "";
        }
        if (lr) {
            content.selectedID = lr.id || "";
            content.selectedDisplayText = lr.title || "";
        }
    }

    // Reaction
    if (msg.type === "reaction") {
        content.reactionMessageId = msg.reaction?.message_id || null;
    }

    return content;
}

async function downloadMetaMedia(
    mediaId: string,
    accessToken: string,
    supabase: any,
    conversationId: string,
    mimeType?: string
): Promise<string | null> {
    try {
        // Step 1: Get temporary URL
        const metaResp = await fetchProvider(
            `https://graph.facebook.com/v22.0/${mediaId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!metaResp.ok) {
            console.error("[meta-webhook] Media URL fetch failed:", metaResp.status);
            return null;
        }
        const metaData = await metaResp.json();
        const url = metaData.url;
        const mime = metaData.mime_type || mimeType || "application/octet-stream";

        // Step 2: Download binary
        const fileResp = await fetchProvider(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(30_000),
        });
        if (!fileResp.ok) {
            console.error("[meta-webhook] Media download failed:", fileResp.status);
            return null;
        }
        const fileBlob = await fileResp.blob();
        if (fileBlob.size < 100) {
            console.warn("[meta-webhook] Media too small, skipping");
            return null;
        }

        // Step 3: Upload to Storage
        const extMap: Record<string, string> = {
            "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
            "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
            "video/mp4": "mp4", "video/3gp": "3gp",
            "application/pdf": "pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        };
        const ext = extMap[mime] || mime.split("/")[1] || "bin";
        const fileName = `media/${conversationId}/${Date.now()}_${mediaId}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from("media")
            .upload(fileName, fileBlob, {
                contentType: mime,
                cacheControl: "3600",
                upsert: true,
            });

        if (uploadError) {
            console.error("[meta-webhook] Upload error:", uploadError);
            return null;
        }

        const { data: publicUrlData } = supabase.storage
            .from("media")
            .getPublicUrl(fileName);
        return publicUrlData.publicUrl;
    } catch (err) {
        console.error("[meta-webhook] downloadMetaMedia error:", err);
        return null;
    }
}

// ── Alertas do Super Admin: reconciliacao do wamid ───────────────────────────
//
// alert-notify fala direto com o Graph e NAO cria linha em `messages` (senao
// cada erro da plataforma viraria contato + conversa + card no inbox do tenant
// Bruno Admin). O preco disso e que webhook-handle-status nao tem em que casar
// o status: a falha assincrona da Meta caia no chao. Foi assim que 13 alertas
// recusados com 131047 ("Re-engagement message", janela de 24h fechada)
// ficaram gravados como 'sent' e o canal passou 19h mudo com o painel verde
// em 23-24/09/2026.
//
// Aqui o casamento e feito pelo wamid. Nao da para chamar a RPC em todo status
// — seriam milhares por dia de mensagem de tenant. O corte e o telefone do
// destinatario (`status.recipient_id`), comparado com a lista de destinatarios
// de alerta, que tem meia duzia de linhas e muda quase nunca: cache de 5 min.

const alertaCache: { fones: Set<string> | null; ate: number } = { fones: null, ate: 0 };

/** Ultimos 8 digitos — a regra de identidade de telefone do projeto. */
const last8 = (s: string) => String(s || "").replace(/\D/g, "").slice(-8);

async function fonesDeAlerta(supabase: any): Promise<Set<string>> {
    if (alertaCache.fones) return alertaCache.fones;
    const { data, error } = await supabase.from("alert_recipients").select("telefone");
    if (error) {
        // Sem a lista o corte fica aberto demais ou fechado demais; um Set vazio
        // apenas pula a reconciliacao desta rodada, que o proximo status refaz.
        console.error("[meta-webhook] alert_recipients:", error.message);
        return new Set<string>();
    }
    const set = new Set<string>((data ?? []).map((r: any) => last8(r.telefone)).filter(Boolean));
    alertaCache.fones = set;
    alertaCache.ate = Date.now() + 5 * 60 * 1000;
    return set;
}

/** Nunca lanca: reconciliacao e rastro, nao pode derrubar o webhook da Meta. */
async function reconciliarAlerta(supabase: any, status: any): Promise<void> {
    try {
        const alvo = last8(status?.recipient_id ?? "");
        if (!alvo || !status?.id) return;
        if (!["failed", "delivered", "read"].includes(status.status)) return;
        const fones = await fonesDeAlerta(supabase);
        if (!fones.has(alvo)) return;

        const err = Array.isArray(status.errors) ? status.errors[0] : null;
        const { data, error } = await supabase.rpc("alert_notification_status", {
            p_wamid: status.id,
            p_status: status.status,
            p_error_code: err?.code != null ? String(err.code) : null,
            p_error_message: err
                ? String(err.error_data?.details || err.message || err.title || "")
                : null,
        });
        if (error) {
            console.error("[meta-webhook] alert_notification_status:", error.message);
        } else if (data === true) {
            console.log(
                `[meta-webhook] alerta reconciliado: ${status.id} -> ${status.status}` +
                    (err ? ` (${err.code})` : ""),
            );
        }
    } catch (e) {
        console.error("[meta-webhook] reconciliarAlerta:", (e as Error).message);
    }
}

/**
 * Ele respondeu: a janela de 24h reabre e o proximo alerta volta a sair como
 * texto livre (layout completo) em vez de template.
 */
async function marcarJanelaDeAlerta(supabase: any, telefone: string): Promise<void> {
    try {
        const alvo = last8(telefone);
        if (!alvo) return;
        const fones = await fonesDeAlerta(supabase);
        if (!fones.has(alvo)) return;
        await supabase.rpc("alert_recipient_inbound", { p_telefone: telefone });
        console.log(`[meta-webhook] janela de alerta reaberta para ...${alvo}`);
    } catch (e) {
        console.error("[meta-webhook] marcarJanelaDeAlerta:", (e as Error).message);
    }
}

// ── Main handler ──

serveMonitored("meta-webhook", async (req) => {
    // CORS
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // ── GET: Webhook verification ──
    if (req.method === "GET") {
        const url = new URL(req.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");

        if (mode === "subscribe" && token === verifyToken) {
            console.log("[meta-webhook] Verification OK, returning challenge");
            return new Response(challenge, { status: 200 });
        }
        console.warn("[meta-webhook] Verification FAILED");
        return new Response("Forbidden", { status: 403 });
    }

    // ── POST: Event notifications ──
    // Declarados FORA do try porque o `catch` também precisa devolver a linha
    // bruta para a fila. Se ele não puder, a mensagem fica presa em
    // `processing` até o cron `reset-stuck-webhook-jobs` (15 min) — funciona,
    // mas atrasa justamente o caso em que a pressa importa.
    let filaId: string | null = null;
    let clienteDaFila: ReturnType<typeof createClient> | null = null;

    try {
        const rawBody = await req.text();

        // Validate HMAC-SHA256 signature
        const appSecret = Deno.env.get("META_APP_SECRET");
        const signature = req.headers.get("x-hub-signature-256");
        console.log("[meta-webhook] POST received, signature:", signature ? "present" : "absent", "body length:", rawBody.length);
        if (appSecret && signature) {
            const isValid = await validateMetaSignature(rawBody, signature, appSecret);
            if (!isValid) {
                console.warn("[meta-webhook] Invalid signature — processing anyway for diagnostics");
                // Don't reject during testing phase
            }
        }

        const payload = JSON.parse(rawBody);

        if (payload.object !== "whatsapp_business_account") {
            return new Response("OK", { status: 200 });
        }

        // Zera o cache de telefones de alerta se ele venceu. Ver alertaCache.
        if (Date.now() > alertaCache.ate) alertaCache.fones = null;

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);
        clienteDaFila = supabase;

        // ── Gravação bruta: nada que a Meta entregou pode sumir ──────────────
        //
        // Até 25/09/2026 este caminho não tinha fila. O payload era normalizado
        // em memória, repassado adiante e ESQUECIDO — se o processamento caísse,
        // não sobrava nada para reprocessar e a Meta já tinha recebido 200.
        //
        // A escrita é deliberadamente burra: sem join, sem lookup, sem await de
        // nada que dependa de outra tabela. Quanto menos ela precisa do banco
        // estar saudável, mais ela sobrevive justamente à hora em que ele não
        // está — que é a hora em que ela serve para alguma coisa.
        const filaIdDoReprocessamento = req.headers.get("x-fila-id");
        filaId = filaIdDoReprocessamento;

        if (!filaId) {
            try {
                const { data: linha, error: filaErr } = await supabase
                    .from("webhook_queue")
                    .insert({
                        instance_name: `meta:${phoneNumberIdDoPayload(payload) ?? "desconhecido"}`,
                        event_type: "meta_raw",
                        payload,
                        body_sha256: await sha256Hex(rawBody),
                        status: "processing",
                        started_at: new Date().toISOString(),
                    })
                    .select("id")
                    .single();

                if (filaErr) {
                    // 23505 = a Meta reentregou um corpo idêntico. O original já
                    // está na fila (ou já foi processado): seguir adiante criaria
                    // a duplicata que a reentrega existe para evitar.
                    if (filaErr.code === "23505") {
                        console.log("[meta-webhook] Reentrega do mesmo corpo — ignorada");
                        return new Response("OK", { status: 200 });
                    }
                    throw filaErr;
                }
                filaId = linha?.id ?? null;
            } catch (filaErr: any) {
                // Sem a linha bruta não há rede de segurança: daqui para a frente
                // a mensagem depende inteiramente do processamento em linha dar
                // certo. Segue mesmo assim (tentar é melhor que desistir), mas
                // avisa — é a falha mais grave deste caminho.
                console.error("[meta-webhook] FALHA ao gravar payload bruto:", filaErr);
                reportIncident({
                    component: "recebimento:nao-gravado",
                    route: "fila",
                    httpCode: 500,
                    error: filaErr,
                    message: "webhook da Meta nao conseguiu gravar o corpo bruto na fila de entrada",
                });
            }
        }

        // Vira true quando QUALQUER repasse não voltou 2xx. É o que decide se a
        // linha bruta pode ser dada por processada.
        let algumRepasseFalhou = false;

        for (const entry of payload.entry || []) {
            for (const change of entry.changes || []) {
                // ── TEMPLATE STATUS UPDATE (aprovação/rejeição de templates) ──
                if (change.field === "message_template_status_update") {
                    const value = change.value || {};
                    const event = value.event; // APPROVED | REJECTED | PENDING | DISABLED | PAUSED
                    const metaTemplateId = value.message_template_id != null ? String(value.message_template_id) : null;
                    const templateName = value.message_template_name || null;
                    const templateLanguage = value.message_template_language || null;
                    const reason = value.reason && value.reason !== "NONE" ? value.reason : null;
                    const wabaId = entry.id || null;

                    if (!event) continue;

                    console.log("[meta-webhook] Template status update:", templateName, "→", event, reason || "");

                    const updates = {
                        status: event,
                        rejection_reason: reason,
                        updated_at: new Date().toISOString(),
                    };

                    let updated = false;
                    if (metaTemplateId) {
                        const { data: byId } = await supabase
                            .from("message_templates")
                            .update(updates)
                            .eq("meta_template_id", metaTemplateId)
                            .select("id");
                        updated = !!byId && byId.length > 0;
                    }
                    if (!updated && wabaId && templateName) {
                        let query = supabase
                            .from("message_templates")
                            .update(updates)
                            .eq("waba_id", wabaId)
                            .eq("name", templateName);
                        if (templateLanguage) query = query.eq("language", templateLanguage);
                        await query;
                    }
                    continue;
                }

                // smb_message_echoes = mensagens enviadas pelo app do WhatsApp Business
                // (modo coexistência) — precisam ser salvas como outbound
                const isEcho = change.field === "smb_message_echoes";
                if (change.field !== "messages" && !isEcho) {
                    console.log("[meta-webhook] Skipping unhandled field:", change.field);
                    continue;
                }

                const value = change.value;
                const phoneNumberId = value.metadata?.phone_number_id;

                if (!phoneNumberId) continue;

                // Find instance by meta_phone_number_id
                const { data: instance } = await supabase
                    .from("instances")
                    .select("id, instance_name, apikey, user_id, meta_access_token, meta_waba_id, webhook_url, ia_on_wpp, server_url")
                    .eq("meta_phone_number_id", phoneNumberId)
                    .eq("provider", "meta")
                    .maybeSingle();

                if (!instance) {
                    console.warn("[meta-webhook] No instance for phone_number_id:", phoneNumberId, "— creating temporary test instance is not needed, just logging payload for mapping");
                    // During testing: still process even without instance to validate webhook reception
                    console.log("[meta-webhook] PAYLOAD RECEIVED (no instance):", JSON.stringify(value).substring(0, 500));
                    continue;
                }

                const accessToken = instance.meta_access_token;

                // ── MESSAGES (inbound) / MESSAGE ECHOES (outbound via app) ──
                const incomingMsgs = isEcho
                    ? (value.message_echoes || [])
                    : (value.messages || []);
                if (incomingMsgs.length > 0) {
                    for (const msg of incomingMsgs) {
                        const contact = value.contacts?.[0];
                        const content = extractContentFromMeta(msg);
                        // Nos echoes, "from" é o número da clínica e "to" é o cliente —
                        // o chat/contato deve sempre apontar para o cliente
                        const peer = isEcho ? (msg.to || msg.recipient_id || "") : msg.from;
                        if (!peer) continue;

                        // Resposta de um destinatario de alerta reabre a janela
                        // de 24h. Echo nao conta: `peer` ali e o cliente, e a
                        // janela so reabre com mensagem RECEBIDA.
                        if (!isEcho) await marcarJanelaDeAlerta(supabase, msg.from || peer);

                        const msgText = extractTextFromMeta(msg);
                        const mediaMsgTypes = ["image", "audio", "video", "document", "sticker"];
                        if (!msgText && !mediaMsgTypes.includes(msg.type)) {
                            // Diagnóstico: tipo de mensagem que resultou em texto vazio (bolha invisível no inbox)
                            console.log("[meta-webhook] Empty text for msg type:", msg.type, JSON.stringify(msg).substring(0, 800));
                        }

                        // Build normalized UZAPI-format payload
                        const normalizedPayload = {
                            instanceName: instance.instance_name,
                            EventType: "messages",
                            message: {
                                messageid: msg.id,
                                sender: peer,
                                sender_pn: peer,
                                pushName: isEcho ? "" : (contact?.profile?.name || ""),
                                messageType: mapMetaTypeToUzapi(msg.type),
                                text: msgText,
                                fromMe: isEcho,
                                timestamp: parseInt(msg.timestamp) || Math.floor(Date.now() / 1000),
                                isGroup: false,
                                chatid: peer,
                                content: content,
                                vote: content.selectedDisplayText || "",
                                selectedDisplayText: content.selectedDisplayText || "",
                                reaction: msg.type === "reaction" ? msg.reaction?.message_id : undefined,
                            },
                            chat: {
                                wa_chatid: peer,
                                wa_name: isEcho ? "" : (contact?.profile?.name || ""),
                                name: isEcho ? "" : (contact?.profile?.name || ""),
                            },
                            // Flag for meta-specific processing
                            _meta: {
                                phone_number_id: phoneNumberId,
                                media_id: content._meta_media_id || null,
                                access_token: accessToken,
                            },
                        };

                        // If media message, download first then attach URL
                        const mediaTypes = ["image", "audio", "video", "document", "sticker"];
                        if (mediaTypes.includes(msg.type) && content._meta_media_id && accessToken) {
                            // We need conversation_id for storage path — use a temp path
                            // The actual message save happens in webhook-handle-message
                            // For now, download to a temp conversation path
                            const mediaUrl = await downloadMetaMedia(
                                content._meta_media_id,
                                accessToken,
                                supabase,
                                `meta-pending-${peer}`,
                                content.mimetype
                            );
                            if (mediaUrl) {
                                // Inject media URL so webhook-handle-message skips UZAPI download
                                normalizedPayload.message.content._meta_media_url = mediaUrl;
                            }
                        }

                        // Forward to webhook-handle-message
                        console.log("[meta-webhook] Forwarding message to webhook-handle-message:", msg.id);
                        try {
                            const resp = await fetchProvider(
                                `${supabaseUrl}/functions/v1/webhook-handle-message`,
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${serviceKey}`,
                                    },
                                    body: JSON.stringify(normalizedPayload),
                                }
                            );
                            const result = await resp.text();
                            console.log("[meta-webhook] webhook-handle-message response:", resp.status, result);
                            // A resposta era LIDA e DESCARTADA: o handler podia
                            // responder que a mensagem não virou conversa e este
                            // laço seguia até o 200 final para a Meta. Era aqui
                            // que a mensagem do paciente deixava de existir.
                            if (!resp.ok) algumRepasseFalhou = true;
                        } catch (fwdErr) {
                            console.error("[meta-webhook] Forward error:", fwdErr);
                            algumRepasseFalhou = true;
                        }
                    }
                }

                // ── STATUSES ──
                if (value.statuses && value.statuses.length > 0) {
                    for (const status of value.statuses) {
                        const statusMap: Record<string, string> = {
                            sent: "Sent",
                            delivered: "Delivered",
                            read: "Read",
                            failed: "Failed",
                        };

                        const erroDaMeta = status.errors?.[0];

                        const normalizedStatus = {
                            instanceName: instance.instance_name,
                            type: "ReadReceipt",
                            EventType: "messages_update",
                            state: statusMap[status.status] || "Sent",
                            event: { MessageIDs: [status.id] },
                            // A Meta so diz POR QUE a mensagem morreu aqui, no
                            // recibo assincrono. Ate 24/09/2026 este motivo ia
                            // para o `console.error` da linha abaixo e acabava
                            // ali: o `webhook-handle-status` marcava `failed`
                            // sem saber de que, e nao havia como distinguir
                            // "numero nao existe" de "template pausado". Sao
                            // problemas diferentes, com donos diferentes.
                            erro: erroDaMeta
                                ? {
                                    code: erroDaMeta.code ?? null,
                                    title: erroDaMeta.title ?? null,
                                    details: erroDaMeta.error_data?.details ?? null,
                                }
                                : null,
                        };

                        // Log failures
                        if (status.status === "failed" && status.errors) {
                            console.error("[meta-webhook] Message failed:", status.id, JSON.stringify(status.errors));
                        }

                        // Alerta do Super Admin nao tem linha em `messages`:
                        // o webhook-handle-status abaixo nao encontraria nada
                        // para atualizar. O casamento e aqui, pelo wamid.
                        await reconciliarAlerta(supabase, status);

                        // Forward to webhook-handle-status
                        try {
                            const respStatus = await fetchProvider(
                                `${supabaseUrl}/functions/v1/webhook-handle-status`,
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${serviceKey}`,
                                    },
                                    body: JSON.stringify(normalizedStatus),
                                }
                            );
                            if (!respStatus.ok) {
                                console.error(
                                    "[meta-webhook] webhook-handle-status recusou:",
                                    respStatus.status,
                                    await respStatus.text()
                                );
                                algumRepasseFalhou = true;
                            }
                        } catch (fwdErr) {
                            console.error("[meta-webhook] Status forward error:", fwdErr);
                            algumRepasseFalhou = true;
                        }
                    }
                }
            }
        }

        // ── Fecho da linha bruta ────────────────────────────────────────────
        //
        // `done` só quando TODO repasse voltou 2xx. Qualquer falha devolve a
        // linha para `pending`, que é o estado que o worker drena — é isto, e
        // não o código HTTP que a Meta recebe, que garante a retentativa.
        //
        // No reprocessamento quem manda na linha é o worker, porque é ele que
        // conta `attempts`. Mexer no status aqui devolveria a linha para
        // `pending` sem incrementar tentativa: retentativa eterna, de graça.
        if (filaId && !filaIdDoReprocessamento) {
            await supabase
                .from("webhook_queue")
                .update(
                    algumRepasseFalhou
                        ? {
                            status: "pending",
                            error_message: "repasse interno nao retornou 2xx",
                            completed_at: null,
                        }
                        : { status: "done", completed_at: new Date().toISOString() }
                )
                .eq("id", filaId);
        }

        // Reprocessamento: quem chamou foi o `webhook-queue-processor`, e ele
        // precisa saber se pode dar a linha por encerrada. A resposta vai como
        // 200 com `success:false` de propósito — o processor confere o CORPO, e
        // um 5xx aqui criaria um segundo incidente para uma perda que o
        // `webhook-handle-message` já relatou.
        if (filaIdDoReprocessamento) {
            return new Response(
                JSON.stringify({
                    success: !algumRepasseFalhou,
                    message: algumRepasseFalhou
                        ? "repasse interno nao retornou 2xx no reprocessamento"
                        : "ok",
                }),
                { headers: { "Content-Type": "application/json" }, status: 200 }
            );
        }

        // 200 para a Meta mesmo com falha interna: a durabilidade agora mora na
        // fila, não na retentativa do provedor. Devolver erro aqui faria a Meta
        // reentregar o LOTE inteiro e, se persistisse, desativar o webhook.
        return new Response("OK", { status: 200 });
    } catch (err: any) {
        console.error("[meta-webhook] Error:", err);
        // Devolvemos 200 de proposito (senao a Meta retenta em cascata), o que
        // significa que ESTE log era o unico rastro da falha. Dai o incidente.
        reportIncident({ route: "webhook", httpCode: 500, error: err });

        // A linha bruta ficou em `processing` e ninguém a reivindicaria antes
        // do reset de 15 min. Devolver para `pending` aqui é o que transforma
        // este catch de "log" em "retentativa".
        if (filaId && clienteDaFila && !req.headers.get("x-fila-id")) {
            try {
                await clienteDaFila
                    .from("webhook_queue")
                    .update({ status: "pending", error_message: String(err?.message ?? err) })
                    .eq("id", filaId);
            } catch (erroFila) {
                // catch-mudo por desenho: já estamos DENTRO do tratador de erro,
                // e o incidente do fato foi aberto algumas linhas acima. O reset
                // de 15 min da fila é o plano B; o log é o que diz que ele vai
                // precisar acontecer.
                console.error("[meta-webhook] devolver a linha para pending falhou:", erroFila);
            }
        }

        // No reprocessamento este "OK" seria lido pelo worker como sucesso e a
        // linha viraria `done` — a exceção apagaria a mensagem em vez de
        // adiá-la. Aqui o corpo é que fala, e ele diz que falhou.
        if (req.headers.get("x-fila-id")) {
            return new Response(
                JSON.stringify({ success: false, message: String(err?.message ?? err) }),
                { headers: { "Content-Type": "application/json" }, status: 200 }
            );
        }

        // Still return 200 to prevent Meta retries on our errors
        return new Response("OK", { status: 200 });
    }
});
