// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// VAPID Keys - Replace with your own keys
// Generate at: https://vapidkeys.com/ or using web-push library
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:contato@clinvia.com.br';

interface PushPayload {
    user_id: string;
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
    tag?: string;
    notification_type?: string;
}

// Web Push implementation for Deno
async function sendWebPush(subscription: any, payload: string): Promise<boolean> {
    const endpoint = subscription.endpoint;
    const p256dh = subscription.p256dh;
    const auth = subscription.auth;

    // For web-push we need to use the Web Push library
    // Since Deno doesn't have native web-push, we'll use a fetch-based approach
    // This is a simplified version - for production, consider using a service like Firebase Cloud Messaging

    try {
        // Import web-push compatible module for Deno
        const webPush = await import('https://esm.sh/web-push@3.6.7');

        webPush.setVapidDetails(
            VAPID_SUBJECT,
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY
        );

        await webPush.sendNotification(
            {
                endpoint,
                keys: {
                    p256dh,
                    auth
                }
            },
            payload
        );

        return true;
    } catch (error) {
        console.error('Error sending push notification:', error);

        // If subscription is expired or invalid, return false to delete it
        if (error.statusCode === 410 || error.statusCode === 404) {
            return false;
        }

        throw error;
    }
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const payload: PushPayload = await req.json();

        if (!payload.user_id || !payload.title || !payload.body) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: user_id, title, body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[SEND-PUSH] Sending push to user: ${payload.user_id}`);

        // Check if VAPID keys are configured
        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            console.error('[SEND-PUSH] VAPID keys not configured');
            return new Response(
                JSON.stringify({ error: 'VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check user's push notification preferences
        const { data: teamMember, error: teamMemberError } = await supabase
            .from('team_members')
            .select('push_notification_preferences')
            .eq('user_id', payload.user_id)
            .single();

        if (teamMemberError) {
            console.error('[SEND-PUSH] Error fetching team member:', teamMemberError);
        }

        // Check if this notification type is enabled
        const preferences = teamMember?.push_notification_preferences || {};
        const notificationType = payload.notification_type;

        if (notificationType && preferences[notificationType] === false) {
            console.log(`[SEND-PUSH] Notification type ${notificationType} is disabled for user`);
            return new Response(
                JSON.stringify({ success: false, reason: 'notification_type_disabled' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get all push subscriptions for this user
        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', payload.user_id);

        if (subError) {
            console.error('[SEND-PUSH] Error fetching subscriptions:', subError);
            return new Response(
                JSON.stringify({ error: 'Failed to fetch subscriptions' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!subscriptions || subscriptions.length === 0) {
            console.log('[SEND-PUSH] No subscriptions found for user');
            return new Response(
                JSON.stringify({ success: false, reason: 'no_subscriptions' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[SEND-PUSH] Found ${subscriptions.length} subscription(s)`);

        // Prepare notification payload
        const notificationPayload = JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/pwa-icon.png',
            badge: payload.badge || '/pwa-icon.png',
            data: {
                url: payload.url || '/',
                tag: payload.tag || 'default'
            }
        });

        // Send to all subscriptions
        const results = {
            sent: 0,
            failed: 0,
            expired: [] as string[]
        };

        for (const subscription of subscriptions) {
            try {
                const success = await sendWebPush(subscription, notificationPayload);

                if (success) {
                    results.sent++;
                } else {
                    // Subscription expired, mark for deletion
                    results.expired.push(subscription.id);
                }
            } catch (error) {
                console.error('[SEND-PUSH] Error sending to subscription:', error);
                results.failed++;
            }
        }

        // Delete expired subscriptions
        if (results.expired.length > 0) {
            await supabase
                .from('push_subscriptions')
                .delete()
                .in('id', results.expired);

            console.log(`[SEND-PUSH] Deleted ${results.expired.length} expired subscription(s)`);
        }

        console.log(`[SEND-PUSH] Complete: sent=${results.sent}, failed=${results.failed}, expired=${results.expired.length}`);

        return new Response(
            JSON.stringify({
                success: true,
                sent: results.sent,
                failed: results.failed,
                expired: results.expired.length
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[SEND-PUSH] Unexpected error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
