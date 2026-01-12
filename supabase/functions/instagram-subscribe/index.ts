import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram Webhook Subscribe - Utility Function
// Forces webhook subscription for an Instagram instance
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { user_id, instagram_account_id } = await req.json();

        console.log('[INSTAGRAM SUBSCRIBE] Starting subscription for:', instagram_account_id || 'all instances');

        // Initialize Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get Instagram instances
        let query = supabase
            .from('instagram_instances')
            .select('id, user_id, access_token, instagram_account_id, account_name, status');

        if (user_id) {
            query = query.eq('user_id', user_id);
        }
        if (instagram_account_id) {
            query = query.eq('instagram_account_id', instagram_account_id);
        }

        const { data: instances, error } = await query;

        if (error) {
            console.error('[INSTAGRAM SUBSCRIBE] Database error:', error);
            return new Response(
                JSON.stringify({ success: false, error: error.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!instances || instances.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'No Instagram instances found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const results: any[] = [];

        for (const instance of instances) {
            console.log('[INSTAGRAM SUBSCRIBE] Processing:', instance.account_name, 'ID:', instance.instagram_account_id);

            try {
                // Subscribe to webhooks using the correct endpoint
                const subscribedFields = 'messages,messaging_postbacks,messaging_seen,messaging_referral';
                const subscribeUrl = `https://graph.instagram.com/v24.0/${instance.instagram_account_id}/subscribed_apps?access_token=${instance.access_token}&subscribed_fields=${subscribedFields}`;

                console.log('[INSTAGRAM SUBSCRIBE] Calling subscription endpoint for IGSID:', instance.instagram_account_id);

                const subscribeResponse = await fetch(subscribeUrl, {
                    method: 'POST'
                });

                const subscribeData = await subscribeResponse.json();
                console.log('[INSTAGRAM SUBSCRIBE] Response status:', subscribeResponse.status);
                console.log('[INSTAGRAM SUBSCRIBE] Response:', JSON.stringify(subscribeData));

                if (subscribeResponse.ok && subscribeData.success) {
                    results.push({
                        account_name: instance.account_name,
                        instagram_account_id: instance.instagram_account_id,
                        status: 'subscribed',
                        message: 'Successfully subscribed to webhooks'
                    });
                } else {
                    results.push({
                        account_name: instance.account_name,
                        instagram_account_id: instance.instagram_account_id,
                        status: 'failed',
                        error: subscribeData.error?.message || 'Unknown error',
                        full_response: subscribeData
                    });
                }
            } catch (subError: any) {
                console.error('[INSTAGRAM SUBSCRIBE] Error for', instance.account_name, ':', subError.message);
                results.push({
                    account_name: instance.account_name,
                    instagram_account_id: instance.instagram_account_id,
                    status: 'error',
                    error: subError.message
                });
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Processed ${results.length} instance(s)`,
                results
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('[INSTAGRAM SUBSCRIBE] Fatal error:', err);
        return new Response(
            JSON.stringify({ success: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
