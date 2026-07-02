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
        return (
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            ""
        );
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
        if (appSecret) {
            const signature = req.headers.get("x-hub-signature-256");
            const isValid = await validateMetaSignature(rawBody, signature, appSecret);
            if (!isValid) {
                console.warn("[meta-webhook] Invalid signature");
                return new Response("Invalid signature", { status: 401 });
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
                if (change.field !== "messages") continue;

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
                    console.warn("[meta-webhook] No instance for phone_number_id:", phoneNumberId);
                    continue;
                }

                const accessToken = instance.meta_access_token;

                // ── MESSAGES ──
                if (value.messages && value.messages.length > 0) {
                    for (const msg of value.messages) {
                        const contact = value.contacts?.[0];
                        const content = extractContentFromMeta(msg);

                        // Build normalized UZAPI-format payload
                        const normalizedPayload = {
                            instanceName: instance.instance_name,
                            EventType: "messages",
                            message: {
                                messageid: msg.id,
                                sender: msg.from,
                                sender_pn: msg.from,
                                pushName: contact?.profile?.name || "",
                                messageType: mapMetaTypeToUzapi(msg.type),
                                text: extractTextFromMeta(msg),
                                fromMe: false,
                                timestamp: parseInt(msg.timestamp) || Math.floor(Date.now() / 1000),
                                isGroup: false,
                                chatid: msg.from,
                                content: content,
                                vote: content.selectedDisplayText || "",
                                selectedDisplayText: content.selectedDisplayText || "",
                                reaction: msg.type === "reaction" ? msg.reaction?.message_id : undefined,
                            },
                            chat: {
                                wa_chatid: msg.from,
                                wa_name: contact?.profile?.name || "",
                                name: contact?.profile?.name || "",
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
                                `meta-pending-${msg.from}`,
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
