import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram OAuth Callback Handler
// 
// CRITICAL: Uses Facebook Login flow for Instagram Messaging
// Instagram Business Login DOES NOT work for Messaging API!
// 
// The correct flow is:
// 1. User authorizes via Facebook Login
// 2. We get User Access Token
// 3. We fetch user's Facebook Pages
// 4. We find Pages with linked Instagram accounts
// 5. We get Page Access Token (required for Messaging)
// 6. We save Page ID + Instagram ID + Page Access Token
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Facebook App credentials - The SAME app ID/secret used for Instagram
// Set these in Supabase secrets
const FACEBOOK_APP_ID = Deno.env.get('INSTAGRAM_APP_ID') || Deno.env.get('FACEBOOK_APP_ID') || '';
const FACEBOOK_APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') || Deno.env.get('FACEBOOK_APP_SECRET') || '';

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
        console.log('[INSTAGRAM OAUTH] Processing Facebook OAuth callback for user:', payload.user_id);

        const { code, redirect_uri, user_id } = payload;

        if (!code || !redirect_uri || !user_id) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields: code, redirect_uri, user_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!FACEBOOK_APP_SECRET) {
            console.error('[INSTAGRAM OAUTH] FACEBOOK_APP_SECRET/INSTAGRAM_APP_SECRET not configured');
            return new Response(
                JSON.stringify({ success: false, error: 'Facebook app secret not configured. Set INSTAGRAM_APP_SECRET or FACEBOOK_APP_SECRET in Supabase secrets.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 1: Exchange code for Facebook User Access Token
        // CRITICAL: Use graph.facebook.com, NOT api.instagram.com
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 1: Exchanging code for Facebook User Access Token...');
        console.log('[INSTAGRAM OAUTH] Using redirect_uri:', redirect_uri);

        const tokenUrl = `https://graph.facebook.com/v24.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;

        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();
        console.log('[INSTAGRAM OAUTH] Token response status:', tokenResponse.status);
        console.log('[INSTAGRAM OAUTH] Token response:', JSON.stringify(tokenData));

        if (!tokenResponse.ok || tokenData.error) {
            const errorMsg = tokenData.error?.message || tokenData.error_description || 'Failed to exchange code for token';
            console.error('[INSTAGRAM OAUTH] Token exchange error:', errorMsg);
            return new Response(
                JSON.stringify({ success: false, error: errorMsg }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const userAccessToken = tokenData.access_token;
        console.log('[INSTAGRAM OAUTH] ✅ Got Facebook User Access Token');

        // =============================================
        // Step 2: Get user's Facebook Pages
        // These are the Pages the user can manage
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 2: Fetching user\'s Facebook Pages...');

        const pagesResponse = await fetch(
            `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userAccessToken}`
        );
        const pagesData = await pagesResponse.json();
        console.log('[INSTAGRAM OAUTH] Pages response status:', pagesResponse.status);
        console.log('[INSTAGRAM OAUTH] Pages data:', JSON.stringify(pagesData));

        if (!pagesResponse.ok || pagesData.error) {
            const errorMsg = pagesData.error?.message || 'Failed to fetch Facebook Pages';
            console.error('[INSTAGRAM OAUTH] Pages fetch error:', errorMsg);
            return new Response(
                JSON.stringify({ success: false, error: errorMsg }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const pages = pagesData.data || [];
        console.log('[INSTAGRAM OAUTH] Found', pages.length, 'Facebook Pages');

        if (pages.length === 0) {
            console.error('[INSTAGRAM OAUTH] No Facebook Pages found');
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Nenhuma Página do Facebook encontrada. O Instagram Business precisa estar conectado a uma Página do Facebook.'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 3: Find Pages with Instagram Business accounts
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 3: Finding Pages with Instagram accounts...');

        const connectedAccounts: any[] = [];

        for (const page of pages) {
            console.log('[INSTAGRAM OAUTH] Checking Page:', page.name, 'ID:', page.id);

            // If instagram_business_account is already in the response, use it
            if (page.instagram_business_account) {
                console.log('[INSTAGRAM OAUTH] Page has Instagram linked:', page.instagram_business_account.id);

                // Get Instagram account details
                const igResponse = await fetch(
                    `https://graph.facebook.com/v24.0/${page.instagram_business_account.id}?fields=id,username,name,profile_picture_url,ig_id&access_token=${page.access_token}`
                );
                const igData = await igResponse.json();
                console.log('[INSTAGRAM OAUTH] Instagram data:', JSON.stringify(igData));

                if (igResponse.ok && !igData.error) {
                    connectedAccounts.push({
                        page_id: page.id,
                        page_name: page.name,
                        page_access_token: page.access_token,
                        instagram_id: page.instagram_business_account.id, // IGSID - used for webhooks
                        instagram_username: igData.username,
                        instagram_name: igData.name || igData.username,
                        instagram_ig_id: igData.ig_id // The numeric IG ID
                    });
                }
            }
        }

        console.log('[INSTAGRAM OAUTH] Found', connectedAccounts.length, 'Instagram Business accounts');

        if (connectedAccounts.length === 0) {
            console.error('[INSTAGRAM OAUTH] No Instagram Business accounts linked to Pages');
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Nenhuma conta de Instagram Business encontrada. Certifique-se de que seu Instagram é uma conta Business ou Creator e está conectado a uma Página do Facebook.'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Step 4: Exchange Page Token for Long-Lived Token
        // This is CRITICAL - short-lived Page tokens expire quickly
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 4: Getting long-lived Page Access Token...');

        for (const account of connectedAccounts) {
            try {
                // First get long-lived user token
                const longLivedUserTokenUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${userAccessToken}`;
                const longLivedUserResponse = await fetch(longLivedUserTokenUrl);
                const longLivedUserData = await longLivedUserResponse.json();

                if (longLivedUserResponse.ok && longLivedUserData.access_token) {
                    // Now get the Page token using the long-lived user token
                    const pageTokenResponse = await fetch(
                        `https://graph.facebook.com/v24.0/${account.page_id}?fields=access_token&access_token=${longLivedUserData.access_token}`
                    );
                    const pageTokenData = await pageTokenResponse.json();

                    if (pageTokenResponse.ok && pageTokenData.access_token) {
                        account.page_access_token = pageTokenData.access_token;
                        account.token_expires_in = 5184000; // Long-lived tokens: ~60 days
                        console.log('[INSTAGRAM OAUTH] ✅ Got long-lived Page Access Token for:', account.page_name);
                    }
                }
            } catch (err: any) {
                console.warn('[INSTAGRAM OAUTH] ⚠️ Could not get long-lived token for page:', account.page_name, err.message);
                // Continue with short-lived token
            }
        }

        // =============================================
        // Step 5: Subscribe to webhooks
        // Using Page token and Page ID for Messenger Platform
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 5: Subscribing to webhooks...');

        for (const account of connectedAccounts) {
            try {
                // Subscribe the Page to Instagram messaging webhooks
                const subscribeUrl = `https://graph.facebook.com/v24.0/${account.page_id}/subscribed_apps`;
                const subscribeBody = new URLSearchParams({
                    access_token: account.page_access_token,
                    subscribed_fields: 'messages,messaging_postbacks,messaging_optins,messaging_seen,messaging_referral'
                });

                const subscribeResponse = await fetch(subscribeUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: subscribeBody.toString()
                });

                const subscribeData = await subscribeResponse.json();
                console.log('[INSTAGRAM OAUTH] Webhook subscription for', account.page_name, ':', JSON.stringify(subscribeData));

                if (subscribeResponse.ok && subscribeData.success) {
                    console.log('[INSTAGRAM OAUTH] ✅ Successfully subscribed to webhooks for:', account.page_name);
                } else {
                    console.warn('[INSTAGRAM OAUTH] ⚠️ Webhook subscription warning:', subscribeData.error?.message);
                }
            } catch (err: any) {
                console.warn('[INSTAGRAM OAUTH] ⚠️ Webhook subscription error for:', account.page_name, err.message);
            }
        }

        // =============================================
        // Step 6: Save to database
        // Save ALL connected Instagram accounts
        // =============================================
        console.log('[INSTAGRAM OAUTH] Step 6: Saving to database...');

        const savedAccounts: any[] = [];
        const tokenExpiresAt = new Date(Date.now() + (5184000 * 1000)).toISOString(); // 60 days

        for (const account of connectedAccounts) {
            // Check if this Instagram account already exists
            const { data: existing } = await supabase
                .from('instagram_instances')
                .select('id')
                .eq('instagram_account_id', account.instagram_id)
                .eq('user_id', user_id)
                .single();

            let result;
            if (existing) {
                // Update existing
                result = await supabase
                    .from('instagram_instances')
                    .update({
                        access_token: account.page_access_token, // Using Page Access Token!
                        token_expires_at: tokenExpiresAt,
                        account_name: account.instagram_username || account.instagram_name,
                        facebook_page_id: account.page_id,
                        facebook_page_name: account.page_name,
                        status: 'connected',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                console.log('[INSTAGRAM OAUTH] Updated instance for:', account.instagram_username);
            } else {
                // Create new
                result = await supabase
                    .from('instagram_instances')
                    .insert({
                        user_id: user_id,
                        instagram_account_id: account.instagram_id, // IGSID for webhooks
                        access_token: account.page_access_token, // Using Page Access Token!
                        token_expires_at: tokenExpiresAt,
                        account_name: account.instagram_username || account.instagram_name,
                        facebook_page_id: account.page_id,
                        facebook_page_name: account.page_name,
                        status: 'connected'
                    })
                    .select()
                    .single();
                console.log('[INSTAGRAM OAUTH] Created instance for:', account.instagram_username);
            }

            if (result.error) {
                console.error('[INSTAGRAM OAUTH] Database error for', account.instagram_username, ':', result.error);
            } else {
                savedAccounts.push({
                    id: result.data.id,
                    account_name: account.instagram_username || account.instagram_name,
                    page_name: account.page_name
                });
            }
        }

        if (savedAccounts.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to save any Instagram accounts' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[INSTAGRAM OAUTH] ✅ Successfully connected', savedAccounts.length, 'Instagram account(s)');

        return new Response(
            JSON.stringify({
                success: true,
                account_name: savedAccounts[0].account_name,
                accounts_connected: savedAccounts.length,
                accounts: savedAccounts
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
