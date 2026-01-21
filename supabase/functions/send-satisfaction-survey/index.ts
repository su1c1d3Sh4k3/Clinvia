// Edge Function: send-satisfaction-survey
// Sends an NPS button menu to a contact via UzAPI /send/menu endpoint

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZAPI_URL = 'https://clinvia.uazapi.com';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    console.log('[send-satisfaction-survey] Starting...');

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { contact_id, contact_number, conversation_id, instance_id } = await req.json();

        // Validate required fields
        if (!contact_id || !contact_number) {
            return new Response(
                JSON.stringify({ success: false, error: 'contact_id and contact_number are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[send-satisfaction-survey] Contact:', contact_id);
        console.log('[send-satisfaction-survey] Number:', contact_number);
        console.log('[send-satisfaction-survey] Conversation:', conversation_id);

        // Get instance to send from
        let instance;
        let userId: string | null = null;

        if (instance_id) {
            const { data, error } = await supabase
                .from('instances')
                .select('id, apikey, status, user_id')
                .eq('id', instance_id)
                .single();

            if (!error) {
                instance = data;
                userId = data.user_id;
            }
        }

        if (!instance && conversation_id) {
            console.log('[send-satisfaction-survey] Fetching conversation data...');
            const { data: conversation } = await supabase
                .from('conversations')
                .select('instance_id, user_id')
                .eq('id', conversation_id)
                .single();

            console.log('[send-satisfaction-survey] Conversation data:', conversation);

            // Get userId from conversation directly
            if (conversation?.user_id && !userId) {
                userId = conversation.user_id;
                console.log('[send-satisfaction-survey] Got userId from conversation:', userId);
            }

            if (conversation?.instance_id) {
                const { data } = await supabase
                    .from('instances')
                    .select('id, apikey, status, user_id')
                    .eq('id', conversation.instance_id)
                    .single();

                if (data) {
                    instance = data;
                    if (!userId) userId = data.user_id;
                }
            }
        }

        if (!instance) {
            const { data: contact } = await supabase
                .from('contacts')
                .select('user_id')
                .eq('id', contact_id)
                .single();

            if (contact?.user_id) {
                userId = contact.user_id;
                const { data } = await supabase
                    .from('instances')
                    .select('id, apikey, status, user_id')
                    .eq('user_id', contact.user_id)
                    .eq('status', 'connected')
                    .limit(1)
                    .single();

                if (data) instance = data;
            }
        }

        if (!instance?.apikey) {
            console.error('[send-satisfaction-survey] No instance found');
            return new Response(
                JSON.stringify({ success: false, error: 'No connected instance found' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[send-satisfaction-survey] Using instance:', instance.id);

        // Format phone number
        let phoneNumber = contact_number;
        if (phoneNumber.includes('@')) {
            phoneNumber = phoneNumber.split('@')[0];
        }

        // Create unique track_id for this survey
        const trackId = `nps_${contact_id}_${conversation_id || 'manual'}_${Date.now()}`;

        // Survey message text
        const surveyText = "Sua opinião e feedback é muito importante para seguirmos melhorando. Como você avalia sua consulta?";

        // Build button payload for UzAPI (type: button with IDs for tracking)
        const buttonPayload = {
            number: phoneNumber,
            type: "button",
            text: surveyText,
            choices: [
                "⭐⭐⭐⭐⭐ Excelente|nps_5",
                "⭐⭐⭐⭐ Muito Bom|nps_4",
                "⭐⭐⭐ Bom|nps_3",
                "⭐⭐ Regular|nps_2",
                "⭐ Ruim|nps_1"
            ],
            track_source: "nps_survey",
            track_id: trackId
        };

        console.log('[send-satisfaction-survey] Sending button menu:', JSON.stringify(buttonPayload));

        // Send button menu via UzAPI
        const response = await fetch(`${UZAPI_URL}/send/menu`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'token': instance.apikey
            },
            body: JSON.stringify(buttonPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[send-satisfaction-survey] UzAPI error:', errorText);
            return new Response(
                JSON.stringify({ success: false, error: `UzAPI error: ${errorText}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const result = await response.json();
        console.log('[send-satisfaction-survey] UzAPI response:', result);

        // Save the outbound message to the database so it renders in chat
        if (conversation_id && userId) {
            const { error: msgError } = await supabase
                .from('messages')
                .insert({
                    conversation_id: conversation_id,
                    body: surveyText,
                    direction: 'outbound',
                    message_type: 'text',
                    user_id: userId,
                    status: 'sent',
                    evolution_id: result.messageid || null
                });

            if (msgError) {
                console.error('[send-satisfaction-survey] Error saving message:', msgError);
            } else {
                console.log('[send-satisfaction-survey] Message saved to database');
            }

            // Update conversation timestamp
            await supabase
                .from('conversations')
                .update({
                    updated_at: new Date().toISOString(),
                    last_message_at: new Date().toISOString()
                })
                .eq('id', conversation_id);
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Pesquisa de satisfação enviada com sucesso',
                track_id: trackId,
                uzapi_response: result
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[send-satisfaction-survey] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
