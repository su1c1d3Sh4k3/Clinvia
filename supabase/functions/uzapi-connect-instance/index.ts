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

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { instanceId, phoneNumber } = await req.json();

        console.log('[1] Connecting Uzapi instance:', instanceId, 'with phone:', phoneNumber);

        // Get instance token from database
        const { data: instance, error: fetchError } = await supabaseClient
            .from('instances')
            .select('apikey, name')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) {
            throw new Error('Instance not found');
        }

        const instanceToken = instance.apikey;

        // Call Uzapi to connect instance with phone
        const uzapiResponse = await fetch(`${UZAPI_URL}/instance/connect`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'token': instanceToken
            },
            body: JSON.stringify({
                phone: phoneNumber
            })
        });

        if (!uzapiResponse.ok) {
            const errorText = await uzapiResponse.text();
            console.error('[2] Uzapi Connect Error:', errorText);
            throw new Error(`Failed to connect: ${errorText}`);
        }

        const uzapiData = await uzapiResponse.json();
        console.log('[3] Uzapi connect response:', uzapiData);

        // Handle Array Response
        const responseItem = Array.isArray(uzapiData) ? uzapiData[0] : uzapiData;
        const instanceData = responseItem.instance || {};

        const pairCode = instanceData.paircode || '';
        const connectionStatus = instanceData.status || 'connecting';
        const instanceName = instanceData.name || instance.name;
        const token = instanceData.token || instanceToken;

        // Construct webhook URL
        // 'webhook_url': https://webhooks.clinvia.com.br/webhook/<nome_da_instancia_criada_campo_name_do_payload>
        const webhookUrl = `https://webhooks.clinvia.com.br/webhook/${instanceName}`;

        // Update database with all fields
        const { error: updateError } = await supabaseClient
            .from('instances')
            .update({
                pin_code: pairCode,
                client_number: phoneNumber, // Assuming this is client_number
                user_name: phoneNumber, // User requested 'user_name' to be the phone number
                status: connectionStatus,
                instance_name: instanceName,
                webhook_url: webhookUrl,
                server_url: UZAPI_URL,
                apikey: token
            })
            .eq('id', instanceId);

        if (updateError) {
            console.error('[4] Database Update Error:', updateError);
            throw updateError;
        }

        console.log('[5] Instance updated with paircode:', pairCode);

        return new Response(
            JSON.stringify({
                success: true,
                pairCode: pairCode,
                status: connectionStatus
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: any) {
        console.error('[ERROR] uzapi-connect-instance failed:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
