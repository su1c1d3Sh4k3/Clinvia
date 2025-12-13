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

        console.log('[1] Setting Webhook for instance:', instanceId);

        // 1. Get Instance Token from DB
        const { data: instance, error: fetchError } = await supabaseClient
            .from('instances')
            .select('apikey, webhook_url')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) {
            throw new Error('Instance not found');
        }

        if (!instance.apikey) {
            throw new Error('Instance token not found');
        }

        // Use the webhook URL stored in DB or default to the function URL
        // The user provided "https://swfshqvvbohnahdyndch.supabase.co/functions/v1/uzapi-webhook-refactor"
        // We should probably use that or the one in the DB if it's correct.
        // Let's use the one from the user's example as a default if DB is empty, but DB should have it from creation.

        const webhookUrl = instance.webhook_url || "https://swfshqvvbohnahdyndch.supabase.co/functions/v1/uzapi-webhook-refactor";

        // 2. Set Webhook on Uzapi
        const uzapiResponse = await fetch(`${UZAPI_URL}/webhook`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'token': instance.apikey
            },
            body: JSON.stringify({
                enabled: true,
                url: webhookUrl,
                events: [
                    "messages",
                    "connection"
                ],
                excludeMessages: [
                    "wasSentByApi"
                ]
            })
        });

        if (!uzapiResponse.ok) {
            const errorText = await uzapiResponse.text();
            console.error('[2] Uzapi Set Webhook Error:', errorText);
            throw new Error(`Failed to set webhook: ${errorText}`);
        }

        const uzapiData = await uzapiResponse.json();
        console.log('[3] Webhook set successfully:', uzapiData);

        return new Response(
            JSON.stringify({ success: true, data: uzapiData }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );

    } catch (error: any) {
        console.error('Error in uzapi-set-webhook:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
