import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
    validateMetaWebhookSignature,
    checkRateLimit,
    validateInstagramPayload
} from "../_shared/utils.ts";

// =============================================
// Instagram Webhook Handler
// Handles Facebook/Instagram Messaging API webhooks
// =============================================
//
// ⚠️⚠️⚠️ CRITICAL CONFIGURATION WARNING ⚠️⚠️⚠️
//
// This function MUST be configured in supabase/config.toml with:
//
//   [functions.instagram-webhook]
//   verify_jwt = false
//
// WITHOUT THIS, THE META WEBHOOK VERIFICATION WILL FAIL WITH 401 ERROR!
// The Meta servers do not send Authorization headers, so JWT verification
// must be disabled for this function to work.
//
// DO NOT REMOVE OR MODIFY THIS CONFIGURATION!
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    const url = new URL(req.url);
    const method = req.method;

    console.log('[INSTAGRAM WEBHOOK] Request received - Method:', method);

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // 🛡️ RATE LIMITING — máximo 100 req/min por IP
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(`ig:${clientIP}`, 100, 60000)) {
        console.warn(`[INSTAGRAM WEBHOOK] Rate limited IP: ${clientIP}`);
        return new Response(
            JSON.stringify({ success: false, error: 'Too many requests' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // =============================================
    // GET Request - Webhook Verification
    // =============================================
    if (method === 'GET') {
        const hubMode = url.searchParams.get('hub.mode');
        const hubChallenge = url.searchParams.get('hub.challenge');
        const hubVerifyToken = url.searchParams.get('hub.verify_token');

        // Token de verificação via env (fallback para hardcoded por compatibilidade)
        const VERIFY_TOKEN = Deno.env.get('INSTAGRAM_VERIFY_TOKEN') || 'clinvia_instagram_webhook_verify_2024';

        console.log('[INSTAGRAM WEBHOOK] Verification - mode:', hubMode);

        if (hubMode === 'subscribe' && hubVerifyToken === VERIFY_TOKEN) {
            console.log('[INSTAGRAM WEBHOOK] ✅ Verification successful!');
            return new Response(hubChallenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
        } else {
            console.log('[INSTAGRAM WEBHOOK] ❌ Verification failed');
            return new Response('Verification failed', { status: 403, headers: corsHeaders });
        }
    }

    // =============================================
    // POST Request - Incoming Messages
    // =============================================
    if (method === 'POST') {
        try {
            const rawBody = await req.text();

            // 🔐 META SIGNATURE VALIDATION (X-Hub-Signature)
            const metaAppSecret = Deno.env.get('META_APP_SECRET');
            if (metaAppSecret) {
                const xHubSignature = req.headers.get('x-hub-signature');
                const isValid = await validateMetaWebhookSignature(rawBody, xHubSignature, metaAppSecret);
                if (!isValid) {
                    console.warn(`[INSTAGRAM WEBHOOK] Invalid Meta signature from IP: ${clientIP}`);
                    return new Response(
                        JSON.stringify({ success: false, error: 'Invalid signature' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
            }

            let payload: any = {};
            try {
                payload = JSON.parse(rawBody);
            } catch (e) {
                console.error('[INSTAGRAM WEBHOOK] JSON parse error:', e);
                return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // ✅ INPUT VALIDATION
            const validationError = validateInstagramPayload(payload);
            if (validationError) {
                console.warn(`[INSTAGRAM WEBHOOK] Payload validation failed: ${validationError}`);
                return new Response(
                    JSON.stringify({ success: false, error: validationError }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Initialize Supabase
            const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
            const supabase = createClient(supabaseUrl, supabaseKey);

            const objectType = payload.object;
            console.log('[INSTAGRAM WEBHOOK] Object type:', objectType);

            if (objectType === 'instagram') {
                const entries = payload.entry || [];

                for (const entry of entries) {
                    const entryId = entry.id; // This could be Page ID or IGSID
                    console.log('[INSTAGRAM WEBHOOK] Processing for entry ID:', entryId);

                    // Collect all possible IDs from the messaging events
                    const possibleIds = new Set<string>();
                    possibleIds.add(String(entryId));

                    for (const evt of entry.messaging || []) {
                        if (evt.sender?.id) possibleIds.add(String(evt.sender.id));
                        if (evt.recipient?.id) possibleIds.add(String(evt.recipient.id));
                    }

                    // Try to find the Instagram instance - it might be stored with different IDs
                    let instagramInstance = null;

                    // Method 1: Try all possible IDs
                    for (const tryId of possibleIds) {
                        if (instagramInstance) break;

                        const { data: foundInstance } = await supabase
                            .from('instagram_instances')
                            .select('id, user_id, access_token, instagram_account_id, ia_on_insta')
                            .eq('instagram_account_id', tryId)
                            .single();

                        if (foundInstance) {
                            instagramInstance = foundInstance;
                            console.log('[INSTAGRAM WEBHOOK] Found instance by ID:', tryId);
                        }
                    }

                    // Method 3: If still not found, try more sophisticated matching
                    if (!instagramInstance) {
                        const { data: allInstances } = await supabase
                            .from('instagram_instances')
                            .select('id, user_id, instagram_account_id, account_name, access_token')
                            .eq('status', 'connected');

                        console.log('[INSTAGRAM WEBHOOK] No match found. Entry ID:', entryId);
                        console.log('[INSTAGRAM WEBHOOK] Available instances count:', allInstances?.length);

                        if (allInstances && allInstances.length > 0) {
                            // Method 3a: Try to verify each instance by calling Instagram API with their token
                            // The entry.id in webhooks is the IGSID, we need to find which token corresponds to it
                            for (const inst of allInstances) {
                                try {

                                    // Call Instagram API to get the account info with this token
                                    const verifyResponse = await fetch(
                                        `https://graph.instagram.com/v24.0/me?fields=id,username&access_token=${inst.access_token}`
                                    );
                                    const verifyData = await verifyResponse.json();

                                    if (verifyResponse.ok && verifyData.id) {
                                        // Check if this account ID matches our entry.id OR if there's a relationship
                                        // Instagram sometimes uses different IDs in different contexts
                                        // The entry.id is the IGSID which may be different from the user_id from oauth

                                        // Update the instance with both IDs if we can verify the token works
                                        if (verifyData.id === inst.instagram_account_id || verifyData.id === String(entryId)) {
                                            console.log('[INSTAGRAM WEBHOOK] Found matching instance by token verification');
                                            instagramInstance = inst;

                                            // Also store the webhook entry.id for future direct matching
                                            await supabase
                                                .from('instagram_instances')
                                                .update({
                                                    instagram_account_id: String(entryId),
                                                    account_name: verifyData.username || inst.account_name
                                                })
                                                .eq('id', inst.id);
                                            console.log('[INSTAGRAM WEBHOOK] Updated instance with webhook entry.id:', entryId);
                                            break;
                                        }
                                    }
                                } catch (verifyError) {
                                    console.log('[INSTAGRAM WEBHOOK] Token verification failed for instance:', inst.id, verifyError);
                                }
                            }

                            // Method 3b: If still no match, use the most recently created/updated instance
                            // This handles the case where Instagram returns different IDs in OAuth vs Webhook
                            if (!instagramInstance) {
                                const { data: recentInstances } = await supabase
                                    .from('instagram_instances')
                                    .select('id, user_id, access_token, instagram_account_id, created_at, updated_at')
                                    .eq('status', 'connected')
                                    .order('updated_at', { ascending: false })
                                    .limit(1);

                                if (recentInstances && recentInstances.length > 0) {
                                    const recentInst = recentInstances[0];
                                    const instanceAge = Date.now() - new Date(recentInst.updated_at || recentInst.created_at).getTime();
                                    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

                                    // If the instance was updated in the last 24 hours, it's likely the correct one
                                    // This is a fallback for when Instagram returns mismatched IDs
                                    if (instanceAge < maxAge) {
                                        instagramInstance = recentInst;

                                        // Update the instagram_account_id to the webhook entry.id for future direct matching
                                        const { error: updateError } = await supabase
                                            .from('instagram_instances')
                                            .update({
                                                instagram_account_id: String(entryId)
                                            })
                                            .eq('id', recentInst.id);

                                        if (updateError) {
                                            console.error('[INSTAGRAM WEBHOOK] Failed to update instance ID:', updateError);
                                        } else {
                                            console.log('[INSTAGRAM WEBHOOK] Updated instance with webhook entry.id:', entryId);
                                        }
                                    } else {
                                        console.log('[INSTAGRAM WEBHOOK] Recent instance is too old, not using as fallback');
                                    }
                                }
                            }
                        }
                    }

                    if (!instagramInstance) {
                        console.error('[INSTAGRAM WEBHOOK] Instagram instance not found for any ID');
                        continue;
                    }

                    const userId = instagramInstance.user_id;
                    console.log('[INSTAGRAM WEBHOOK] Found instance, user_id:', userId);

                    // Handle Messaging Events
                    const messaging = entry.messaging || [];

                    for (const event of messaging) {
                        const senderId = event.sender?.id;
                        const recipientId = event.recipient?.id;
                        const timestamp = event.timestamp;
                        const isEcho = event.message?.is_echo || false;

                        if (event.message) {
                            const message = event.message;
                            const messageId = message.mid;
                            const messageText = message.text || '';
                            const attachments = message.attachments || [];

                            // Echo = mensagem enviada pela página (outbound)
                            // Para echoes, o "sender" é a página e o "recipient" é o cliente
                            if (isEcho) {
                                console.log('[INSTAGRAM WEBHOOK] Echo message (outbound):', messageId);

                                // Encontra o contato pelo recipient (que é o cliente)
                                const { data: echoContact } = await supabase
                                    .from('contacts')
                                    .select('id, push_name')
                                    .eq('instagram_id', recipientId)
                                    .eq('user_id', userId)
                                    .single();

                                if (!echoContact) {
                                    console.warn('[INSTAGRAM WEBHOOK] Echo: contact not found for recipient', recipientId);
                                    continue;
                                }

                                // Encontra conversa aberta
                                const { data: echoConvs } = await supabase
                                    .from('conversations')
                                    .select('id')
                                    .eq('contact_id', echoContact.id)
                                    .eq('user_id', userId)
                                    .in('status', ['open', 'pending'])
                                    .order('created_at', { ascending: false })
                                    .limit(1);

                                if (!echoConvs?.length) {
                                    console.warn('[INSTAGRAM WEBHOOK] Echo: no open conversation for contact', echoContact.id);
                                    continue;
                                }

                                const echoConvId = echoConvs[0].id;

                                // Verifica duplicata
                                const { data: existingMsg } = await supabase
                                    .from('messages')
                                    .select('id')
                                    .eq('evolution_id', messageId)
                                    .maybeSingle();

                                if (existingMsg) {
                                    console.log('[INSTAGRAM WEBHOOK] Echo: duplicate, skipping', messageId);
                                    continue;
                                }

                                let echoMediaUrl = null;
                                let echoMsgType = 'text';
                                if (attachments.length > 0) {
                                    echoMsgType = attachments[0].type || 'text';
                                    echoMediaUrl = attachments[0].payload?.url || null;
                                }

                                await supabase.from('messages').insert({
                                    conversation_id: echoConvId,
                                    body: messageText,
                                    direction: 'outbound',
                                    message_type: echoMsgType,
                                    evolution_id: messageId,
                                    user_id: userId,
                                    media_url: echoMediaUrl,
                                    status: 'sent',
                                });

                                // Atualiza last_message_at
                                await supabase.from('conversations').update({
                                    last_message: messageText || 'Mídia',
                                    last_message_at: new Date().toISOString(),
                                }).eq('id', echoConvId);

                                console.log('[INSTAGRAM WEBHOOK] ✅ Echo message saved as outbound');
                                continue;
                            }

                            console.log('[INSTAGRAM WEBHOOK] Message:', messageId, 'Text:', messageText);

                            // =============================================
                            // 1. Find or Create Contact
                            // =============================================
                            let contact;
                            const { data: existingContact } = await supabase
                                .from('contacts')
                                .select('*')
                                .eq('instagram_id', senderId)
                                .eq('user_id', userId)
                                .single();

                            // Helper: fetch profile from Instagram Graph API
                            // Usa profile_pic (campo que funciona na Messaging API) + username como fallback de nome
                            // Nota: a API retorna erro 100 para alguns usuários (privacidade/permissões) — nesse caso retorna null
                            const fetchInstagramProfile = async (): Promise<{ name: string | null; profilePicUrl: string | null }> => {
                                try {
                                    const accessToken = instagramInstance.access_token;
                                    const profileResponse = await fetch(
                                        `https://graph.instagram.com/v24.0/${senderId}?fields=name,username,profile_pic&access_token=${accessToken}`
                                    );
                                    const profileData = await profileResponse.json();
                                    console.log('[INSTAGRAM WEBHOOK] Profile API response:', JSON.stringify(profileData));

                                    if (profileData.error) {
                                        console.warn('[INSTAGRAM WEBHOOK] API error for', senderId, ':', profileData.error.message);
                                        return { name: null, profilePicUrl: null };
                                    }

                                    return {
                                        name: profileData.name || profileData.username || null,
                                        profilePicUrl: profileData.profile_pic || null,
                                    };
                                } catch (e) {
                                    console.error('[INSTAGRAM WEBHOOK] Error fetching profile:', e);
                                }
                                return { name: null, profilePicUrl: null };
                            };

                            if (existingContact) {
                                contact = existingContact;
                                console.log('[INSTAGRAM WEBHOOK] Found existing contact:', contact.id);

                                // Atualiza foto se ausente OU nome genérico — re-tenta a cada mensagem
                                // até conseguir dados reais do perfil
                                if (!contact.profile_pic_url || contact.push_name === 'Instagram User') {
                                    const { name: fetchedName, profilePicUrl: fetchedPic } = await fetchInstagramProfile();
                                    const updates: Record<string, string> = {};
                                    if (fetchedPic) updates.profile_pic_url = fetchedPic;
                                    if (fetchedName && (!contact.push_name || contact.push_name === 'Instagram User')) {
                                        updates.push_name = fetchedName;
                                    }
                                    if (Object.keys(updates).length > 0) {
                                        await supabase
                                            .from('contacts')
                                            .update(updates)
                                            .eq('id', contact.id);
                                        contact = { ...contact, ...updates };
                                        console.log('[INSTAGRAM WEBHOOK] Updated existing contact profile:', contact.id);
                                    }
                                }
                            } else {
                                // Fetch sender info from Instagram API
                                const { name: fetchedName, profilePicUrl } = await fetchInstagramProfile();
                                const senderName = fetchedName || 'Instagram User';
                                console.log('[INSTAGRAM WEBHOOK] Fetched profile for new contact:', senderName);

                                // Create new contact
                                const { data: newContact, error: contactError } = await supabase
                                    .from('contacts')
                                    .insert({
                                        instagram_id: senderId,
                                        number: `instagram:${senderId}`, // Use instagram ID as "number" since field is required
                                        push_name: senderName,
                                        profile_pic_url: profilePicUrl,
                                        channel: 'instagram',
                                        instagram_instance_id: instagramInstance.id,
                                        user_id: userId,
                                        is_group: false
                                    })
                                    .select()
                                    .single();

                                if (contactError) {
                                    console.error('[INSTAGRAM WEBHOOK] Error creating contact:', contactError);
                                    continue;
                                }
                                contact = newContact;
                                console.log('[INSTAGRAM WEBHOOK] Created new contact:', contact.id);
                            }

                            // =============================================
                            // 2. Find or Create Conversation
                            // =============================================
                            let conversation;
                            const { data: existingConversations } = await supabase
                                .from('conversations')
                                .select('*')
                                .eq('contact_id', contact.id)
                                .eq('user_id', userId)
                                .in('status', ['open', 'pending'])
                                .order('created_at', { ascending: false })
                                .limit(1);

                            if (existingConversations && existingConversations.length > 0) {
                                conversation = existingConversations[0];
                                console.log('[INSTAGRAM WEBHOOK] Found existing conversation:', conversation.id);

                                // Update conversation
                                await supabase
                                    .from('conversations')
                                    .update({
                                        last_message: messageText || 'Mídia',
                                        unread_count: (conversation.unread_count || 0) + 1,
                                        updated_at: new Date().toISOString(),
                                        last_message_at: new Date().toISOString()
                                    })
                                    .eq('id', conversation.id);
                            } else {
                                // Create new conversation
                                const { data: newConv, error: convError } = await supabase
                                    .from('conversations')
                                    .insert({
                                        contact_id: contact.id,
                                        channel: 'instagram',
                                        instagram_instance_id: instagramInstance.id,
                                        user_id: userId,
                                        status: 'pending',
                                        unread_count: 1,
                                        last_message: messageText || 'Mídia',
                                        last_message_at: new Date().toISOString()
                                    })
                                    .select()
                                    .single();

                                if (convError) {
                                    console.error('[INSTAGRAM WEBHOOK] Error creating conversation:', convError);
                                    continue;
                                }
                                conversation = newConv;
                                console.log('[INSTAGRAM WEBHOOK] Created new conversation:', conversation.id);
                            }

                            // =============================================
                            // 3. Save Message
                            // =============================================
                            let mediaUrl = null;
                            let messageType = 'text';

                            // Handle attachments
                            if (attachments.length > 0) {
                                const attachment = attachments[0];
                                messageType = attachment.type || 'text';
                                mediaUrl = attachment.payload?.url || null;
                            }

                            const { data: savedMessage, error: msgError } = await supabase
                                .from('messages')
                                .insert({
                                    conversation_id: conversation.id,
                                    body: messageText,
                                    direction: 'inbound',
                                    message_type: messageType,
                                    evolution_id: messageId, // Using evolution_id for consistency
                                    user_id: userId,
                                    sender_name: contact.push_name,
                                    media_url: mediaUrl
                                })
                                .select()
                                .single();

                            if (msgError) {
                                console.error('[INSTAGRAM WEBHOOK] Error saving message:', msgError);
                            } else {
                                console.log('[INSTAGRAM WEBHOOK] ✅ Message saved:', savedMessage.id);

                                // =============================================
                                // 4. Trigger Push Notification
                                // =============================================
                                try {
                                    // Find assigned agent or owner
                                    const targetUserId = conversation.assigned_agent_id || userId;

                                    await supabase.functions.invoke('send-push', {
                                        body: {
                                            auth_user_id: targetUserId,
                                            title: `📸 ${contact.push_name}`,
                                            body: messageText || 'Enviou uma mídia',
                                            url: `/?conversationId=${conversation.id}`,
                                            tag: `instagram-${conversation.id}`,
                                            notification_type: 'instagram'
                                        }
                                    });
                                } catch (pushError) {
                                    console.error('[INSTAGRAM WEBHOOK] Push notification error:', pushError);
                                }

                                // =============================================
                                // 4.5 Trigger Audio Transcription (if audio message)
                                // =============================================
                                if (messageType === 'audio' && mediaUrl && savedMessage) {
                                    try {
                                        const { error: transcribeError } = await supabase.functions.invoke('transcribe-audio', {
                                            body: { messageId: savedMessage.id, mediaUrl: mediaUrl }
                                        });

                                        if (transcribeError) {
                                            console.error('[INSTAGRAM WEBHOOK] Transcription function error:', transcribeError);
                                        }
                                    } catch (transcribeError) {
                                        console.error('[INSTAGRAM WEBHOOK] Exception invoking transcription:', transcribeError);
                                    }
                                }

                                // =============================================
                                // 5. Forward to IA Webhook (if enabled)
                                // =============================================
                                // Step 1: Check if ia_on_insta is TRUE for this Instagram instance
                                if (instagramInstance.ia_on_insta === true) {

                                    // Step 2: Find WhatsApp instance with same user_id and ia_on_wpp = TRUE
                                    // IMPORTANT: If multiple instances match, take the first one
                                    const { data: whatsappInstances } = await supabase
                                        .from('instances')
                                        .select('id, webhook_url, ia_on_wpp')
                                        .eq('user_id', userId)
                                        .eq('ia_on_wpp', true)
                                        .limit(1);

                                    if (whatsappInstances && whatsappInstances.length > 0) {
                                        const whatsappInstance = whatsappInstances[0];
                                        const webhookUrl = whatsappInstance.webhook_url;

                                        if (webhookUrl) {
                                            // Fetch the 'Atendimento IA' funnel ID unconditionally to include in the payload
                                            let iaFunnelId: string | null = null;
                                            try {
                                                const { data: iaFunnel, error: iaFunnelError } = await supabase
                                                    .from('crm_funnels')
                                                    .select('id')
                                                    .eq('name', 'Atendimento IA')
                                                    .eq('user_id', userId)
                                                    .single();

                                                if (iaFunnelError) {
                                                    console.warn('[INSTAGRAM WEBHOOK] Error or not found "Atendimento IA" funnel:', iaFunnelError.message);
                                                } else if (iaFunnel?.id) {
                                                    iaFunnelId = iaFunnel.id;
                                                }
                                            } catch (err) {
                                                console.error('[INSTAGRAM WEBHOOK] Exception finding IA funnel:', err);
                                            }

                                            // Step 3: Build payload with bd_data
                                            const forwardedPayload = {
                                                ...payload,
                                                bd_data: {
                                                    user_id: userId,
                                                    contact_id: contact.id,
                                                    conversation_id: conversation.id,
                                                    instance_id: whatsappInstance.id,
                                                    ia_funnel_id: iaFunnelId
                                                }
                                            };

                                            try {
                                                const forwardResponse = await fetch(webhookUrl, {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'User-Agent': 'Clinvia-Instagram-Webhook/1.0'
                                                    },
                                                    body: JSON.stringify(forwardedPayload)
                                                });
                                                console.log('[INSTAGRAM WEBHOOK] ✅ Webhook forwarded successfully to IA, status:', forwardResponse.status);
                                            } catch (forwardError) {
                                                console.error('[INSTAGRAM WEBHOOK] Error forwarding to IA webhook:', forwardError);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Handle read events
                    }
                }
            }

            // Always return 200 to Facebook
            return new Response(
                JSON.stringify({ success: true, message: 'Webhook processed' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );

        } catch (error: any) {
            console.error('[INSTAGRAM WEBHOOK] Error:', error);
            return new Response(
                JSON.stringify({ success: false, error: error.message }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});
