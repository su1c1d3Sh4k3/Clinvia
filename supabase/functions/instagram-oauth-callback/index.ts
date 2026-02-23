import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram OAuth Callback Handler
// Uses Instagram Business Login flow
// 
// Since July 2024, Instagram Messaging works without Facebook Page!
// Uses graph.instagram.com with Instagram User Access Token
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Instagram App credentials - set these in Supabase secrets
const INSTAGRAM_APP_ID = Deno.env.get('INSTAGRAM_APP_ID') || '';
const INSTAGRAM_APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') || '';

interface OAuthRequest {
    code: string;
    redirect_uri: string;
    user_id: string; // The Clinvia user_id (auth.uid)
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const payload: OAuthRequest = await req.json();
        console.log('[INSTAGRAM OAUTH] Processing callback for user:', payload.user_id);

        const { code, redirect_uri, user_id } = payload;

        if (!code || !redirect_uri || !user_id) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields: code, redirect_uri, user_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!INSTAGRAM_APP_SECRET) {
            console.error('[INSTAGRAM OAUTH] INSTAGRAM_APP_SECRET not configured');
            return new Response(
                JSON.stringify({ success: false, error: 'Instagram app secret not configured. Set INSTAGRAM_APP_SECRET in Supabase secrets.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 1: Exchange code for short-lived access token
        // Using api.instagram.com for Instagram Business Login
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 1: Exchanging code...');

        const tokenFormData = new FormData();
        tokenFormData.append('client_id', INSTAGRAM_APP_ID);
        tokenFormData.append('client_secret', INSTAGRAM_APP_SECRET);
        tokenFormData.append('grant_type', 'authorization_code');
        tokenFormData.append('redirect_uri', redirect_uri);
        tokenFormData.append('code', code);

        const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
            method: 'POST',
            body: tokenFormData
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || tokenData.error) {
            const errorMsg = tokenData.error_message || tokenData.error?.message || tokenData.error || 'Failed to exchange code for token';
            console.error('[INSTAGRAM OAUTH] Token exchange error:', errorMsg);
            return new Response(
                JSON.stringify({ success: false, error: errorMsg }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Handle response format - Instagram Business Login returns { data: [...] }
        let shortLivedToken: string;
        let instagramUserId: string;

        if (tokenData.data && Array.isArray(tokenData.data) && tokenData.data.length > 0) {
            // New format from Instagram Business Login: { data: [{ access_token, user_id, permissions }] }
            shortLivedToken = tokenData.data[0].access_token;
            instagramUserId = String(tokenData.data[0].user_id);
        } else if (tokenData.access_token) {
            // Old format: { access_token, user_id }
            shortLivedToken = tokenData.access_token;
            instagramUserId = String(tokenData.user_id);
        } else {
            console.error('[INSTAGRAM OAUTH] Unexpected token response format:', JSON.stringify(tokenData));
            return new Response(
                JSON.stringify({ success: false, error: 'Unexpected token response format from Instagram' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 2: Exchange for long-lived access token (60 days)
        // Using graph.instagram.com/access_token endpoint
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 2: Exchanging for long-lived token...');

        let accessToken = shortLivedToken;
        let expiresIn = 3600; // 1 hour for short-lived

        try {
            // For Instagram Business Login, use graph.instagram.com
            // We'll try GET first (standard), but fallback to POST if we get a method error
            const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;

            let longLivedResponse = await fetch(longLivedUrl);
            let longLivedData = await longLivedResponse.json();

            // Check for method error and retry with POST
            if (!longLivedResponse.ok && longLivedData.error?.message?.includes('method type: get')) {
                console.warn('[INSTAGRAM OAUTH] GET rejected (method type error), retrying with POST...');
                longLivedResponse = await fetch(longLivedUrl, { method: 'POST' });
                longLivedData = await longLivedResponse.json();
            }

            if (longLivedResponse.ok && longLivedData.access_token) {
                accessToken = longLivedData.access_token;
                expiresIn = longLivedData.expires_in || 5184000; // 60 days
                console.log('[INSTAGRAM OAUTH] ✅ Successfully got long-lived token, expires in:', expiresIn, 'seconds');
            } else {
                console.warn('[INSTAGRAM OAUTH] ⚠️ Could not get long-lived token:', longLivedData.error?.message || JSON.stringify(longLivedData));
                console.warn('[INSTAGRAM OAUTH] Using short-lived token (valid for 1 hour)');
            }
        } catch (longLivedError: any) {
            console.warn('[INSTAGRAM OAUTH] ⚠️ Long-lived token exchange failed:', longLivedError.message);
            console.warn('[INSTAGRAM OAUTH] Using short-lived token (valid for 1 hour)');
        }

        // =============================================
        // Step 3: Get Instagram account info
        // Using graph.instagram.com/me endpoint
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 3: Fetching account info...');

        let accountName = `Instagram User ${instagramUserId}`;
        let igBusinessAccountId = instagramUserId;

        try {
            // For Instagram Business Login, use different fields
            // Using v22.0 and handling method errors
            const profileUrl = `https://graph.instagram.com/v22.0/me?fields=user_id,username,name,profile_picture_url&access_token=${accessToken}`;

            let profileResponse = await fetch(profileUrl);
            let profileData = await profileResponse.json();

            // Check for method error
            if (!profileResponse.ok && profileData.error?.message?.includes('method type: get')) {
                console.warn('[INSTAGRAM OAUTH] GET rejected for profile (method type error), retrying with POST...');
                profileResponse = await fetch(profileUrl, { method: 'POST' });
                profileData = await profileResponse.json();
            }

            if (profileResponse.ok && !profileData.error) {
                // Handle both nested data format and direct format
                const profile = profileData.data?.[0] || profileData;
                accountName = profile.username || profile.name || accountName;
                // user_id field is the IGSID used for webhooks
                igBusinessAccountId = profile.user_id || profile.id || instagramUserId;
                console.log('[INSTAGRAM OAUTH] ✅ Profile fetched: username=', accountName, 'IGSID=', igBusinessAccountId);
            } else {
                console.warn('[INSTAGRAM OAUTH] ⚠️ Could not fetch profile:', profileData.error?.message || JSON.stringify(profileData));
                console.warn('[INSTAGRAM OAUTH] Using user_id from token exchange');
            }
        } catch (profileError: any) {
            console.warn('[INSTAGRAM OAUTH] ⚠️ Profile fetch failed:', profileError.message);
            console.warn('[INSTAGRAM OAUTH] Using user_id from token exchange');
        }

        // =============================================
        // Step 4: Save to database
        // =============================================
        const tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();

        // Check if this Instagram account is already connected
        let { data: existingInstance } = await supabase
            .from('instagram_instances')
            .select('id')
            .eq('instagram_account_id', igBusinessAccountId)
            .eq('user_id', user_id)
            .single();

        // Also check with the OAuth user ID
        if (!existingInstance && igBusinessAccountId !== instagramUserId) {
            const { data: existingByUserId } = await supabase
                .from('instagram_instances')
                .select('id')
                .eq('instagram_account_id', instagramUserId)
                .eq('user_id', user_id)
                .single();
            existingInstance = existingByUserId;
        }

        let result;
        if (existingInstance) {
            // Update existing
            result = await supabase
                .from('instagram_instances')
                .update({
                    instagram_account_id: igBusinessAccountId,
                    access_token: accessToken,
                    token_expires_at: tokenExpiresAt,
                    account_name: accountName,
                    status: 'connected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingInstance.id)
                .select()
                .single();
            console.log('[INSTAGRAM OAUTH] Updated existing instance');
        } else {
            // Create new
            result = await supabase
                .from('instagram_instances')
                .insert({
                    user_id: user_id,
                    instagram_account_id: igBusinessAccountId,
                    access_token: accessToken,
                    token_expires_at: tokenExpiresAt,
                    account_name: accountName,
                    status: 'connected'
                })
                .select()
                .single();
            console.log('[INSTAGRAM OAUTH] Created new instance');
        }

        if (result.error) {
            console.error('[INSTAGRAM OAUTH] Database error:', result.error);
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to save Instagram account: ' + result.error.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[INSTAGRAM OAUTH] ✅ Successfully connected Instagram account:', accountName);

        return new Response(
            JSON.stringify({
                success: true,
                account_name: accountName,
                instagram_account_id: igBusinessAccountId,
                instance_id: result.data.id
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[INSTAGRAM OAUTH] Unexpected error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
