// Admin Impersonation Edge Function
// Allows super-admin to login as any client
// Returns a magic link that the frontend will use to authenticate

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Get the authorization header from the request
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ success: false, error: 'No authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create admin client
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // Verify the caller's token
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

        if (userError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid user token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[admin-impersonate] Request from user:', user.id);

        // Verify caller is super-admin
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || profile?.role !== 'super-admin') {
            console.log('[admin-impersonate] Access denied. Role:', profile?.role);
            return new Response(
                JSON.stringify({ success: false, error: 'Access denied. Super-admin only.' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get target user ID from request body
        const { target_user_id } = await req.json();

        if (!target_user_id) {
            return new Response(
                JSON.stringify({ success: false, error: 'target_user_id is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[admin-impersonate] Impersonating user:', target_user_id);

        // Get target user info from profiles
        const { data: targetProfile } = await supabaseAdmin
            .from('profiles')
            .select('full_name, company_name, email')
            .eq('id', target_user_id)
            .single();

        if (!targetProfile?.email) {
            return new Response(
                JSON.stringify({ success: false, error: 'Target user not found or has no email' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[admin-impersonate] Target email:', targetProfile.email);

        // Generate a magic link for the target user
        // The redirectTo should point to the app's callback handler
        const appUrl = req.headers.get('origin') || 'https://app.clinvia.ai';

        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: targetProfile.email,
            options: {
                redirectTo: `${appUrl}/dashboard?impersonate=true`
            }
        });

        if (linkError || !linkData) {
            console.error('[admin-impersonate] Error generating link:', linkError);
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to generate link: ' + (linkError?.message || 'Unknown error') }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // The action_link is the full URL that will authenticate the user
        const actionLink = linkData.properties?.action_link || '';

        if (!actionLink) {
            console.error('[admin-impersonate] No action_link in response');
            return new Response(
                JSON.stringify({ success: false, error: 'No action link generated' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[admin-impersonate] Magic link generated successfully');

        // Return the magic link URL - frontend will redirect to this URL
        // which will authenticate the user and redirect back to the app
        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    magic_link: actionLink,
                    target_user: {
                        id: target_user_id,
                        full_name: targetProfile.full_name,
                        company_name: targetProfile.company_name,
                        email: targetProfile.email
                    }
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[admin-impersonate] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
