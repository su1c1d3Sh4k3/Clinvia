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

import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { sendEmailSafe, emailRecuperacaoSenha } from "../_shared/emails.ts";
import { apiError } from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-origin",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

const APP_URL = Deno.env.get("APP_PUBLIC_URL") ?? "https://app.clinbia.ai";

serveMonitored("request-password-reset", async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const admin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { email } = await req.json().catch(() => ({}));
        const mail = String(email ?? "").toLowerCase().trim();
        // `error` E `message` com o mesmo texto: o contrato de `_shared/api-errors.ts`
        // manda os dois porque metade do front lê um e metade lê o outro. Aqui o
        // corpo só chegava em `error`, então a tela não tinha o que mostrar.
        if (!mail) {
            return apiError(corsHeaders, {
                status: 400,
                code: "email_missing",
                message: "Informe o e-mail da conta para receber o link de redefinição.",
            });
        }

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
        // Esta function é anônima (`verify_jwt = false`) e a tela de login a
        // chama antes de existir sessão: quem lê a resposta pode ser qualquer
        // um que saiba a URL. O corpo inteiro do ramo de erro era
        // `(error as Error).message` — texto cru do Postgres/Auth, com nome de
        // tabela, coluna e policy dentro.
        //
        // O motivo real não se perde: `details` + `report: true` o levam para o
        // log e para o incidente. Sem isso a limpeza seria cegueira, porque o
        // `serveMonitored` monta o incidente lendo o CORPO da resposta 5xx.
        //
        // `details` NÃO sai no corpo aqui: só sai em function que chamou
        // `detalheTecnicoNoCorpo()`, e esta — anônima — nunca vai chamar.
        return apiError(corsHeaders, {
            status: 500,
            code: "reset_failed",
            request: req,
            report: true,
            message: "Não foi possível iniciar a recuperação de senha agora. Tente novamente em alguns minutos; se continuar, fale com o suporte.",
            details: String((error as Error)?.message ?? error ?? "erro sem mensagem"),
        });
    }
});
