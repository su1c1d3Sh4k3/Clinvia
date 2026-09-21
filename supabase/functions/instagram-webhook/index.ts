import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
    validateMetaWebhookSignature,
    checkRateLimit,
    validateInstagramPayload,
    mapMessageType
} from "../_shared/utils.ts";
import { buildBdData } from "../_shared/bd-data.ts";

/**
 * Tipo do anexo do Direct → vocabulário UAZAPI, o mesmo que o WhatsApp manda
 * em `message.messageType` (o meta-webhook faz a tradução equivalente para a
 * Cloud API). Passar por `mapMessageType` depois devolve o valor final que vai
 * para `messages.message_type` — assim os dois canais gravam e enviam a mesma
 * palavra para a mesma coisa.
 */
function mapInstagramTypeToUzapi(igType: string): string {
    const map: Record<string, string> = {
        text: "conversation",
        image: "imagemessage",
        // Figurinha, reel e menção em story chegam como anexo de mídia;
        // o que importa para a IA é ser imagem ou vídeo.
        share: "imagemessage",
        story_mention: "imagemessage",
        ig_reel: "videomessage",
        video: "videomessage",
        audio: "audiomessage",
        file: "documentmessage",
    };
    return map[igType] || "conversation";
}

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

            // 🔐 SIGNATURE VALIDATION (X-Hub-Signature)
            // Instagram webhooks are signed with the Instagram app secret (INSTAGRAM_APP_SECRET),
            // NOT the WhatsApp Cloud app secret (META_APP_SECRET). Try both for safety.
            const igAppSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
            const metaAppSecret = Deno.env.get('META_APP_SECRET');
            const secretsToTry = [igAppSecret, metaAppSecret].filter((s): s is string => !!s);
            if (secretsToTry.length > 0) {
                const xHubSignature = req.headers.get('x-hub-signature');
                let isValid = false;
                for (const secret of secretsToTry) {
                    if (await validateMetaWebhookSignature(rawBody, xHubSignature, secret)) {
                        isValid = true;
                        break;
                    }
                }
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

            // ─── LOG: salva payload bruto para auditoria de canal de origem ───
            // Cada entry/evento gera um log separado para facilitar debugging
            // de quais senders chegam de comments-to-DM, story-reply, ads, etc.
            try {
                const entries = payload.entry || [];
                for (const e of entries) {
                    for (const evt of e.messaging || []) {
                        const evtType = evt.message?.is_echo
                            ? 'echo'
                            : evt.message
                              ? 'message'
                              : evt.postback
                                ? 'postback'
                                : evt.reaction
                                  ? 'reaction'
                                  : evt.referral
                                    ? 'referral'
                                    : evt.read
                                      ? 'seen'
                                      : 'unknown';
                        const referralSource =
                            evt.referral?.source ||
                            evt.referral?.type ||
                            evt.message?.referral?.source ||
                            null;
                        await supabase.from('instagram_webhook_logs').insert({
                            sender_id: evt.sender?.id ? String(evt.sender.id) : null,
                            recipient_id: evt.recipient?.id ? String(evt.recipient.id) : null,
                            event_type: evtType,
                            has_text: !!evt.message?.text,
                            has_attachment: (evt.message?.attachments?.length ?? 0) > 0,
                            referral_source: referralSource,
                            payload: evt,
                        });
                    }
                }
            } catch (logErr) {
                // Logging falhou — NÃO interrompe o processamento principal
                console.warn('[INSTAGRAM WEBHOOK] payload log failed:', logErr);
            }
            // ─── /LOG ──────────────────────────────────────────────────────

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
                            .select('id, user_id, access_token, instagram_account_id, account_name, ia_on_insta')
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
                            .select('id, user_id, instagram_account_id, account_name, access_token, ia_on_insta')
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
                                    .select('id, user_id, access_token, instagram_account_id, account_name, ia_on_insta, created_at, updated_at')
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
                                    // 23505 = corrida com outro webhook que criou o contato primeiro
                                    // (índice único uq_contacts_user_instagram_id) — reusar o existente
                                    if (contactError.code === '23505') {
                                        const { data: racedContact } = await supabase
                                            .from('contacts')
                                            .select('*')
                                            .eq('instagram_id', senderId)
                                            .eq('user_id', userId)
                                            .single();
                                        if (racedContact) {
                                            contact = racedContact;
                                            console.log('[INSTAGRAM WEBHOOK] Contact created concurrently, reusing:', contact.id);
                                        } else {
                                            console.error('[INSTAGRAM WEBHOOK] Duplicate contact error but re-select failed');
                                            continue;
                                        }
                                    } else {
                                        console.error('[INSTAGRAM WEBHOOK] Error creating contact:', contactError);
                                        continue;
                                    }
                                } else {
                                    contact = newContact;
                                }
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
                                // Padrão único (user rule, igual ao WhatsApp): IA desligada →
                                // fila "Atendimento Humano"; IA ligada (ia_config.ia_on +
                                // ia_on_insta DESTA conta) → fila "Atendimento IA".
                                // instagram_instances.default_queue_id foi removida.
                                let newConvQueueId: string | null = null;
                                try {
                                    const { data: iaCfgQueue } = await supabase
                                        .from('ia_config')
                                        .select('ia_on')
                                        .eq('user_id', userId)
                                        .maybeSingle();

                                    const iaEffective = (iaCfgQueue as any)?.ia_on === true
                                        && instagramInstance.ia_on_insta === true;
                                    const targetQueueName = iaEffective ? 'Atendimento IA' : 'Atendimento Humano';

                                    const { data: targetQueue } = await supabase
                                        .from('queues')
                                        .select('id')
                                        .eq('user_id', userId)
                                        .eq('name', targetQueueName)
                                        .maybeSingle();

                                    if (targetQueue?.id) {
                                        newConvQueueId = targetQueue.id;
                                    } else if (iaEffective) {
                                        // Fila IA inexistente → cai na Humano
                                        const { data: humanQueue } = await supabase
                                            .from('queues')
                                            .select('id')
                                            .eq('user_id', userId)
                                            .eq('name', 'Atendimento Humano')
                                            .maybeSingle();
                                        newConvQueueId = humanQueue?.id || null;
                                    }
                                } catch (queueErr) {
                                    console.warn('[INSTAGRAM WEBHOOK] queue lookup failed:', queueErr);
                                }

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
                                        queue_id: newConvQueueId,
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
                            // Tipo cru do Direct (image, video, audio, file, share,
                            // story_mention, ig_reel) — guardado só para o payload.
                            let igAttachmentType = 'text';

                            // Handle attachments
                            if (attachments.length > 0) {
                                const attachment = attachments[0];
                                igAttachmentType = attachment.type || 'text';
                                mediaUrl = attachment.payload?.url || null;
                            }

                            // Mesmo vocabulário do WhatsApp: UAZAPI no payload
                            // (message.messageType) e o mapeado no banco.
                            const uzapiMessageType = mapInstagramTypeToUzapi(igAttachmentType);
                            const messageType = mapMessageType(uzapiMessageType);

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

                                    // Step 2: destino do fluxo no n8n. O Instagram tem o workflow
                                    // dele (instagram_instances.workflow_code, gravado pelo n8n);
                                    // sem ele o envio cai no fluxo de WhatsApp da conta, como antes.
                                    const { data: igRoute, error: igRouteError } = await supabase
                                        .from('instagram_instances')
                                        .select('workflow_code, contact_instance_id')
                                        .eq('id', instagramInstance.id)
                                        .maybeSingle();

                                    if (igRouteError) {
                                        console.warn('[INSTAGRAM WEBHOOK] Error reading Instagram workflow_code:', igRouteError.message);
                                    }

                                    // A instância de WhatsApp continua necessária: é o instance_id
                                    // que vai no bd_data (conversa de Instagram não tem uma).
                                    // IMPORTANT: If multiple instances match, take the first one
                                    const { data: whatsappInstances } = await supabase
                                        .from('instances')
                                        .select('id, webhook_url, workflow_code, workflow_id, ia_on_wpp')
                                        .eq('user_id', userId)
                                        .eq('ia_on_wpp', true)
                                        .limit(1);

                                    if (whatsappInstances && whatsappInstances.length > 0) {
                                        const whatsappInstance = whatsappInstances[0];
                                        // workflow_code do Instagram > workflow_code do WhatsApp >
                                        // workflow_id (legado) > webhook_url
                                        const workflowCode = igRoute?.workflow_code
                                            || whatsappInstance.workflow_code
                                            || whatsappInstance.workflow_id;
                                        const webhookUrl = workflowCode
                                            ? `https://webhooks.clinvia.com.br/webhook/${workflowCode}`
                                            : whatsappInstance.webhook_url;

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

                                            // Conexão de WhatsApp que a clínica escolheu para atender
                                            // quem vem do Instagram (aba Instagram em Conexões).
                                            // Serve para duas coisas: o número que a IA divulga e a
                                            // instância que fica vinculada ao agendamento do link.
                                            let contactInstance: any = null;
                                            if (igRoute?.contact_instance_id) {
                                                try {
                                                    const { data: ci, error: ciError } = await supabase
                                                        .from('instances')
                                                        .select('id, client_number, name')
                                                        .eq('id', igRoute.contact_instance_id)
                                                        .maybeSingle();
                                                    if (ciError) {
                                                        console.warn('[INSTAGRAM WEBHOOK] Error reading contact instance:', ciError.message);
                                                    } else {
                                                        contactInstance = ci;
                                                    }
                                                } catch (cfgErr) {
                                                    console.error('[INSTAGRAM WEBHOOK] Exception resolving contact instance:', cfgErr);
                                                }
                                            }

                                            const contactNumber = String(contactInstance?.client_number || '').replace(/\D/g, '');

                                            // Link de agendamento do Instagram: o contato daqui é o do
                                            // IGSID (sem telefone), então o token vai marcado com
                                            // origin=instagram e a tela exige nome + WhatsApp antes de
                                            // agendar, trocando este contato pelo de WhatsApp.
                                            let bookingLinkError: string | null = null;
                                            if (!contactInstance) {
                                                bookingLinkError = 'Link de agendamento não gerado: esta conta de Instagram está sem "Número informado pela IA para contato". Defina a conexão de WhatsApp em Conexões > Instagram.';
                                            }

                                            // Tom de voz da conta (aba Tom de voz em /ia-config):
                                            // é da conta, não da conexão, então vale no Direct também.
                                            let toneInject: string | null = null;
                                            const { data: iaCfg, error: iaCfgError } = await supabase
                                                .from('ia_config')
                                                .select('tone_inject')
                                                .eq('user_id', userId)
                                                .maybeSingle();
                                            if (iaCfgError) {
                                                console.warn('[INSTAGRAM WEBHOOK] Error reading tone_inject:', iaCfgError.message);
                                            } else {
                                                toneInject = (iaCfg as any)?.tone_inject ?? null;
                                            }

                                            // Step 3: Build payload with bd_data
                                            // Mesmas chaves, na mesma ordem do WhatsApp
                                            // (_shared/bd-data.ts) — o que o Instagram não tem vai
                                            // com o mesmo valor neutro, nada é removido. As chaves
                                            // exclusivas do canal entram no fim.
                                            const bdData = await buildBdData(supabase, {
                                                userId,
                                                contactId: contact.id,
                                                conversationId: conversation.id,
                                                // Direct não tem grupo.
                                                groupId: null,
                                                // Conexão de WhatsApp usada pelas tools do n8n.
                                                instanceId: whatsappInstance.id,
                                                iaFunnelId,
                                                toneInject,
                                                // O card do funil deste contato é o da conta de Instagram.
                                                crmInstagramInstanceId: instagramInstance.id,
                                                // Campanha é por conexão de WhatsApp: no Direct o bloco
                                                // fica em 'sem campanha ativa'.
                                                campaignInstanceId: null,
                                                bookingInstanceId: contactInstance?.id ?? null,
                                                bookingOrigin: 'instagram',
                                                logPrefix: '[INSTAGRAM WEBHOOK]',
                                                extra: {
                                                    // Canal de origem: o n8n precisa saber que este
                                                    // contato não tem telefone.
                                                    channel: 'instagram',
                                                    // Número que a IA oferece quando o paciente quiser
                                                    // continuar no WhatsApp.
                                                    whatsapp_contact: contactInstance
                                                        ? {
                                                            instance_id: contactInstance.id,
                                                            instance_name: contactInstance.name || null,
                                                            number: contactNumber || null,
                                                            link: contactNumber ? `https://wa.me/${contactNumber}` : null,
                                                        }
                                                        : null,
                                                    ...(bookingLinkError ? { booking_link_error: bookingLinkError } : {}),
                                                },
                                            });

                                            // Envelope no formato UAZAPI, igual ao que o n8n já
                                            // recebe do WhatsApp (o meta-webhook normaliza a Cloud
                                            // API do mesmo jeito): o fluxo lê message.text,
                                            // message.messageType, message.pushName e chat.wa_chatid
                                            // sem saber de que canal veio. O evento cru do Direct
                                            // continua disponível em `_instagram.raw`.
                                            const forwardedPayload = {
                                                instanceName: instagramInstance.account_name || null,
                                                EventType: 'messages',
                                                message: {
                                                    messageid: messageId,
                                                    // Não existe telefone no Direct: o identificador
                                                    // do remetente é o IGSID nos três campos.
                                                    sender: senderId,
                                                    sender_pn: senderId,
                                                    pushName: contact.push_name || '',
                                                    messageType: uzapiMessageType,
                                                    text: messageText,
                                                    fromMe: false,
                                                    timestamp: timestamp
                                                        ? Math.floor(Number(timestamp) / 1000)
                                                        : Math.floor(Date.now() / 1000),
                                                    isGroup: false,
                                                    chatid: senderId,
                                                    content: {
                                                        text: messageText,
                                                        ...(mediaUrl ? { url: mediaUrl } : {}),
                                                    },
                                                    vote: '',
                                                    selectedDisplayText: '',
                                                },
                                                chat: {
                                                    wa_chatid: senderId,
                                                    wa_name: contact.push_name || '',
                                                    name: contact.push_name || '',
                                                },
                                                _instagram: {
                                                    instagram_instance_id: instagramInstance.id,
                                                    instagram_account_id: instagramInstance.instagram_account_id || null,
                                                    sender_igsid: senderId,
                                                    recipient_igsid: recipientId || null,
                                                    // Tipo cru do anexo, que o vocabulário do
                                                    // WhatsApp não distingue (story_mention, ig_reel).
                                                    attachment_type: igAttachmentType,
                                                    media_url: mediaUrl,
                                                    raw: event,
                                                },
                                                bd_data: bdData,
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
