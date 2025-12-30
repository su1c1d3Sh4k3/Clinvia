import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ia-workflow-webhook
 * 
 * Proxy function to call external IA workflow webhooks
 * Avoids CORS issues when calling from frontend
 */
serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { action, user_id, instance_name, phone, token } = body;

        console.log('[ia-workflow-webhook] Action:', action);
        console.log('[ia-workflow-webhook] Payload:', { user_id, instance_name, phone, token: token ? '***' : '' });

        // Validate action
        if (!action || !['create', 'delete'].includes(action)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid action. Must be "create" or "delete"' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Determine webhook URL based on action
        const webhookUrl = action === 'create'
            ? 'https://webhooks.clinvia.com.br/webhook/criar_workflow'
            : 'https://webhooks.clinvia.com.br/webhook/deleta_workflow';

        console.log('[ia-workflow-webhook] Calling:', webhookUrl);

        // Call external webhook
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id,
                instance_name,
                phone,
                token,
            }),
        });

        const responseText = await response.text();
        console.log('[ia-workflow-webhook] Response status:', response.status);
        console.log('[ia-workflow-webhook] Response body:', responseText);

        if (!response.ok) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: `Webhook failed: ${response.status}`,
                    details: responseText
                }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Webhook called successfully', response: responseText }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[ia-workflow-webhook] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
