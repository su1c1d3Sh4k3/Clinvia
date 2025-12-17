// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Use web-push library via npm compatibility layer
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// VAPID Keys
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:contato@clinvia.com.br';

interface PushPayload {
    auth_user_id?: string;
    user_id?: string;
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
    tag?: string;
    notification_type?: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const payload: PushPayload = await req.json();
        const targetUserId = payload.auth_user_id || payload.user_id;

        if (!targetUserId || !payload.title || !payload.body) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[SEND-PUSH] User: ${targetUserId}`);

        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            console.error('[SEND-PUSH] VAPID keys not configured');
            return new Response(
                JSON.stringify({ error: 'VAPID keys not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Configure web-push with VAPID
        console.log('[SEND-PUSH] Configuring VAPID...');
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

        // Get subscriptions
        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', targetUserId);

        if (subError || !subscriptions?.length) {
            console.log('[SEND-PUSH] No subscriptions found');
            return new Response(
                JSON.stringify({ success: false, reason: 'no_subscriptions' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[SEND-PUSH] Found ${subscriptions.length} subscription(s)`);

        const notificationPayload = JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/pwa-icon.png',
            badge: payload.badge || '/pwa-icon.png',
            data: { url: payload.url || '/', tag: payload.tag || 'default' }
        });

        const results = { sent: 0, failed: 0, expired: [] as string[], errors: [] as string[] };

        for (const sub of subscriptions) {
            try {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                };

                console.log(`[SEND-PUSH] Sending to: ${sub.endpoint.substring(0, 50)}...`);

                await webpush.sendNotification(pushSubscription, notificationPayload);
                console.log('[SEND-PUSH] Notification sent successfully!');
                results.sent++;

            } catch (error: any) {
                console.error('[SEND-PUSH] Error:', error.message || error);

                // Check if subscription expired
                if (error.statusCode === 410 || error.statusCode === 404) {
                    results.expired.push(sub.id);
                } else {
                    results.failed++;
                    results.errors.push(error.message || String(error));
                }
            }
        }

        // Clean up expired subscriptions
        if (results.expired.length > 0) {
            await supabase.from('push_subscriptions').delete().in('id', results.expired);
            console.log(`[SEND-PUSH] Deleted ${results.expired.length} expired subscription(s)`);
        }

        console.log(`[SEND-PUSH] Result: sent=${results.sent}, failed=${results.failed}`);

        return new Response(
            JSON.stringify({
                success: results.sent > 0,
                sent: results.sent,
                failed: results.failed,
                expired: results.expired.length,
                errors: results.errors.slice(0, 3)
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[SEND-PUSH] Error:', error);
        return new Response(
            JSON.stringify({ error: error.message || String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
