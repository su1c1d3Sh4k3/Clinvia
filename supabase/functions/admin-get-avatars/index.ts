import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { profileIds } = await req.json();

        if (!profileIds || !Array.isArray(profileIds)) {
            return new Response(
                JSON.stringify({ success: false, error: "profileIds array required" }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[admin-get-avatars] Fetching avatars for', profileIds.length, 'profiles');

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fetch avatars from team_members where role = 'admin' for each profile
        const { data: teamMembers, error } = await supabase
            .from('team_members')
            .select('user_id, avatar_url')
            .in('user_id', profileIds)
            .eq('role', 'admin');

        if (error) {
            console.error('[admin-get-avatars] Error:', error);
            return new Response(
                JSON.stringify({ success: false, error: error.message }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Create a map of profile_id -> avatar_url
        const avatarMap: Record<string, string | null> = {};
        for (const tm of (teamMembers || [])) {
            if (tm.user_id) {
                avatarMap[tm.user_id] = tm.avatar_url;
            }
        }

        console.log('[admin-get-avatars] Found avatars:', Object.keys(avatarMap).length);

        return new Response(
            JSON.stringify({ success: true, avatars: avatarMap }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[admin-get-avatars] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
