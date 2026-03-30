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

        // Verify the caller is a super-admin via their JWT token
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            throw new Error("Não autorizado");
        }

        const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(
            authHeader.replace("Bearer ", "")
        );

        if (callerError || !caller) {
            throw new Error("Token inválido");
        }

        const { data: callerProfile } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", caller.id)
            .single();

        if (callerProfile?.role !== "super-admin") {
            throw new Error("Apenas super-admins podem excluir contas");
        }

        const { profileId } = await req.json();

        if (!profileId) {
            throw new Error("profileId é obrigatório");
        }

        // Prevent deletion of super-admins
        const { data: targetProfile } = await supabaseAdmin
            .from("profiles")
            .select("role, full_name, email")
            .eq("id", profileId)
            .single();

        if (!targetProfile) {
            throw new Error("Conta não encontrada");
        }

        if (targetProfile.role === "super-admin") {
            throw new Error("Não é possível excluir uma conta super-admin");
        }

        console.log(`[admin-delete-client] Deleting account: ${targetProfile.email} (${profileId})`);

        // 1. Delete notifications (no cascade via related_user_id)
        await supabaseAdmin
            .from("notifications" as any)
            .delete()
            .or(`user_id.eq.${profileId},related_user_id.eq.${profileId}`);

        // 2. Delete dashboard notifications
        await supabaseAdmin
            .from("dashboard_notifications" as any)
            .delete()
            .eq("user_id", profileId);

        // 3. Delete messages via conversations (messages FK → conversations)
        //    First get conversation IDs for this user
        const { data: conversations } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("user_id", profileId);

        if (conversations && conversations.length > 0) {
            const convIds = conversations.map((c: any) => c.id);
            await supabaseAdmin
                .from("messages")
                .delete()
                .in("conversation_id", convIds);
        }

        // 4. Delete conversations
        await supabaseAdmin
            .from("conversations")
            .delete()
            .eq("user_id", profileId);

        // 5. Delete contact_tags via contacts
        const { data: contacts } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("user_id", profileId);

        if (contacts && contacts.length > 0) {
            const contactIds = contacts.map((c: any) => c.id);
            await supabaseAdmin
                .from("contact_tags" as any)
                .delete()
                .in("contact_id", contactIds);
        }

        // 6. Delete contacts
        await supabaseAdmin
            .from("contacts")
            .delete()
            .eq("user_id", profileId);

        // 7. Delete tasks via task_boards
        const { data: boards } = await supabaseAdmin
            .from("task_boards" as any)
            .select("id")
            .eq("user_id", profileId);

        if (boards && boards.length > 0) {
            const boardIds = boards.map((b: any) => b.id);
            await supabaseAdmin
                .from("tasks" as any)
                .delete()
                .in("board_id", boardIds);
        }

        // 8. Delete task boards
        await supabaseAdmin
            .from("task_boards" as any)
            .delete()
            .eq("user_id", profileId);

        // 9. Delete appointments
        await supabaseAdmin
            .from("appointments" as any)
            .delete()
            .eq("user_id", profileId);

        // 10. Delete scheduling_settings
        await supabaseAdmin
            .from("scheduling_settings" as any)
            .delete()
            .eq("user_id", profileId);

        // 11. Delete professionals
        await supabaseAdmin
            .from("professionals" as any)
            .delete()
            .eq("user_id", profileId);

        // 12. Delete products_services
        await supabaseAdmin
            .from("products_services" as any)
            .delete()
            .eq("user_id", profileId);

        // 13. Delete tags
        await supabaseAdmin
            .from("tags" as any)
            .delete()
            .eq("user_id", profileId);

        // 14. Delete queues
        await supabaseAdmin
            .from("queues" as any)
            .delete()
            .eq("user_id", profileId);

        // 15. Delete instances
        await supabaseAdmin
            .from("instances" as any)
            .delete()
            .eq("user_id", profileId);

        // 16. Delete financial data
        await supabaseAdmin
            .from("revenues" as any)
            .delete()
            .eq("user_id", profileId);

        await supabaseAdmin
            .from("expenses" as any)
            .delete()
            .eq("user_id", profileId);

        await supabaseAdmin
            .from("sales" as any)
            .delete()
            .eq("user_id", profileId);

        // 17. Delete ia_config
        await supabaseAdmin
            .from("ia_config" as any)
            .delete()
            .eq("user_id", profileId);

        // 18. Delete copilot_settings
        await supabaseAdmin
            .from("copilot_settings" as any)
            .delete()
            .eq("user_id", profileId);

        // 19. Delete quick_messages
        await supabaseAdmin
            .from("quick_messages" as any)
            .delete()
            .eq("user_id", profileId);

        // 20. Delete notification_settings
        await supabaseAdmin
            .from("notification_settings" as any)
            .delete()
            .eq("user_id", profileId);

        // 21. Delete token usage logs
        await supabaseAdmin
            .from("token_usage_log" as any)
            .delete()
            .eq("user_id", profileId);

        await supabaseAdmin
            .from("token_monthly_history" as any)
            .delete()
            .eq("user_id", profileId);

        // 22. Delete team_members (related to this account's team)
        await supabaseAdmin
            .from("team_members")
            .delete()
            .eq("user_id", profileId);

        // 23. Delete team members who BELONG to this tenant (auth_user_id != profileId)
        //     These are agents/supervisors under this admin account
        const { data: teamAuthIds } = await supabaseAdmin
            .from("team_members")
            .select("auth_user_id")
            .eq("user_id", profileId);

        if (teamAuthIds && teamAuthIds.length > 0) {
            for (const member of teamAuthIds) {
                if (member.auth_user_id && member.auth_user_id !== profileId) {
                    await supabaseAdmin.auth.admin.deleteUser(member.auth_user_id).catch(() => {});
                }
            }
        }

        // 24. Delete the auth user — this cascades to profiles
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(profileId);

        if (authError) {
            throw authError;
        }

        console.log(`[admin-delete-client] Account deleted successfully: ${profileId}`);

        return new Response(
            JSON.stringify({ success: true, message: "Conta excluída com sucesso" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error("[admin-delete-client] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
