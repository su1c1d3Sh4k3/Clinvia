import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram OAuth Callback Handler
// Exchanges authorization code for access tokens
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
                JSON.stringify({ success: false, error: 'Missing required fields' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
            console.error('[INSTAGRAM OAUTH] App credentials not configured');
            return new Response(
                JSON.stringify({ success: false, error: 'Instagram app credentials not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 1: Exchange code for short-lived token
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 1: Exchanging code for short-lived token...');

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
        console.log('[INSTAGRAM OAUTH] Token response:', JSON.stringify(tokenData));

        if (!tokenResponse.ok || tokenData.error) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: tokenData.error_message || tokenData.error || 'Failed to exchange code'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Handle both old and new response formats
        let shortLivedToken: string;
        let instagramUserId: string;

        if (tokenData.data && Array.isArray(tokenData.data)) {
            // New format
            shortLivedToken = tokenData.data[0].access_token;
            instagramUserId = tokenData.data[0].user_id;
        } else {
            // Old format
            shortLivedToken = tokenData.access_token;
            instagramUserId = String(tokenData.user_id);
        }

        console.log('[INSTAGRAM OAUTH] Got short-lived token for user ID:', instagramUserId);

        // =============================================
        // Step 2: Exchange for long-lived token
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 2: Exchanging for long-lived token...');

        const longLivedResponse = await fetch(
            `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`,
            { method: 'GET' }
        );

        const longLivedData = await longLivedResponse.json();
        console.log('[INSTAGRAM OAUTH] Long-lived token response:', JSON.stringify(longLivedData));

        if (!longLivedResponse.ok || longLivedData.error) {
            // Use short-lived token if long-lived fails
            console.warn('[INSTAGRAM OAUTH] Failed to get long-lived token, using short-lived');
        }

        const accessToken = longLivedData.access_token || shortLivedToken;
        const expiresIn = longLivedData.expires_in || 3600; // Default 1 hour for short-lived

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

        // =============================================
        // Step 4: Save to database
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 4: Saving to database...');

        const tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();

        // Check if this Instagram account is already connected
        const { data: existingInstance } = await supabase
            .from('instagram_instances')
            .select('id')
            .eq('instagram_account_id', instagramUserId)
            .eq('user_id', user_id)
            .single();

        let result;
        if (existingInstance) {
            // Update existing
            result = await supabase
                .from('instagram_instances')
                .update({
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
                    instagram_account_id: instagramUserId,
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
                JSON.stringify({ success: false, error: 'Failed to save Instagram account' }),
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
        console.error('[INSTAGRAM OAUTH] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
