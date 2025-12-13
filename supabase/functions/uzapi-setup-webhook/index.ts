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

        const { instanceId } = await req.json();

        console.log('[1] Setting up webhook for instance:', instanceId);

        // Get instance data from database
        const { data: instance, error: fetchError } = await supabaseClient
            .from('instances')
            .select('apikey, webhook_url')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) {
            throw new Error('Instance not found');
        }

        const instanceToken = instance.apikey;

        // Webhook will point to Supabase function (middleware)
        const supabaseWebhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/uzapi-webhook`;

        console.log('[2] Configuring Uzapi webhook to:', supabaseWebhookUrl);

        // Call Uzapi to setup webhook
        const uzapiResponse = await fetch(`${UZAPI_URL}/webhook`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'token': instanceToken
            },
            body: JSON.stringify({
                enabled: true,
                url: supabaseWebhookUrl,
                events: ['messages', 'connection'],
                excludeMessages: ['wasSentByApi']
            })
        });

        if (!uzapiResponse.ok) {
            const errorText = await uzapiResponse.text();
            console.error('[3] Uzapi Webhook Error:', errorText);
            throw new Error(`Failed to setup webhook: ${errorText}`);
        }

        const webhookData = await uzapiResponse.json();
        console.log('[4] Webhook configured successfully:', webhookData);

        // Update instance status to connected
        const { error: updateError } = await supabaseClient
            .from('instances')
            .update({
                status: 'connected'
            })
            .eq('id', instanceId);

        if (updateError) {
            console.error('[5] Database Update Error:', updateError);
            throw updateError;
        }

        console.log('[6] Instance status updated to connected');

        return new Response(
            JSON.stringify({
                success: true
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: any) {
        console.error('[ERROR] uzapi-setup-webhook failed:', error);
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
