/** Confirmação de e-mail do cadastro público.
 *
 *  O cadastro público NÃO cria usuário no auth (grava em pending_signups), então
 *  não dá para usar o fluxo nativo do Supabase — este é o substituto.
 *
 *  action "request": gera o token e manda o e-mail (chamado pela tela de cadastro).
 *  action "confirm": valida o token e marca o e-mail como confirmado
 *                    (chamado pela página pública /confirmar-email).
 *
 *  Pública de propósito. As duas ações só funcionam sobre um cadastro que já
 *  existe e está pendente, e o reenvio tem intervalo mínimo — não dá para usar
 *  a função para descobrir e-mails nem para disparar mensagem em massa. */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { sendEmailSafe, emailConfirmacaoCadastro } from "../_shared/emails.ts";

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

/** Dias de validade do link e intervalo mínimo entre reenvios. */
const VALIDADE_DIAS = 7;
const REENVIO_MINUTOS = 2;

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    try {
        const body = await req.json().catch(() => ({}));
        const { action, email, token } = body as {
            action?: string; email?: string; token?: string;
        };

        /* ------------------------------------------------------------- request */
        if (action === "request") {
            const mail = (email ?? "").toLowerCase().trim();
            if (!mail) return json({ success: false, error: "Informe o e-mail do cadastro." }, 400);

            const { data: signup, error } = await admin
                .from("pending_signups")
                .select("id, full_name, company_name, email, status, confirm_sent_at, email_confirmed_at")
                .eq("email", mail)
                .maybeSingle();

            if (error) {
                console.error("[signup-confirm] leitura do cadastro falhou:", error.message);
                return json({ success: false, error: "Não foi possível localizar o cadastro agora. Tente novamente." }, 500);
            }
            // resposta neutra: não revela se o e-mail existe ou já foi confirmado
            if (!signup || signup.status !== "pendente" || signup.email_confirmed_at) {
                return json({ success: true, sent: false });
            }
            if (signup.confirm_sent_at &&
                Date.now() - new Date(signup.confirm_sent_at).getTime() < REENVIO_MINUTOS * 60_000) {
                return json({ success: true, sent: false, reason: "aguarde" });
            }

            const novoToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
            const expira = new Date(Date.now() + VALIDADE_DIAS * 86_400_000).toISOString();

            const { error: upErr } = await admin
                .from("pending_signups")
                .update({
                    confirm_token: novoToken,
                    confirm_expires_at: expira,
                    confirm_sent_at: new Date().toISOString(),
                })
                .eq("id", signup.id);

            if (upErr) {
                console.error("[signup-confirm] gravação do token falhou:", upErr.message);
                return json({ success: false, error: "Não foi possível gerar o link de confirmação. Tente novamente." }, 500);
            }

            const enviado = await sendEmailSafe("signup_confirmation", signup.email, emailConfirmacaoCadastro({
                full_name: signup.full_name,
                company_name: signup.company_name,
                confirm_url: `${APP_URL}/confirmar-email?token=${novoToken}`,
            }));

            return json({ success: true, sent: enviado });
        }

        /* ------------------------------------------------------------- confirm */
        if (action === "confirm") {
            const t = (token ?? "").trim();
            if (!t) return json({ success: false, error: "Link inválido: o código de confirmação não veio na URL." }, 400);

            const { data: signup, error } = await admin
                .from("pending_signups")
                .select("id, full_name, company_name, status, confirm_expires_at, email_confirmed_at")
                .eq("confirm_token", t)
                .maybeSingle();

            if (error) {
                console.error("[signup-confirm] leitura do token falhou:", error.message);
                return json({ success: false, error: "Não foi possível confirmar agora. Tente novamente em alguns minutos." }, 500);
            }
            if (!signup) {
                return json({ success: false, error: "Este link de confirmação não é válido. Peça um novo na tela de cadastro." }, 400);
            }
            // já confirmado antes: a página deve mostrar sucesso, não erro
            if (signup.email_confirmed_at) {
                return json({ success: true, already: true, full_name: signup.full_name });
            }
            if (signup.confirm_expires_at && new Date(signup.confirm_expires_at) < new Date()) {
                return json({ success: false, error: "Este link expirou. Refaça o cadastro para receber um novo link de confirmação." }, 400);
            }

            const { error: upErr } = await admin
                .from("pending_signups")
                .update({ email_confirmed_at: new Date().toISOString(), confirm_token: null })
                .eq("id", signup.id);

            if (upErr) {
                console.error("[signup-confirm] confirmação falhou:", upErr.message);
                return json({ success: false, error: "Não foi possível confirmar agora. Tente novamente em alguns minutos." }, 500);
            }

            return json({ success: true, already: false, full_name: signup.full_name });
        }

        return json({ success: false, error: `Ação desconhecida: "${action}". Válidas: request, confirm.` }, 400);
    } catch (e) {
        console.error("[signup-confirm]", e);
        return json({ success: false, error: (e as Error).message }, 500);
    }
});
