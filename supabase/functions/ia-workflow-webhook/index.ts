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

        // Call external webhook with timeout (10s)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        let response: Response;
        try {
            response = await fetch(webhookUrl, {
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
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }

        const responseText = await response.text();
        console.log('[ia-workflow-webhook] Response status:', response.status);
        console.log('[ia-workflow-webhook] Response body:', responseText);

        // IMPORTANTE: sempre retorna HTTP 200 para o cliente Supabase não definir `error`.
        // O campo `success` no body indica se o webhook externo funcionou.
        // Isso permite que o frontend atualize o banco mesmo se o webhook externo falhar.
        if (!response.ok) {
            console.warn('[ia-workflow-webhook] External webhook returned error:', response.status, responseText);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: `Webhook externo retornou ${response.status}`,
                    details: responseText
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Webhook chamado com sucesso', response: responseText }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        const isTimeout = error.name === 'AbortError';
        console.error('[ia-workflow-webhook] Error:', isTimeout ? 'Timeout (10s)' : error.message);
        // Sempre retorna 200 para não bloquear o update no banco do cliente
        return new Response(
            JSON.stringify({
                success: false,
                error: isTimeout ? 'Timeout ao chamar webhook externo' : error.message
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
