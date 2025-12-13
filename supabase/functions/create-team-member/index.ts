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

        const { name, email, password, role, phone, owner_id, commission } = await req.json();

        // Validate owner_id
        if (!owner_id) {
            throw new Error("owner_id is required");
        }

        // 1. Create Auth User
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name,
                is_team_member: true
            },
        });

        if (authError) throw authError;

        // 2. Create Team Member Record
        // user_id = owner_id (ID do admin/owner da conta)
        // auth_user_id = ID do NOVO usuário (para login/identificação)
        const { error: dbError } = await supabaseAdmin
            .from("team_members")
            .insert({
                user_id: owner_id,           // ID do ADMIN (owner)
                auth_user_id: authData.user.id, // ID do NOVO membro
                name,
                email,
                phone,
                role,
                commission: commission || 0, // Commission percentage (0-100)
            });

        if (dbError) {
            // Rollback auth user creation if DB insert fails
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            throw dbError;
        }

        return new Response(
            JSON.stringify({ message: "Member created successfully", user: authData.user }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
