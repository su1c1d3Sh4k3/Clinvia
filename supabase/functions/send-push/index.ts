// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = 'mailto:contato@clinbia.com.br';

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
    contact_id?: string;
    owner_id?: string;
}

// ── Avatar caching ────────────────────────────────────────────────────────────
// Downloads the WhatsApp CDN image and stores it in Supabase Storage so it
// doesn't expire. Returns a permanent public URL.
async function getCachedAvatarUrl(
    supabase: any,
    supabaseUrl: string,
    contactId: string,
    ownerId: string,
    originalUrl: string,
): Promise<string> {
    if (!contactId || !ownerId || !originalUrl) return originalUrl || '';

    const bucket = 'contact-avatars';
    const storagePath = `${ownerId}/${contactId}.jpg`;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;

    // Check if we already have a cached version
    const { data: existing } = await supabase.storage
        .from(bucket)
        .list(ownerId, { limit: 1, search: `${contactId}.jpg` });

    if (existing && existing.length > 0) {
        console.log('[SEND-PUSH] Using cached avatar:', publicUrl);
        return publicUrl;
    }

    // Not cached yet — download from WhatsApp CDN and upload to Storage
    try {
        const response = await fetch(originalUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            console.warn('[SEND-PUSH] Avatar download failed (status', response.status, ')');
            return originalUrl; // CDN might still work for the client
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength < 100) {
            console.warn('[SEND-PUSH] Avatar too small, skipping cache');
            return originalUrl;
        }

        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(storagePath, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: true,
            });

        if (uploadError) {
            console.warn('[SEND-PUSH] Avatar upload error:', uploadError.message);
            return originalUrl;
        }

        console.log('[SEND-PUSH] Avatar cached successfully:', publicUrl);
        return publicUrl;
    } catch (err: any) {
        console.warn('[SEND-PUSH] Avatar cache error:', err.message);
        return originalUrl;
    }
}

// ── FCM v1 helpers ────────────────────────────────────────────────────────────
function base64url(data: Uint8Array | string): string {
    const str = typeof data === 'string' ? data : String.fromCharCode(...data);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getFCMAccessToken(): Promise<string | null> {
    const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL') || 'firebase-adminsdk-fbsvc@clinbia-445af.iam.gserviceaccount.com';
    const projectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'clinbia-445af';
    // Base64 body of the private key (no PEM headers, no newlines — avoids encoding issues)
    const pkB64 = 'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDjfNVtk2ipvyQwITAf6UintCyHZ6NpJ9FPLeLv7eMi+o4Cj98e0lkYfSv+/xVPDH8l+aD71czOWhD8FR7KtVzna9zD1t2utDACdoi0ccNbn8VRiaRApo9UhnqNgP7y+RJ31xk64CPBQOB6NgivWoj5DSVYBWDrX+Xt7oh/46CV6TePs63xt6EaPr3A4R9H5DDpvoV13nS9xBkmtabCIXl28ktdVCLnMK70wFLuhzjT3wDdpzAbZvPepjhvwzq9rN3OEBKl6Pq1+Nqnegf5kfohg2i4p08/UsCxXkzess/5kimzaljc4LTMwWUz8mQCagMvQUfyEqOoMWUafBHa8rg1AgMBAAECggEAEWe2c68M2bn2ZJlRc4uXg79JDeYbzlqdzNtTquxOTdmSPndwCI1rBDDlihnNsVHhM5BdJQ+HXz1sYcEi7TsBm/I4fqJkrS57ouCbVoUCv7Kid/naP5kOy9aLL2LwfroYU+N4+nR2P929HxSdxv7cDoQXOJwWvYOFldYDixdpLLb5mneDRt7BkKIIQspa1IJTINRIujU3OWsVBk0xlaRJtCgigKZaIQPbBhw5lyjGvR0eN4nDF6bNsmB05v/eP0oGiH/9TT85fr2AAi37cDwrF0L7iZvjZC3ELoEu48ghoBwf31wTM2tKzNsQ+Jzb6naawJ+TcE7kJcwSwJG40B1MWQKBgQD1tbaEIMmtVxwEpoP3C130W93PlEgeZKNgrnef+LGr1l0iBMLouK7kvmHjiu+pgRYzsbGvG8s+Loca8Zz+n0u5hfgjGtZttKFovCU2E87rOY8OrOoXSRAe4telEOM4nxcFISnmgalD+D5As4BRRm25q+N+S3aigu3lVjHfWa9LTQKBgQDtA8IhxKy7v5UXLhClVvMuCLtsz1NOY7tD9N4wtgRaqwtYMw/7ObodIGpfIlNeeEdI63puLTFE0qOp+LEdseZ3gwwqPmzxdO3gi5D7SqcnL6GaR878TSWgoaSrDDYP9RY4xuRAgHyYeqnGLqOyWj2ZsgNuS3KQMM2wNc+SBgMciQKBgG32nvJPAjMzcvSZ2SFs0uWTX5eQ0x3XCE8yhZLwaANxckjRPLGORadVlNWSzmNbxCXqdozZsYHorMpgK1TA0dD7peuADUsXtcz7tuOWxdn77oww0qsNJcvM1ZmoDyi9+j1vdCMXEDu9E489RkYZcO3RgYR6HWPpmLI0eylsJ8lZAoGBAJwLeWjaIA+MVxBn17XDxV9tiFhfN63Io6ZeNVtEuyEms9Vh6QeyPgKnMOFprBHqhqRPxM99GY8CT5a8kX/HfMD6mqvFZdyi62qG+PE5eUunZHI7DN+3uypCwjOLWpyu8+51pBmDfoS1XcmJM2VdXGkwdmnLaqXcO8/j3cF6C9phAoGBAN7R/nOZVKcz3OKOB2Sd8Urn5RQU2xNxjUnkwmLIv5cFiD1tk2xkKKOc+zxxrRqhwq8BkYMxLPFEhx8RuAYOXYr+suxlOCwEf3zM4oVay3+wkoX/iMQxpqhx/a4fOMUWYugcTMTnjp2B0lVgmituE1+hG4XbEWa2XkdfwsBuvWG+';
    if (!clientEmail || !projectId || !pkB64) {
        console.warn('[SEND-PUSH] Firebase credentials not configured');
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    }));
    const signingInput = `${header}.${claims}`;

    const keyBuffer = Uint8Array.from(atob(pkB64), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', keyBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', cryptoKey,
        new TextEncoder().encode(signingInput)
    );

    const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });
    const { access_token, error } = await tokenRes.json();
    if (error) console.error('[SEND-PUSH] FCM token error:', error);
    return access_token || null;
}

