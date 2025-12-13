import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { id } = await req.json(); // This is the user_id (auth.users.id)

        if (!id) throw new Error("User ID is required");

        // 1. Cleanup data using RPC (Unassign tickets, delete from team_members/profiles)
        const { error: rpcError } = await supabaseAdmin.rpc('cleanup_team_member_data', {
            target_user_id: id
        });

        if (rpcError) throw rpcError;

        // 2. Delete Auth User
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (authError) throw authError;

        return new Response(
            JSON.stringify({ message: "Member deleted successfully" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
