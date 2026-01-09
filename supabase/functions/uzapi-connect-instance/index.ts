import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZAPI_URL = 'https://clinvia.uazapi.com';
const SUPABASE_WEBHOOK_URL = 'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/webhook-queue-receiver';

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
            console.error('[1.1] Instance not found:', fetchError);
            return new Response(
                JSON.stringify({ success: false, error: 'Instância não encontrada' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const instanceToken = instance.apikey;

        if (!instanceToken) {
            console.error('[1.2] Instance token missing');
            return new Response(
                JSON.stringify({ success: false, error: 'Token da instância não encontrado' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ===== STEP 1: CONFIGURE WEBHOOK FIRST =====
        console.log('[2] Configuring webhook for instance BEFORE generating pair code...');

        const webhookConfigResponse = await fetch(`${UZAPI_URL}/webhook`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'token': instanceToken
            },
            body: JSON.stringify({
                enabled: true,
                url: SUPABASE_WEBHOOK_URL,
                events: ["messages", "connection", "messages_update"],
                excludeMessages: ["wasSentByApi"]
            })
        });

        const webhookResponseText = await webhookConfigResponse.text();
        console.log('[2.1] Webhook config status:', webhookConfigResponse.status);
        console.log('[2.2] Webhook config response:', webhookResponseText);

        if (!webhookConfigResponse.ok) {
            console.error('[2.3] WARNING: Webhook configuration failed, but continuing with pair code generation');
            // Don't fail here, just log - we'll continue anyway
        } else {
            console.log('[2.4] ✅ Webhook configured successfully!');
        }

        // ===== STEP 2: GENERATE PAIR CODE =====
        console.log('[3] Generating pair code for phone:', phoneNumber);

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
            console.error('[3.1] Uzapi Connect Error:', errorText);
            return new Response(
                JSON.stringify({ success: false, error: `Falha ao conectar: ${errorText}` }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const uzapiData = await uzapiResponse.json();
        console.log('[3.2] Uzapi connect response:', JSON.stringify(uzapiData));

        // Handle Array Response
        const responseItem = Array.isArray(uzapiData) ? uzapiData[0] : uzapiData;
        const instanceData = responseItem.instance || {};

        const pairCode = instanceData.paircode || '';
        const connectionStatus = instanceData.status || 'connecting';
        const instanceName = instanceData.name || instance.name;
        const token = instanceData.token || instanceToken;

        if (!pairCode) {
            console.error('[3.3] No pair code received:', uzapiData);
            return new Response(
                JSON.stringify({ success: false, error: 'Código de pareamento não recebido. Tente novamente.' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // External webhook URL for n8n
        const externalWebhookUrl = `https://webhooks.clinvia.com.br/webhook/${instanceName}`;

        // ===== STEP 3: UPDATE DATABASE =====
        console.log('[4] Updating database with pair code and webhook info...');

        const { error: updateError } = await supabaseClient
            .from('instances')
            .update({
                pin_code: pairCode,
                client_number: phoneNumber,
                user_name: phoneNumber,
                status: connectionStatus,
                instance_name: instanceName,
                webhook_url: externalWebhookUrl,
                server_url: UZAPI_URL,
                apikey: token
            })
            .eq('id', instanceId);

        if (updateError) {
            console.error('[4.1] Database Update Error:', updateError);
            // Don't fail, pair code was already generated
        }

        console.log('[5] ✅ Instance connected successfully! Pair code:', pairCode);

        return new Response(
            JSON.stringify({
                success: true,
                pairCode: pairCode,
                status: connectionStatus,
                webhookConfigured: webhookConfigResponse.ok
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
                error: error.message || 'Erro desconhecido ao conectar instância'
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
