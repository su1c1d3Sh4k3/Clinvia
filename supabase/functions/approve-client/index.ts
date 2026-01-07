import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PASSWORD = "Clinbia123";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { profile_id, action } = await req.json();

        if (!profile_id || !action) {
            throw new Error("profile_id and action are required");
        }

        if (!["approve", "reject"].includes(action)) {
            throw new Error("action must be 'approve' or 'reject'");
        }

        // Get pending signup data
        const { data: signup, error: signupError } = await supabaseAdmin
            .from("pending_signups")
            .select("*")
            .eq("id", profile_id)
            .single();

        if (signupError || !signup) {
            throw new Error("Pending signup not found");
        }

        if (signup.status !== "pendente") {
            throw new Error("Signup is not pending approval");
        }

        if (action === "reject") {
            // Update status to 'rejeitado'
            const { error: updateError } = await supabaseAdmin
                .from("pending_signups")
                .update({ status: "rejeitado" })
                .eq("id", profile_id);

            if (updateError) throw updateError;

            return new Response(
                JSON.stringify({ success: true, message: "Cadastro rejeitado" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ACTION: APPROVE
        // 1. Create auth user with default password
        // Set is_team_member to prevent trigger from creating duplicate profile/team_member
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: signup.email,
            password: DEFAULT_PASSWORD,
            email_confirm: true,
            user_metadata: {
                full_name: signup.full_name,
                is_approved_client: true,
                is_team_member: true // Prevents handle_new_user trigger from creating records
            },
        });

        if (authError) throw authError;

        const newAuthUserId = authData.user.id;

        // 2. Create/Update profile with the auth user id (upsert to handle trigger race condition)
        const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .upsert({
                id: newAuthUserId,
                full_name: signup.full_name,
                company_name: signup.company_name,
                email: signup.email,
                phone: signup.phone,
                instagram: signup.instagram,
                address: signup.address,
                role: "admin",
                status: "ativo",
                must_change_password: true
            }, { onConflict: 'id' });

        if (profileError) {
            // Rollback: delete auth user
            await supabaseAdmin.auth.admin.deleteUser(newAuthUserId);
            throw profileError;
        }

        // 3. Create team_member entry
        const { error: teamMemberError } = await supabaseAdmin
            .from("team_members")
            .insert({
                user_id: newAuthUserId,
                auth_user_id: newAuthUserId,
                name: signup.full_name || signup.email.split("@")[0],
                full_name: signup.full_name,
                email: signup.email,
                phone: signup.phone,
                role: "admin"
            });

        if (teamMemberError) {
            console.error("team_member creation error:", teamMemberError);
        }

        // 4. Delete the pending signup record
        await supabaseAdmin
            .from("pending_signups")
            .delete()
            .eq("id", profile_id);

        return new Response(
            JSON.stringify({
                success: true,
                message: "Cadastro aprovado! Usuário criado com sucesso.",
                user_id: newAuthUserId
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
