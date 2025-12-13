import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZAPI_URL = 'https://clinvia.uazapi.com';

const mapMessageType = (uzapiType: string): string => {
    const typeMap: Record<string, string> = {
        'ExtendedTextMessage': 'text',
        'conversation': 'text',
        'imageMessage': 'image',
        'audioMessage': 'audio',
        'videoMessage': 'video',
        'documentMessage': 'document',
    };
    return typeMap[uzapiType] || 'text';
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const originalPayload = await req.json();
    console.log('[DEBUG] Full Webhook Payload:', JSON.stringify(originalPayload, null, 2));

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const webhookArray = Array.isArray(originalPayload) ? originalPayload : [originalPayload];
        const webhook = webhookArray[0];
        const body = webhook.body || webhook;

        console.log('[1] Uzapi webhook received:', {
            eventType: body.EventType,
            instanceName: body.instanceName,
            isGroup: body.chat?.wa_isGroup
        });

        if (body.EventType === 'messages' && body.chat?.wa_isGroup === false) {
            const instanceName = body.instanceName;

            const { data: instance, error: instanceError } = await supabaseClient
                .from('instances')
                .select('id, apikey, webhook_url')
                .single();

            if (!instanceError && instance) {
                console.log('[2] Processing message for instance:', instanceName);

                // Extract JID - Check candidates for valid user JID
                const jidCandidates = [
                    body.chat?.wa_chatid,
                    body.message?.chatid,
                    body.message?.sender,
                    body.key?.remoteJid,
                    body.sender // Fallback to root sender if available
                ];

                // Find the first candidate that is a string and contains @s.whatsapp.net
                const remoteJid = jidCandidates.find(jid =>
                    jid &&
                    typeof jid === 'string' &&
                    jid.includes('@s.whatsapp.net') // Ensure it's a valid user JID
                );

                if (!remoteJid) {
                    console.error('[ERROR] No valid user JID found. Aborting processing for this message.', { candidates: jidCandidates });
                    return new Response(
                        JSON.stringify({ success: false, error: 'No valid user JID found' }),
                        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const phoneNumber = remoteJid?.replace('@s.whatsapp.net', '').replace(/\D/g, '');
                console.log('[2.1] Extracted JID:', remoteJid, 'Phone:', phoneNumber);

                // 1. Check if contact exists
                let { data: contact } = await supabaseClient
                    .from('contacts')
                    .select('*')
                    .eq('remote_jid', remoteJid)
                    .single();

                // 2. If contact doesn't exist OR has missing info, fetch from API
                if (!contact || contact.push_name === 'Unknown' || !contact.profile_pic_url) {
                    console.log('[3] Fetching/Updating contact details from Uzapi for:', phoneNumber);

                    const detailsResponse = await fetch(`${UZAPI_URL}/chat/details`, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'token': instance.apikey
                        },
                        body: JSON.stringify({ number: phoneNumber, preview: false })
                    });

                    if (detailsResponse.ok) {
                        const detailsData = await detailsResponse.json();
                        console.log('[4] Raw API Response:', JSON.stringify(detailsData));

                        const contactInfo = Array.isArray(detailsData) ? detailsData[0] : detailsData;

                        if (contactInfo) {
                            const pushName = contactInfo.name || contactInfo.wa_name || 'Unknown';
                            const profilePic = contactInfo.imagePreview || null;

                            if (!contact) {
                                // Create new contact
                                const { data: newContact, error: createError } = await supabaseClient
                                    .from('contacts')
                                    .insert({
                                        remote_jid: remoteJid,
                                        push_name: pushName,
                                        profile_pic_url: profilePic,
                                        instance_id: instance.id
                                    })
                                    .select()
                                    .single();

                                if (createError) {
                                    console.error('[5] Error creating contact:', createError);
                                } else {
                                    contact = newContact;
                                    console.log('[5] Contact created:', contact);
                                }
                            } else {
                                // Update existing contact
                                const { data: updatedContact, error: updateError } = await supabaseClient
                                    .from('contacts')
                                    .update({
                                        push_name: pushName,
                                        profile_pic_url: profilePic,
                                        instance_id: instance.id
                                    })
                                    .eq('id', contact.id)
                                    .select()
                                    .single();

                                if (updateError) {
                                    console.error('[5] Error updating contact:', updateError);
                                } else {
                                    contact = updatedContact;
                                    console.log('[5] Contact updated:', contact);
                                }
                            }
                        } else {
                            console.warn('[4] API returned empty data for contact');
                        }
                    } else {
                        const errorText = await detailsResponse.text();
                        console.error('[4] Failed to fetch contact details:', errorText);
                    }
                } else {
                    console.log('[4] Contact found and valid:', contact.id);
                }

                // Ensure contact exists before creating conversation
                if (contact) {
                    const { data: conversations } = await supabaseClient
                        .from('conversations')
                        .select('*')
                        .eq('contact_id', contact.id)
                        .in('status', ['pending', 'open'])
                        .order('created_at', { ascending: false })
                        .limit(1);

                    let conversation;
                    if (conversations && conversations.length > 0) {
                        conversation = conversations[0];
                        await supabaseClient
                            .from('conversations')
                            .update({
                                unread_count: (conversation.unread_count || 0) + 1,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', conversation.id);
                        console.log('[6] Updated existing conversation');
                    } else {
                        const { data: newConversation } = await supabaseClient
                            .from('conversations')
                            .insert({
                                contact_id: contact.id,
                                status: 'pending',
                                unread_count: 1,
                                instance_id: instance.id
                            })
                            .select()
                            .single();
                        conversation = newConversation;
                        console.log('[6] Created new conversation');
                    }

                    const messageType = mapMessageType(body.message.messageType);
                    const messageText = body.message.text || body.message.content?.text || '';

                    await supabaseClient
                        .from('messages')
                        .insert({
                            conversation_id: conversation.id,
                            body: messageText,
                            direction: body.message.fromMe ? 'outbound' : 'inbound',
                            message_type: messageType,
                            evolution_id: body.message.id
                        });

                    console.log('[7] Message saved');
                }

                if (instance.webhook_url) {
                    console.log('[8] Forwarding to external webhook:', instance.webhook_url);

                    try {
                        await fetch(instance.webhook_url, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': 'Supabase-Webhook-Proxy/1.0'
                            },
                            body: JSON.stringify(originalPayload)
                        });
                        console.log('[9] Successfully forwarded to external webhook');
                    } catch (forwardError) {
                        console.error('[9] Failed to forward to external webhook:', forwardError);
                    }
                }
            } else {
                console.log('[2] Instance not found:', body.instanceName);
            }
        } else {
            console.log('[2] Ignoring event:', body.EventType || 'unknown');
        }

        return new Response(
            JSON.stringify({ success: true }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: any) {
        console.error('[ERROR] uzapi-webhook failed:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
