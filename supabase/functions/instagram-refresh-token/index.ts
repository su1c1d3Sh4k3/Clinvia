import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { fetchProvider } from "../_shared/provider-errors.ts";
import { apiError } from "../_shared/api-errors.ts";
import { reportIncident } from "../_shared/report-incident.ts";

// =============================================
// Instagram Token Refresh
// Refreshes long-lived access tokens before expiration
// =============================================
//
// ENDPOINT: POST /functions/v1/instagram-refresh-token
//
// PAYLOAD:
// {
//   "instance_id": "uuid"  // ID of the instagram_instances record
// }
//
// RESPONSE SUCCESS:
// {
//   "success": true,
//   "message": "Token refreshed successfully",
//   "new_expires_at": "ISO date string",
//   "expires_in_days": number
// }
//
// NOTE: Per Instagram API docs, tokens can only be refreshed
// if they are still valid (not expired). If expired, user must
// re-authenticate.
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-origin',
};

serveMonitored("instagram-refresh-token", async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { instance_id } = await req.json();

        if (!instance_id) {
            return new Response(
                JSON.stringify({ success: false, error: 'instance_id is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[INSTAGRAM REFRESH] Starting token refresh for instance:', instance_id);

        // Get the instance with current token
        const { data: instance, error: instanceError } = await supabase
            .from('instagram_instances')
            .select('*')
            .eq('id', instance_id)
            .single();

        if (instanceError || !instance) {
            console.error('[INSTAGRAM REFRESH] Instance not found:', instanceError);
            return new Response(
                JSON.stringify({ success: false, error: 'Instagram instance not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[INSTAGRAM REFRESH] Found instance:', instance.account_name);
        console.log('[INSTAGRAM REFRESH] Current token expires at:', instance.token_expires_at);

        // Check if token is already expired
        if (instance.token_expires_at) {
            const expiresAt = new Date(instance.token_expires_at);
            if (expiresAt < new Date()) {
                console.error('[INSTAGRAM REFRESH] Token already expired, cannot refresh');
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: 'Token already expired. User must re-authenticate.',
                        code: 'TOKEN_EXPIRED'
                    }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // Call Instagram API to refresh token
        // Endpoint: GET https://graph.instagram.com/refresh_access_token
        //   ?grant_type=ig_refresh_token
        //   &access_token={long-lived-access-token}
        const refreshUrl = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${instance.access_token}`;

        console.log('[INSTAGRAM REFRESH] Calling Instagram API...');
        const response = await fetchProvider(refreshUrl);
        const data = await response.json();

        console.log('[INSTAGRAM REFRESH] API Response status:', response.status);
        console.log('[INSTAGRAM REFRESH] API Response:', JSON.stringify(data));

        if (!response.ok || data.error) {
            console.error('[INSTAGRAM REFRESH] API Error:', data.error?.message || data);

            // Mark instance as expired if token is invalid
            if (data.error?.code === 190) {
                await supabase
                    .from('instagram_instances')
                    .update({ status: 'expired' })
                    .eq('id', instance_id);
            }

            // DEFEITO NOSSO, nao problema da conta do cliente: chegamos aqui com
            // um token que AINDA VALE (o vencido ja saiu em 401 la em cima) e a
            // renovacao automatica — que existe justamente para ele nunca precisar
            // reconectar — falhou. Se ninguem for avisado agora, a conta vence em
            // silencio e so descobrimos quando o Direct parar.
            reportIncident({
                component: `instagram:renovacao-falhou (@${instance.account_name || 'conta desconhecida'})`,
                route: 'refresh_access_token',
                origem: 'cron',
                ownerId: instance.user_id ?? null,
                httpCode: response.status,
                error: `Renovacao automatica do token falhou com o token ainda valido (vence em ${instance.token_expires_at}): ${data.error?.message || JSON.stringify(data)}`,
            });

            return new Response(
                JSON.stringify({
                    success: false,
                    error: data.error?.message || 'Failed to refresh token',
                    code: data.error?.code
                }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Calculate new expiration date
        const expiresInSeconds = data.expires_in || 5184000; // 60 days default
        const newExpiresAt = new Date(Date.now() + (expiresInSeconds * 1000));
        const expiresInDays = Math.round(expiresInSeconds / 86400);

        console.log('[INSTAGRAM REFRESH] ✅ Token refreshed successfully!');
        console.log('[INSTAGRAM REFRESH] New token expires in:', expiresInDays, 'days');
        console.log('[INSTAGRAM REFRESH] New expires_at:', newExpiresAt.toISOString());

        // Update the instance with new token and expiration
        const { error: updateError } = await supabase
            .from('instagram_instances')
            .update({
                access_token: data.access_token,
                token_expires_at: newExpiresAt.toISOString(),
                status: 'connected',
                updated_at: new Date().toISOString()
            })
            .eq('id', instance_id);

        if (updateError) {
            console.error('[INSTAGRAM REFRESH] Failed to update instance:', updateError);
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to save new token' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Token refreshed successfully',
                new_expires_at: newExpiresAt.toISOString(),
                expires_in_days: expiresInDays
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        return apiError(corsHeaders, {
            status: 500,
            code: "ig_refresh_failed",
            request: req,
            report: true,
            message: "Não foi possível renovar o token do Instagram. Reconecte a conta pela tela de Conexões.",
            details: String(error?.message ?? error),
        });
    }
});
