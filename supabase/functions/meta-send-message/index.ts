import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * meta-send-message
 *
 * Sends messages via Meta WhatsApp Cloud API.
 * Called by evolution-send-message when instance.provider === 'meta'.
 *
 * Supports: text, image, video, audio, document, sticker, contact, reaction, reply, template
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

function buildMetaPayload(
    to: string,
    messageType: string,
    body: string,
    mediaUrl?: string,
    caption?: string,
    replyId?: string,
    contactData?: any,
    templateData?: any
): any {
    const payload: any = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
    };

    // Reply context
    if (replyId) {
        payload.context = { message_id: replyId };
    }

    switch (messageType) {
        case "text":
            payload.type = "text";
            payload.text = { preview_url: true, body };
            break;

        case "image":
            payload.type = "image";
            payload.image = { link: mediaUrl, caption: caption || undefined };
            break;

        case "video":
            payload.type = "video";
            payload.video = { link: mediaUrl, caption: caption || undefined };
            break;

        case "audio":
            payload.type = "audio";
            payload.audio = { link: mediaUrl };
            break;

        case "document":
            payload.type = "document";
            payload.document = {
                link: mediaUrl,
                caption: caption || undefined,
                filename: body || "document",
            };
            break;

        case "sticker":
            payload.type = "sticker";
            payload.sticker = { link: mediaUrl };
            break;

        case "contact":
            payload.type = "contacts";
            payload.contacts = [
                {
                    name: {
                        formatted_name: contactData?.fullName || "Contato",
                        first_name: contactData?.fullName || "Contato",
                    },
                    phones: [
                        {
                            phone: contactData?.phoneNumber || "",
                            type: "WORK",
                        },
                    ],
                    ...(contactData?.email
                        ? { emails: [{ email: contactData.email, type: "WORK" }] }
                        : {}),
                    ...(contactData?.organization
                        ? { org: { company: contactData.organization } }
                        : {}),
                },
            ];
            break;

        case "reaction":
            payload.type = "reaction";
            payload.reaction = {
                message_id: replyId || "",
                emoji: body || "👍",
            };
            break;

        case "template":
            payload.type = "template";
            payload.template = templateData;
            break;

        default:
            payload.type = "text";
            payload.text = { body };
            break;
    }

    return payload;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const reqData = await req.json();
        let {
            conversationId,
            body,
            messageType = "text",
            mediaUrl,
            caption,
            replyId,
            quotedBody,
            quotedSender,
            contactId,
            contactData,
            templateData,
            forward,
        } = reqData;

        console.log("[meta-send-message] Start conversationId:", conversationId);

        // ── Resolve conversation ──
        if (!conversationId && contactId) {
            const authHeader = req.headers.get("Authorization");
            let userId = null;
            let authenticatedAgentId = null;

            if (authHeader) {
                try {
                    const token = authHeader.replace("Bearer ", "");
                    const { data: { user } } = await supabase.auth.getUser(token);
                    if (user) {
                        userId = user.id;
                        const { data: teamMember } = await supabase
                            .from("team_members")
                            .select("id, user_id")
                            .eq("auth_user_id", user.id)
                            .single();
                        if (teamMember) {
                            authenticatedAgentId = teamMember.id;
                            userId = teamMember.user_id;
                        }
                    }
                } catch {}
            }

            if (!userId) throw new Error("User not authenticated");

            const { data: contact } = await supabase
                .from("contacts")
                .select("instance_id")
                .eq("id", contactId)
                .single();

            const instanceId = contact?.instance_id;
            if (!instanceId) throw new Error("Instance not found for contact");

            const { data: existingConvs } = await supabase
                .from("conversations")
                .select("*")
                .eq("instance_id", instanceId)
                .eq("user_id", userId)
                .eq("contact_id", contactId)
                .in("status", ["pending", "open"])
                .order("created_at", { ascending: false })
                .limit(1);

            if (existingConvs && existingConvs.length > 0) {
                conversationId = existingConvs[0].id;
            } else if (authenticatedAgentId) {
                const { data: newConv, error: createError } = await supabase
                    .from("conversations")
                    .insert({
                        contact_id: contactId,
                        instance_id: instanceId,
                        user_id: userId,
                        status: "open",
                        source: "panel",
                        assigned_agent_id: authenticatedAgentId,
                    })
                    .select()
                    .single();
                if (createError) throw createError;
                conversationId = newConv.id;
            } else {
                throw new Error("Cannot create conversation: Agent not authenticated");
            }
        }

        if (!conversationId) throw new Error("Conversation ID is required");

        // ── Get conversation + instance ──
        const { data: conversation, error: convError } = await supabase
            .from("conversations")
            .select("*, instance:instances(*)")
            .eq("id", conversationId)
            .single();

        if (convError || !conversation) {
            throw new Error(`Conversation not found: ${convError?.message}`);
        }

        const instance = conversation.instance;
        if (!instance || instance.provider !== "meta") {
            throw new Error("Instance is not a Meta Cloud API instance");
        }

        const accessToken = instance.meta_access_token;
        const phoneNumberId = instance.meta_phone_number_id;
        if (!accessToken || !phoneNumberId) {
            throw new Error("Meta credentials missing (access_token or phone_number_id)");
        }

        // ── Get recipient number ──
        let recipientNumber = "";
        if (conversation.contact_id) {
            const { data: contact } = await supabase
                .from("contacts")
                .select("number")
                .eq("id", conversation.contact_id)
                .single();
            if (!contact?.number) throw new Error("Contact number not found");
            recipientNumber = contact.number.replace(/\D/g, "").replace(/@.*$/, "");
            // Normalize BR mobile numbers: Meta expects 55+2-digit DDD+8-digit number (12 digits)
            // Brazilian mobiles with 9th digit have 13 digits (55+2+9digits) — remove the extra 9
            if (recipientNumber.startsWith("55") && recipientNumber.length === 13) {
                const ddd = recipientNumber.substring(2, 4);
                const rest = recipientNumber.substring(4);
                if (rest.startsWith("9") && rest.length === 9) {
                    recipientNumber = `55${ddd}${rest.substring(1)}`;
                    console.log("[meta-send-message] Normalized BR number:", recipientNumber);
                }
            }
        } else {
            throw new Error("Groups not supported on Meta Cloud API");
        }

        // ── Agent signature ──
        const authHeader = req.headers.get("Authorization");
        let authenticatedAgentId = null;
        const isApiMessage = reqData?.message?.wasSentByApi === true;

        if (authHeader && !isApiMessage) {
            try {
                const token = authHeader.replace("Bearer ", "");
                const { data: { user } } = await supabase.auth.getUser(token);
                if (user) {
                    const { data: teamMember } = await supabase
                        .from("team_members")
                        .select("id")
                        .eq("auth_user_id", user.id)
                        .single();
                    if (teamMember) authenticatedAgentId = teamMember.id;
                }
            } catch {}
        }

        const signerAgentId = authenticatedAgentId || conversation.assigned_agent_id;
        let finalBody = body;

        if (conversation.status === "open" && messageType === "text" && signerAgentId) {
            const { data: teamMember } = await supabase
                .from("team_members")
                .select("full_name, name, sign_messages")
                .eq("id", signerAgentId)
                .single();

            if (teamMember && teamMember.sign_messages !== false) {
                const senderName = teamMember.full_name || teamMember.name || "Atendente";
                finalBody = `*${senderName}:*\n${body}`;
            }
        }

        // ── Update conversation status if needed ──
        if (!isApiMessage && conversation.status === "pending" && authenticatedAgentId) {
            await supabase
                .from("conversations")
                .update({ status: "open", assigned_agent_id: authenticatedAgentId })
                .eq("id", conversationId);
        }

        // ── Build and send Meta payload ──
        const metaPayload = buildMetaPayload(
            recipientNumber,
            messageType,
            finalBody,
            mediaUrl,
            caption,
            replyId,
            contactData,
            templateData
        );

        console.log("[meta-send-message] Sending to Meta:", JSON.stringify(metaPayload));

        const sendResponse = await fetch(
            `${GRAPH_API}/${phoneNumberId}/messages`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(metaPayload),
                signal: AbortSignal.timeout(15_000),
            }
        );

        if (!sendResponse.ok) {
            const errorText = await sendResponse.text();
            console.error("[meta-send-message] Meta API error:", sendResponse.status, errorText);

            let errorMsg = "Erro ao enviar mensagem via WhatsApp Cloud API";
            try {
                const parsed = JSON.parse(errorText);
                errorMsg = parsed?.error?.message || parsed?.error?.error_user_msg || errorMsg;
            } catch {}

            return new Response(
                JSON.stringify({
                    success: false,
                    error: "meta_api_error",
                    message: errorMsg,
                    http_code: sendResponse.status,
                }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const sendData = await sendResponse.json();
        const metaMessageId = sendData.messages?.[0]?.id || null;

        console.log("[meta-send-message] Message sent, wamid:", metaMessageId);

        // ── Save message to DB ──
        let insertBody = messageType === "text" ? finalBody : body;
        let insertCaption = caption || null;

        if (messageType === "document" && caption && signerAgentId) {
            const { data: teamMember } = await supabase
                .from("team_members")
                .select("full_name, name, sign_messages")
                .eq("id", signerAgentId)
                .single();
            if (teamMember && teamMember.sign_messages !== false) {
                const senderName = teamMember.full_name || teamMember.name || "Atendente";
                insertCaption = `*${senderName}:*\n${caption}`;
            }
        }

        const { data: message, error: messageError } = await supabase
            .from("messages")
            .insert({
                conversation_id: conversationId,
                body: insertBody,
                direction: "outbound",
                message_type: messageType === "contact" ? "contact" : messageType,
                media_url: mediaUrl,
                evolution_id: metaMessageId,
                user_id: instance.user_id,
                reply_to_id: replyId || null,
                quoted_body: quotedBody || null,
                quoted_sender: quotedSender || null,
                caption: insertCaption,
                status: "sent",
            })
            .select("id, conversation_id, body, direction, message_type, created_at")
            .single();

        if (messageError) {
            console.error("[meta-send-message] Message insert error:", messageError);
            throw new Error(`Failed to save message: ${messageError.message}`);
        }

        console.log("[meta-send-message] Message saved:", message.id);

        return new Response(
            JSON.stringify({
                success: true,
                messageId: message.id,
                providerId: metaMessageId,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("[meta-send-message] Error:", error.message);

        let status = 500;
        let errorCode = "internal_error";
        let userMessage = error.message || "Erro desconhecido";

        if (userMessage.includes("Conversation ID is required")) {
            status = 400; errorCode = "missing_conversation_id";
        } else if (userMessage.includes("Conversation not found")) {
            status = 404; errorCode = "conversation_not_found";
        } else if (userMessage.includes("not a Meta")) {
            status = 422; errorCode = "wrong_provider";
        } else if (userMessage.includes("credentials missing")) {
            status = 422; errorCode = "meta_not_configured";
        }

        return new Response(
            JSON.stringify({ success: false, error: errorCode, message: userMessage }),
            { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
