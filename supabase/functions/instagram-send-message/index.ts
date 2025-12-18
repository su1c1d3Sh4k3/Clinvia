import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram Send Message
// Sends messages via Instagram Graph API
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessagePayload {
    instagram_instance_id: string;
    recipient_id: string;
    message_text: string;
    conversation_id?: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const payload: SendMessagePayload = await req.json();
        console.log('[INSTAGRAM SEND] Payload:', JSON.stringify(payload));

        const { instagram_instance_id, recipient_id, message_text, conversation_id } = payload;

        if (!instagram_instance_id || !recipient_id || !message_text) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get Instagram instance with access token
        const { data: instance, error: instanceError } = await supabase
            .from('instagram_instances')
            .select('*')
            .eq('id', instagram_instance_id)
            .single();

        if (instanceError || !instance) {
            console.error('[INSTAGRAM SEND] Instance not found:', instanceError);
            return new Response(
                JSON.stringify({ success: false, error: 'Instagram instance not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[INSTAGRAM SEND] Using instance:', instance.account_name);

        // Send message via Instagram Graph API
        const apiUrl = `https://graph.instagram.com/v21.0/me/messages`;
        const messagePayload = {
            recipient: { id: recipient_id },
            message: { text: message_text }
        };

        console.log('[INSTAGRAM SEND] Sending to API:', apiUrl);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${instance.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(messagePayload)
        });

        const responseData = await response.json();
        console.log('[INSTAGRAM SEND] API Response:', JSON.stringify(responseData));

        if (!response.ok) {
            // Check if token expired
            if (responseData.error?.code === 190) {
                console.error('[INSTAGRAM SEND] Access token expired');
                // Update instance status to expired
                await supabase
                    .from('instagram_instances')
                    .update({ status: 'expired' })
                    .eq('id', instagram_instance_id);

                return new Response(
                    JSON.stringify({ success: false, error: 'Access token expired', code: 'TOKEN_EXPIRED' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            return new Response(
                JSON.stringify({ success: false, error: responseData.error?.message || 'Failed to send message' }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const messageId = responseData.message_id;
        console.log('[INSTAGRAM SEND] ✅ Message sent, ID:', messageId);

        // Save outbound message to database
        if (conversation_id) {
            const { error: dbError } = await supabase
                .from('messages')
                .insert({
                    conversation_id: conversation_id,
                    body: message_text,
                    direction: 'outbound',
                    message_type: 'text',
                    evolution_id: messageId,
                    user_id: instance.user_id,
                    status: 'sent'
                });

            if (dbError) {
                console.error('[INSTAGRAM SEND] Error saving message:', dbError);
            } else {
                console.log('[INSTAGRAM SEND] Message saved to database');

                // Update conversation last_message
                await supabase
                    .from('conversations')
                    .update({
                        last_message: message_text,
                        updated_at: new Date().toISOString(),
                        last_message_at: new Date().toISOString()
                    })
                    .eq('id', conversation_id);
            }
        }

        return new Response(
            JSON.stringify({ success: true, message_id: messageId }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[INSTAGRAM SEND] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
