import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram OAuth Callback Handler
// Uses Facebook Login for Business flow
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Facebook/Instagram App credentials - set these in Supabase secrets
const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID') || '887067873839519';
const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET') || '';

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

        if (!FACEBOOK_APP_SECRET) {
            console.error('[INSTAGRAM OAUTH] App secret not configured');
            return new Response(
                JSON.stringify({ success: false, error: 'Facebook app secret not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 1: Exchange Facebook code for access token
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 1: Exchanging code for Facebook access token...');

        const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;

        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();
        console.log('[INSTAGRAM OAUTH] Token response:', JSON.stringify(tokenData));

        if (!tokenResponse.ok || tokenData.error) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: tokenData.error?.message || 'Failed to exchange code for token'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const accessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 5184000; // Default 60 days

        // =============================================
        // Step 2: Get Facebook Pages connected to the user
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 2: Fetching connected Facebook Pages...');

        const pagesResponse = await fetch(
            `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
        );
        const pagesData = await pagesResponse.json();
        console.log('[INSTAGRAM OAUTH] Pages data:', JSON.stringify(pagesData));

        if (!pagesData.data || pagesData.data.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'Nenhuma página do Facebook encontrada. Você precisa ter uma página conectada.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 3: Get Instagram Business Account for each page
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 3: Finding Instagram Business accounts...');

        let instagramAccount = null;
        let pageAccessToken = null;
        let pageName = null;

        for (const page of pagesData.data) {
            const igResponse = await fetch(
                `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
            );
            const igData = await igResponse.json();
            console.log(`[INSTAGRAM OAUTH] Page ${page.name} IG data:`, JSON.stringify(igData));

            if (igData.instagram_business_account) {
                instagramAccount = igData.instagram_business_account;
                pageAccessToken = page.access_token;
                pageName = page.name;
                break;
            }
        }

        if (!instagramAccount) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Nenhuma conta Instagram Business encontrada. Conecte uma conta Instagram Business/Creator à sua página do Facebook.'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 4: Get Instagram account details
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 4: Fetching Instagram account details...');

        const igDetailsResponse = await fetch(
            `https://graph.facebook.com/v21.0/${instagramAccount.id}?fields=id,username,name,profile_picture_url&access_token=${pageAccessToken}`
        );
        const igDetails = await igDetailsResponse.json();
        console.log('[INSTAGRAM OAUTH] Instagram details:', JSON.stringify(igDetails));

        const accountName = igDetails.username || igDetails.name || `Instagram ${instagramAccount.id}`;
        const instagramUserId = instagramAccount.id;

        // =============================================
        // Step 5: Save to database
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 5: Saving to database...');

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
                    access_token: pageAccessToken, // Use page access token for Instagram API
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
                    access_token: pageAccessToken,
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
