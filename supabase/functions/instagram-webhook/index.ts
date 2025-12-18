import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram Webhook Handler
// Handles Facebook/Instagram Messaging API webhooks
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Token de verificação para o Facebook Developers
const VERIFY_TOKEN = 'clinvia_instagram_webhook_verify_2024';

serve(async (req) => {
    const url = new URL(req.url);
    const method = req.method;

    console.log('[INSTAGRAM WEBHOOK] ========================================');
    console.log('[INSTAGRAM WEBHOOK] Request received - Method:', method);
    console.log('[INSTAGRAM WEBHOOK] ========================================');

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // =============================================
    // GET Request - Webhook Verification
    // =============================================
    if (method === 'GET') {
        const hubMode = url.searchParams.get('hub.mode');
        const hubChallenge = url.searchParams.get('hub.challenge');
        const hubVerifyToken = url.searchParams.get('hub.verify_token');

        console.log('[INSTAGRAM WEBHOOK] Verification - mode:', hubMode, 'token:', hubVerifyToken);

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
            console.log('[INSTAGRAM WEBHOOK] Raw Body:', rawBody);

            let payload: any = {};
            try {
                payload = JSON.parse(rawBody);
            } catch (e) {
                console.error('[INSTAGRAM WEBHOOK] JSON parse error:', e);
                return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
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
                    const instagramAccountId = entry.id; // Page/Account ID receiving the message
                    console.log('[INSTAGRAM WEBHOOK] Processing for Instagram Account:', instagramAccountId);

                    // Find the Instagram instance in database
                    const { data: instagramInstance, error: instanceError } = await supabase
                        .from('instagram_instances')
                        .select('id, user_id, access_token')
                        .eq('instagram_account_id', instagramAccountId)
                        .single();

                    if (instanceError || !instagramInstance) {
                        console.error('[INSTAGRAM WEBHOOK] Instagram instance not found:', instagramAccountId);
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

                        console.log('[INSTAGRAM WEBHOOK] Event - Sender:', senderId, 'Recipient:', recipientId, 'IsEcho:', isEcho);

                        // Skip echo messages (messages sent by the page itself)
                        if (isEcho) {
                            console.log('[INSTAGRAM WEBHOOK] Skipping echo message');
                            continue;
                        }

                        if (event.message) {
                            const message = event.message;
                            const messageId = message.mid;
                            const messageText = message.text || '';
                            const attachments = message.attachments || [];

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

                            if (existingContact) {
                                contact = existingContact;
                                console.log('[INSTAGRAM WEBHOOK] Found existing contact:', contact.id);
                            } else {
                                // Fetch sender info from Instagram API
                                let senderName = 'Instagram User';
                                let profilePicUrl = null;

                                try {
                                    const accessToken = instagramInstance.access_token;
                                    const profileResponse = await fetch(
                                        `https://graph.instagram.com/v21.0/${senderId}?fields=name,profile_pic&access_token=${accessToken}`
                                    );
                                    if (profileResponse.ok) {
                                        const profileData = await profileResponse.json();
                                        senderName = profileData.name || senderName;
                                        profilePicUrl = profileData.profile_pic || null;
                                        console.log('[INSTAGRAM WEBHOOK] Fetched profile:', senderName);
                                    }
                                } catch (e) {
                                    console.error('[INSTAGRAM WEBHOOK] Error fetching profile:', e);
                                }

                                // Create new contact
                                const { data: newContact, error: contactError } = await supabase
                                    .from('contacts')
                                    .insert({
                                        instagram_id: senderId,
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
                                console.log('[INSTAGRAM WEBHOOK] Attachment type:', messageType, 'URL:', mediaUrl);
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

                                    console.log('[INSTAGRAM WEBHOOK] Triggering push notification for user:', targetUserId);

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
                            }
                        }

                        // Handle read events
                        if (event.read) {
                            console.log('[INSTAGRAM WEBHOOK] Read event:', event.read);
                        }
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
