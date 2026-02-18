import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_INSTANCE_APIKEY = "982bc9e2-98aa-4756-b00d-5cadac4cacb8";
const SYSTEM_INSTANCE_ENDPOINT = "https://clinvia.uazapi.com/send/text";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { email } = await req.json();

        if (!email) {
            throw new Error("Email is required");
        }

        // 1. Find user in team_members
        const { data: teamMember, error: teamError } = await supabaseClient
            .from("team_members")
            .select("id, user_id, phone, name")
            .eq("email", email)
            .single();

        if (teamError || !teamMember) {
            console.error("Team member not found:", teamError);
            // Return success even if not found to prevent user enumeration
            return new Response(
                JSON.stringify({ success: true, message: "If the email exists, a password reset will be sent." }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!teamMember.phone) {
            console.error("User has no phone number in team_members");
            throw new Error("User has no registered phone number.");
        }

        // 2. Generate random password (8 chars)
        const newPassword = Math.random().toString(36).slice(-8);

        // 3. Update Auth User Password
        const { error: updateAuthError } = await supabaseClient.auth.admin.updateUserById(
            teamMember.user_id,
            { password: newPassword }
        );

        if (updateAuthError) {
            throw updateAuthError;
        }

        // 4. Set must_change_password = true in profiles
        const { error: profileError } = await supabaseClient
            .from("profiles")
            .update({ must_change_password: true })
            .eq("id", teamMember.user_id);

        if (profileError) {
            console.error("Error updating profile flag:", profileError);
            // Continue anyway, it's not blocking but good to know
        }

        // 5. Send WhatsApp Message
        const firstName = teamMember.name ? teamMember.name.split(' ')[0] : 'Usuário';
        const messageText = `Olá, aqui é a Bia da Clinbia, vi que esqueceu sua senha ne, sem problmeas, vou gerar pra você uma nova senha, assim que entrar vai aparecer um campo para criar uma nova senha beleza?

Aqui esta sua senha provisoria *${newPassword}*`;

        // Clean phone number (remove non-digits)
        let targetNumber = teamMember.phone.replace(/\D/g, "");
        // Ensure 55 prefix if missing (assuming BR for now based on context)
        if (targetNumber.length <= 11) {
            targetNumber = "55" + targetNumber;
        }

        console.log(`Sending password reset to ${targetNumber}`);

        const payload = {
            number: targetNumber,
            text: messageText
        };

        const response = await fetch(SYSTEM_INSTANCE_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "token": SYSTEM_INSTANCE_APIKEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Uzapi sending error:", errorText);
            throw new Error("Failed to send WhatsApp message via System Instance");
        }

        return new Response(
            JSON.stringify({ success: true, message: "Password reset processed." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