// Returns { ok: boolean, error?: any } so caller can inspect failure reason
async function sendFCMDataMessage(
    fcmToken: string,
    data: Record<string, string>,
    projectId: string,
    accessToken: string,
): Promise<{ ok: boolean; error?: any; result?: any }> {
    const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: {
                    token: fcmToken,
                    data,
                    android: {
                        priority: 'high',
                    },
                },
            }),
        }
    );
    const result = await res.json();
    console.log('[SEND-PUSH] FCM HTTP status:', res.status);
    console.log('[SEND-PUSH] FCM result:', JSON.stringify(result));

    // Check if FCM returned an error (UNREGISTERED, INVALID_ARGUMENT, etc.)
    if (result.error) {
        console.error('[SEND-PUSH] FCM error:', result.error.code, result.error.message, result.error.status);
        return { ok: false, error: { code: result.error.code, message: result.error.message, status: result.error.status } };
    }

    return { ok: true, result };
}

// ─────────────────────────────────────────────────────────────────────────────

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

        if (!targetUserId || !payload.title || payload.body === undefined || payload.body === null) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[SEND-PUSH] ────── START ──────`);
        console.log(`[SEND-PUSH] User: ${targetUserId}, title: ${payload.title}, type: ${payload.notification_type || 'default'}`);

        // ── Fetch team member preferences + tokens ────────────────────────────
        const { data: teamMember, error: tmError } = await supabase
            .from('team_members')
            .select('notifications_enabled, group_notifications_enabled, instagram_notifications_enabled, expo_push_token, fcm_device_token')
            .eq('auth_user_id', targetUserId)
            .maybeSingle();

        console.log(`[SEND-PUSH] DB lookup: teamMember found = ${!!teamMember}, error = ${tmError?.message || 'none'}`);
        if (teamMember) {
            console.log(`[SEND-PUSH] Tokens: expo = ${teamMember.expo_push_token || 'null'}, fcm = ${teamMember.fcm_device_token ? teamMember.fcm_device_token.substring(0, 20) + '...' : 'null'}`);
            console.log(`[SEND-PUSH] Prefs: notif_enabled = ${teamMember.notifications_enabled}, ig = ${teamMember.instagram_notifications_enabled}, group = ${teamMember.group_notifications_enabled}`);
        }

        // Check notification preferences
        if (teamMember) {
            if (!teamMember.notifications_enabled) {
                return new Response(
                    JSON.stringify({ success: false, reason: 'notifications_disabled' }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            if (payload.notification_type === 'instagram' && teamMember.instagram_notifications_enabled === false) {
                return new Response(
                    JSON.stringify({ success: false, reason: 'instagram_notifications_disabled' }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            if (payload.notification_type === 'group' && teamMember.group_notifications_enabled === false) {
                return new Response(
                    JSON.stringify({ success: false, reason: 'group_notifications_disabled' }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        const conversationId = payload.tag?.replace('message-', '') || '';
        const channel = payload.notification_type === 'instagram' ? 'instagram' : 'whatsapp';

        // ── Cache the contact avatar in Supabase Storage ─────────────────────
        let imageUrl = payload.icon || '';
        if (imageUrl && payload.contact_id && payload.owner_id) {
            imageUrl = await getCachedAvatarUrl(
                supabase, supabaseUrl,
                payload.contact_id, payload.owner_id,
                imageUrl,
            );
        }

        // ── FCM direto (Android via Firebase Messaging + Notifee) ────────────────
        // Mensagem data-only: o app recebe e exibe via Notifee com MessagingStyle
        // OBRIGATÓRIO: priority HIGH para acordar o app quando está killed/background
        const fcmDeviceToken = teamMember?.fcm_device_token;
        let fcmSent = false;
        let mobilePushResult: any = { fcmToken: fcmDeviceToken ? 'present' : 'none' };

        console.log(`[SEND-PUSH] FCM token: ${fcmDeviceToken ? fcmDeviceToken.substring(0, 20) + '...' : 'null'}`);

        if (fcmDeviceToken) {
            try {
                const accessToken = await getFCMAccessToken();
                if (accessToken) {
                    const projectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'clinbia-445af';
                    const fcmResult = await sendFCMDataMessage(fcmDeviceToken, {
                        notif_title: payload.title,
                        notif_body: payload.body,
                        imageUrl: imageUrl || '',
                        conversationId,
                        channel,
                    }, projectId, accessToken);

                    fcmSent = fcmResult.ok;
                    mobilePushResult.fcmSent = fcmResult.ok;
                    if (fcmResult.error) mobilePushResult.fcmError = fcmResult.error;

                    // Token inválido: limpar do banco para não tentar de novo
                    if (!fcmResult.ok && (fcmResult.error?.code === 404 || fcmResult.error?.status === 'UNREGISTERED')) {
                        console.warn('[SEND-PUSH] FCM token invalid — clearing from DB');
                        await supabase
                            .from('team_members')
                            .update({ fcm_device_token: null })
                            .eq('auth_user_id', targetUserId);
                    }
                } else {
                    console.warn('[SEND-PUSH] Could not obtain FCM access token');
                    mobilePushResult.fcmError = 'no_access_token';
                }
            } catch (err: any) {
                console.error('[SEND-PUSH] FCM error:', err.message);
                mobilePushResult.fcmError = err.message;
            }
        }

        // ── Expo push (fallback se sem FCM token — ex: iOS ou token não registrado) ──
        const expoToken = teamMember?.expo_push_token;
        let expoPushResult: any = null;
        if (!fcmSent && expoToken && expoToken.startsWith('ExponentPushToken[')) {
            console.log('[SEND-PUSH] FCM not sent, trying Expo push as fallback...');
            try {
                const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                        to: expoToken,
                        title: payload.title,
                        body: payload.body,
                        sound: 'default',
                        channelId: 'messages',
                        data: { conversationId, channel },
                    }),
                });
                const expoData = await expoRes.json();
                expoPushResult = expoData;
                console.log('[SEND-PUSH] Expo result:', JSON.stringify(expoData));
            } catch (err: any) {
                console.error('[SEND-PUSH] Expo push error:', err.message);
                expoPushResult = { error: err.message };
            }
        }

        // ── Web push (browser / PWA) ──────────────────────────────────────────
        const { data: subscriptions } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', targetUserId);

        if (!subscriptions?.length) {
            return new Response(
                JSON.stringify({ success: true, mobilePushResult, expoPushResult }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            return new Response(
                JSON.stringify({ success: true, reason: 'no_vapid' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

        const notificationPayload = JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/pwa-icon.png',
            badge: payload.badge || '/pwa-icon.png',
            data: { url: payload.url || '/', tag: payload.tag || 'default' }
        });

        const results = { sent: 0, failed: 0, expired: [] as string[] };

        for (const sub of subscriptions) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    notificationPayload
                );
                results.sent++;
            } catch (error: any) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    results.expired.push(sub.id);
                } else {
                    results.failed++;
                }
            }
        }

        if (results.expired.length > 0) {
            await supabase.from('push_subscriptions').delete().in('id', results.expired);
        }

        return new Response(
            JSON.stringify({ success: results.sent > 0, sent: results.sent, failed: results.failed, mobilePushResult, expoPushResult }),
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
