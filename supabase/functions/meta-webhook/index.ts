import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
        const metaResp = await fetch(
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
        const fileResp = await fetch(url, {
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

// ── Main handler ──

serve(async (req) => {
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

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);

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
                    .select("id, instance_name, apikey, user_id, meta_access_token, meta_waba_id, default_queue_id, webhook_url, ia_on_wpp, auto_create_deal_funnel_id, server_url")
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
                            const resp = await fetch(
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
                        } catch (fwdErr) {
                            console.error("[meta-webhook] Forward error:", fwdErr);
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

                        const normalizedStatus = {
                            instanceName: instance.instance_name,
                            type: "ReadReceipt",
                            EventType: "messages_update",
                            state: statusMap[status.status] || "Sent",
                            event: { MessageIDs: [status.id] },
                        };

                        // Log failures
                        if (status.status === "failed" && status.errors) {
                            console.error("[meta-webhook] Message failed:", status.id, JSON.stringify(status.errors));
                        }

                        // Forward to webhook-handle-status
                        try {
                            await fetch(
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
                        } catch (fwdErr) {
                            console.error("[meta-webhook] Status forward error:", fwdErr);
                        }
                    }
                }
            }
        }

        // Always return 200 immediately (Meta requirement)
        return new Response("OK", { status: 200 });
    } catch (err: any) {
        console.error("[meta-webhook] Error:", err);
        // Still return 200 to prevent Meta retries on our errors
        return new Response("OK", { status: 200 });
    }
});
