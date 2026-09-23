import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminCan, adminForbidden, resolveAdminCaller } from "../_shared/admin-guard.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serveMonitored("admin-get-avatars", async (req) => {
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

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Roda com service role: sem este guard qualquer usuário autenticado
        // leria avatares de qualquer tenant informando os ids.
        const caller = await resolveAdminCaller(supabase, req);
        if (!caller || !adminCan(caller, 'clientes', 'view')) {
            return adminForbidden(corsHeaders);
        }

        // Só os ids dentro do escopo do chamador
        const scopedIds = caller.scopeAll
            ? profileIds
            : profileIds.filter((id: string) => caller.allowedClientIds.includes(id));

        console.log('[admin-get-avatars] Fetching avatars for', scopedIds.length, 'profiles');

        if (scopedIds.length === 0) {
            return new Response(
                JSON.stringify({ success: true, avatars: {} }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Fetch avatars from team_members where role = 'admin' for each profile
        const { data: teamMembers, error } = await supabase
            .from('team_members')
            .select('user_id, avatar_url')
            .in('user_id', scopedIds)
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
