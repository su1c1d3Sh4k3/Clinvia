import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram OAuth Callback Handler
// Uses Instagram Business Login flow
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Instagram App credentials - set these in Supabase secrets
const INSTAGRAM_APP_ID = Deno.env.get('INSTAGRAM_APP_ID') || '746674508461826';
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
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 1: Exchanging code for short-lived token...');
        console.log('[INSTAGRAM OAUTH] Using redirect_uri:', redirect_uri);

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
        console.log('[INSTAGRAM OAUTH] Token response status:', tokenResponse.status);
        console.log('[INSTAGRAM OAUTH] Token response:', JSON.stringify(tokenData));

        if (!tokenResponse.ok || tokenData.error) {
            const errorMsg = tokenData.error_message || tokenData.error?.message || tokenData.error || 'Failed to exchange code for token';
            console.error('[INSTAGRAM OAUTH] Token exchange error:', errorMsg);
            return new Response(
                JSON.stringify({ success: false, error: errorMsg }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Handle both old and new response formats
        let shortLivedToken: string;
        let instagramUserId: string;

        if (tokenData.data && Array.isArray(tokenData.data)) {
            // New format
            shortLivedToken = tokenData.data[0].access_token;
            instagramUserId = String(tokenData.data[0].user_id);
        } else {
            // Old format
            shortLivedToken = tokenData.access_token;
            instagramUserId = String(tokenData.user_id);
        }

        console.log('[INSTAGRAM OAUTH] Got short-lived token for Instagram user ID:', instagramUserId);

        // =============================================
        // Step 2: Exchange for long-lived access token (60 days)
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 2: Exchanging for long-lived token...');

        const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;

        const longLivedResponse = await fetch(longLivedUrl);
        const longLivedData = await longLivedResponse.json();
        console.log('[INSTAGRAM OAUTH] Long-lived token response:', JSON.stringify(longLivedData));

        let accessToken = shortLivedToken;
        let expiresIn = 3600; // 1 hour for short-lived

        if (longLivedResponse.ok && longLivedData.access_token) {
            accessToken = longLivedData.access_token;
            expiresIn = longLivedData.expires_in || 5184000; // 60 days
            console.log('[INSTAGRAM OAUTH] Successfully got long-lived token, expires in:', expiresIn, 'seconds');
        } else {
            console.warn('[INSTAGRAM OAUTH] Could not get long-lived token, using short-lived');
        }

        // =============================================
        // Step 3: Get Instagram account info
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 3: Fetching account info...');

        const profileResponse = await fetch(
            `https://graph.instagram.com/v21.0/me?fields=id,username,name,profile_picture_url&access_token=${accessToken}`
        );
        const profileData = await profileResponse.json();
        console.log('[INSTAGRAM OAUTH] Profile data:', JSON.stringify(profileData));

        const accountName = profileData.username || profileData.name || `Instagram User ${instagramUserId}`;

        // The ID from profile is the Instagram Business Account ID (IGSID) which is used in webhooks
        // This may be different from the user_id returned in the token exchange
        const igBusinessAccountId = profileData.id || instagramUserId;
        console.log('[INSTAGRAM OAUTH] Instagram User ID from token:', instagramUserId);
        console.log('[INSTAGRAM OAUTH] Instagram Business Account ID from profile:', igBusinessAccountId);

        // =============================================
        // Step 3b: Subscribe to webhooks via subscribed_apps API
        // This is CRITICAL - without this, webhooks won't be delivered
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 3b: Subscribing to webhooks...');

        try {
            // For Instagram Business accounts, we need to subscribe to webhooks
            // The subscription is made via the Instagram Graph API directly
            // IMPORTANT: access_token and subscribed_fields must be query parameters!
            const subscribedFields = 'messages,messaging_postbacks,messaging_optins';
            const subscribeUrl = `https://graph.instagram.com/v21.0/${igBusinessAccountId}/subscribed_apps?access_token=${accessToken}&subscribed_fields=${subscribedFields}`;
            const subscribeResponse = await fetch(subscribeUrl, {
                method: 'POST'
            });

            const subscribeData = await subscribeResponse.json();
            console.log('[INSTAGRAM OAUTH] Webhook subscription response:', JSON.stringify(subscribeData));

            if (!subscribeResponse.ok) {
                // Log but don't fail - the account might already be subscribed or use a different method
                console.warn('[INSTAGRAM OAUTH] Webhook subscription warning:', subscribeData);
            } else {
                console.log('[INSTAGRAM OAUTH] ✅ Successfully subscribed to webhooks');
            }
        } catch (subError: any) {
            console.warn('[INSTAGRAM OAUTH] Webhook subscription error (non-fatal):', subError.message);
        }

        // =============================================
        // Step 4: Save to database
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 4: Saving to database...');

        const tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();

        // Check if this Instagram account is already connected (check both IDs for backwards compat)
        let { data: existingInstance } = await supabase
            .from('instagram_instances')
            .select('id')
            .eq('instagram_account_id', igBusinessAccountId)
            .eq('user_id', user_id)
            .single();

        // Also check with the old user ID in case it was saved before this fix
        if (!existingInstance) {
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
            // Update existing - also update the instagram_account_id to the correct Business Account ID
            result = await supabase
                .from('instagram_instances')
                .update({
                    instagram_account_id: igBusinessAccountId, // Update to correct ID
                    access_token: accessToken,
                    token_expires_at: tokenExpiresAt,
                    account_name: accountName,
                    status: 'connected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingInstance.id)
                .select()
                .single();
            console.log('[INSTAGRAM OAUTH] Updated existing instance with Business Account ID:', igBusinessAccountId);
        } else {
            // Create new with correct Business Account ID
            result = await supabase
                .from('instagram_instances')
                .insert({
                    user_id: user_id,
                    instagram_account_id: igBusinessAccountId, // Use Business Account ID for webhooks
                    access_token: accessToken,
                    token_expires_at: tokenExpiresAt,
                    account_name: accountName,
                    status: 'connected'
                })
                .select()
                .single();
            console.log('[INSTAGRAM OAUTH] Created new instance with Business Account ID:', igBusinessAccountId);
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
                instagram_account_id: instagramUserId,
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
