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

        const { userId } = await req.json();

        if (!userId) {
            throw new Error("userId is required");
        }

        // Verificar se o usuário é admin antes de deletar
        const { data: teamMember, error: memberError } = await supabaseAdmin
            .from("team_members")
            .select("role")
            .eq("auth_user_id", userId)
            .single();

        if (memberError || !teamMember) {
            throw new Error("User not found");
        }

        if (teamMember.role !== 'admin') {
            throw new Error("Only admins can delete their account");
        }

        // Deletar notificações relacionadas primeiro (related_user_id não tem CASCADE)
        await supabaseAdmin
            .from("notifications")
            .delete()
            .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

        // Deletar usuário (CASCADE deletará todo o resto automaticamente)
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (authError) {
            throw authError;
        }

        return new Response(
            JSON.stringify({ message: "Account deleted successfully" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("Error deleting account:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
