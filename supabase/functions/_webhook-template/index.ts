import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZAPI_URL = 'https://clinvia.uazapi.com';
const INSTANCE_NAME = '{{INSTANCE_NAME}}'; // Will be replaced by generator

// Map Uzapi message types to database message types
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

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const webhookArray = await req.json();
        const webhook = Array.isArray(webhookArray) ? webhookArray[0] : webhookArray;
        const body = webhook.body || webhook;

        console.log(`[${INSTANCE_NAME}][1] Webhook received:`, {
            eventType: body.EventType,
            isGroup: body.chat?.wa_isGroup
        });

        if (body.EventType !== 'messages') {
            console.log(`[${INSTANCE_NAME}][2] Ignoring non-message event`);
            return new Response(JSON.stringify({ success: true, ignored: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (body.chat?.wa_isGroup === true) {
            console.log(`[${INSTANCE_NAME}][3] Ignoring group message`);
            return new Response(JSON.stringify({ success: true, ignored: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { data: instance, error: instanceError } = await supabaseClient
            .from('instances')
            .select('id, apikey, instance_name')
            .eq('instance_name', INSTANCE_NAME)
            .single();

        if (instanceError || !instance) {
            console.error(`[${INSTANCE_NAME}][4] Instance not found in database`);
            return new Response(JSON.stringify({ error: 'Instance not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`[${INSTANCE_NAME}][5] Instance found`);

        const remoteJid = body.message.sender;
        const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');

        let { data: contact } = await supabaseClient
            .from('contacts')
            .select('*')
            .eq('remote_jid', remoteJid)
            .single();

        if (!contact) {
            console.log(`[${INSTANCE_NAME}][6] Fetching contact details from Uzapi`);

            const detailsResponse = await fetch(`${UZAPI_URL}/chat/details`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'token': instance.apikey
                },
                body: JSON.stringify({
                    number: phoneNumber,
                    preview: false
                })
            });

            if (!detailsResponse.ok) {
                throw new Error('Failed to fetch contact details');
            }

            const detailsData = await detailsResponse.json();
            const contactDetails = Array.isArray(detailsData) ? detailsData[0] : detailsData;

            const { data: newContact, error: createContactError } = await supabaseClient
                .from('contacts')
                .insert({
                    remote_jid: remoteJid,
                    push_name: contactDetails.name || contactDetails.wa_name || 'Unknown',
                    profile_pic_url: contactDetails.imagePreview || null,
                    instance_id: instance.id
                })
                .select()
                .single();

            if (createContactError) throw createContactError;

            contact = newContact;
            console.log(`[${INSTANCE_NAME}][7] Contact created`);
        } else {
            console.log(`[${INSTANCE_NAME}][8] Contact found`);
        }

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
            console.log(`[${INSTANCE_NAME}][9] Using existing conversation`);

            await supabaseClient
                .from('conversations')
                .update({
                    unread_count: (conversation.unread_count || 0) + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', conversation.id);
        } else {
            console.log(`[${INSTANCE_NAME}][10] Creating new conversation`);

            const { data: newConversation, error: createConversationError } = await supabaseClient
                .from('conversations')
                .insert({
                    contact_id: contact.id,
                    status: 'pending',
                    unread_count: 1
                })
                .select()
                .single();

            if (createConversationError) throw createConversationError;
            conversation = newConversation;
        }

        const messageType = mapMessageType(body.message.messageType);
        const messageText = body.message.text || body.message.content?.text || '';

        const { data: savedMessage, error: messageSaveError } = await supabaseClient
            .from('messages')
            .insert({
                conversation_id: conversation.id,
                body: messageText,
                direction: body.message.fromMe ? 'outbound' : 'inbound',
                message_type: messageType,
                evolution_id: body.message.id
            })
            .select()
            .single();

        if (messageSaveError) throw messageSaveError;

        console.log(`[${INSTANCE_NAME}][11] Message saved successfully`);

        return new Response(
            JSON.stringify({
                success: true,
                contact_id: contact.id,
                conversation_id: conversation.id,
                message_id: savedMessage.id
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: any) {
        console.error(`[${INSTANCE_NAME}][ERROR]`, error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
