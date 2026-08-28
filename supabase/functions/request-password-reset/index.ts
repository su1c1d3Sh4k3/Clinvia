/** Recuperação de senha por e-mail.
 *
 *  Gera um token de recuperação do próprio Supabase Auth (generateLink) e manda
 *  o link pela Resend, no nosso template em português. O link aponta para a
 *  página /redefinir-senha da plataforma, que troca o token por uma sessão
 *  temporária (verifyOtp) e pede a nova senha.
 *
 *  Antes disto o fluxo sorteava uma senha aleatória e mandava por WhatsApp —
 *  a senha trafegava em texto puro e quem não tinha telefone cadastrado ficava
 *  sem saída. */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { sendEmailSafe, emailRecuperacaoSenha } from "../_shared/emails.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

const APP_URL = Deno.env.get("APP_PUBLIC_URL") ?? "https://app.clinbia.ai";

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const admin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { email } = await req.json().catch(() => ({}));
        const mail = String(email ?? "").toLowerCase().trim();
        if (!mail) return json({ success: false, error: "Informe o e-mail da conta." }, 400);

        // Resposta sempre igual: não revelamos quais e-mails existem na base.
        const ok = json({ success: true, message: "Se o e-mail estiver cadastrado, o link de redefinição chega em instantes." });

        const { data: member, error: memberError } = await admin
            .from("team_members")
            .select("name, full_name")
            .eq("email", mail)
            .maybeSingle();

        if (memberError) {
            console.error("[request-password-reset] busca do membro falhou:", memberError.message);
        }

        const { data: link, error: linkError } = await admin.auth.admin.generateLink({
            type: "recovery",
            email: mail,
        });

        if (linkError || !link?.properties?.hashed_token) {
            // e-mail inexistente cai aqui — segue com a resposta neutra
            console.warn("[request-password-reset] sem token para", mail, linkError?.message);
            return ok;
        }

        await sendEmailSafe("password_reset", mail, emailRecuperacaoSenha({
            full_name: member?.full_name || member?.name || undefined,
            reset_url: `${APP_URL}/redefinir-senha?token=${link.properties.hashed_token}`,
            validade: "1 hora",
        }));

        return ok;
    } catch (error) {
        console.error("[request-password-reset]", error);
        return json({ success: false, error: (error as Error).message }, 500);
    }
});
