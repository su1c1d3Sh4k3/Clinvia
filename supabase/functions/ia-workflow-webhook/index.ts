import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Campo vazio (null, '' ou só espaço) viaja como null no payload do n8n. */
function blankToNull(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

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
        const { action, user_id, instance_id, instance_name, phone, token } = body;

        // Canal da conexão que ligou/desligou a IA. O n8n precisa disso para saber
        // se o fluxo atende WhatsApp ou Instagram (no Instagram não há phone/token).
        // Quem chama informa; sem isso, resolve pelo instance_id no banco — assim o
        // Instagram não é rotulado como WhatsApp quando o front está desatualizado.
        let platform: 'whatsapp' | 'instagram' =
            body.platform === 'instagram' ? 'instagram' : 'whatsapp';

        if (body.platform !== 'instagram' && body.platform !== 'whatsapp' && instance_id) {
            try {
                const supabase = createClient(
                    Deno.env.get('SUPABASE_URL')!,
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
                );
                const { data: igRow, error: igError } = await supabase
                    .from('instagram_instances')
                    .select('id')
                    .eq('id', instance_id)
                    .maybeSingle();

                if (igError) {
                    console.warn('[ia-workflow-webhook] Error resolving platform:', igError.message);
                } else if (igRow) {
                    platform = 'instagram';
                }
            } catch (resolveError) {
                console.error('[ia-workflow-webhook] Exception resolving platform:', resolveError);
            }
        }

        // Credencial do OpenAI da conta dentro do n8n. Lida aqui com service role
        // porque `profiles` tem grant por COLUNA e essas duas não foram concedidas
        // ao front — ele não consegue ler para mandar no corpo. Vazio vai como null.
        let n8nOpenaiCredentialId: string | null = null;
        let n8nOpenaiCredentialName: string | null = null;

        if (user_id) {
            try {
                const supabase = createClient(
                    Deno.env.get('SUPABASE_URL')!,
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
                );
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('n8n_openai_credential_id, n8n_openai_credential_name')
                    .eq('id', user_id)
                    .maybeSingle();

                if (profileError) {
                    // Não fatal: ligar/desligar a IA não pode travar por causa disso.
                    console.warn('[ia-workflow-webhook] Error reading n8n credential:', profileError.message);
                } else if (profile) {
                    n8nOpenaiCredentialId = blankToNull(profile.n8n_openai_credential_id);
                    n8nOpenaiCredentialName = blankToNull(profile.n8n_openai_credential_name);
                }
            } catch (credentialError) {
                console.error('[ia-workflow-webhook] Exception reading n8n credential:', credentialError);
            }
        }

        console.log('[ia-workflow-webhook] Action:', action);
        console.log('[ia-workflow-webhook] Payload:', {
            user_id,
            instance_id,
            instance_name,
            platform,
            phone,
            token: token ? '***' : '',
            n8n_openai_credential_id: n8nOpenaiCredentialId,
            n8n_openai_credential_name: n8nOpenaiCredentialName,
        });

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
                    instance_id,
                    instance_name,
                    platform,
                    phone,
                    token,
                    n8n_openai_credential_id: n8nOpenaiCredentialId,
                    n8n_openai_credential_name: n8nOpenaiCredentialName,
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
