/** Ponto único de envio dos e-mails transacionais da conta (Resend).
 *
 *  Quem chama: approve-client (acesso liberado), o cadastro público (confirmação),
 *  a desativação no super admin (encerramento) e o cron do dia 1º (consumo).
 *
 *  Autenticação: chave de serviço no Authorization, ou um usuário logado com
 *  papel super-admin. Sem isso qualquer um dispararia e-mail em nome da Clinbia. */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
    sendEmail,
    emailConfirmacaoCadastro,
    emailAcessoLiberado,
    emailRecuperacaoSenha,
    emailConsumoMensal,
    emailContaEncerrada,
    type BuiltEmail,
} from "../_shared/emails.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

const SERVICE_KEYS = [
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    ...(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "").split(","),
].map((k) => k?.trim()).filter(Boolean) as string[];

async function isAuthorized(req: Request): Promise<boolean> {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return false;
    if (SERVICE_KEYS.includes(bearer)) return true;

    // usuário logado: só super-admin pode disparar
    const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: userData } = await admin.auth.getUser(bearer);
    if (!userData?.user) return false;
    const { data: profile } = await admin
        .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    return profile?.role === "super-admin";
}

function build(template: string, vars: Record<string, any>): BuiltEmail {
    switch (template) {
        case "signup_confirmation": return emailConfirmacaoCadastro(vars as any);
        case "access_released": return emailAcessoLiberado(vars as any);
        case "password_reset": return emailRecuperacaoSenha(vars as any);
        case "usage_report": return emailConsumoMensal(vars as any);
        case "account_closed": return emailContaEncerrada(vars as any);
        default:
            throw new Error(
                `Template desconhecido: "${template}". Válidos: signup_confirmation, access_released, password_reset, usage_report, account_closed.`,
            );
    }
}

/** Dados de exemplo para revisão dos textos antes de ligar os gatilhos. */
const SAMPLE: Record<string, Record<string, any>> = {
    signup_confirmation: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
        confirm_url: "https://app.clinbia.ai/confirmar-email?token=exemplo-de-token-1234567890",
    },
    access_released: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
        login_email: "marina@clinicavitalis.com.br",
        temp_password: "Clinbia123",
    },
    password_reset: {
        full_name: "Marina Alves",
        reset_url: "https://app.clinbia.ai/redefinir-senha?token=exemplo-de-token-1234567890",
    },
    usage_report: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
        periodo: "agosto de 2026",
        tokens_entrada: 4_812_930,
        tokens_saida: 962_144,
        tokens_total: 5_775_074,
        custo_ia_brl: 187.42,
        disparos_campanhas: 1_284,
        disparos_automaticos: 613,
        disparos_total: 1_897,
        templates_meta: 1_452,
        custo_meta_brl: 421.36,
        custo_total_brl: 608.78,
        conversas_atendidas: 742,
    },
    account_closed: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
        data_encerramento: "28/08/2026",
        dias_retencao: 30,
    },
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        if (!(await isAuthorized(req))) {
            return json({ success: false, error: "Não autorizado" }, 401);
        }

        const body = await req.json().catch(() => ({}));
        const { template, to, vars, preview, reply_to } = body as {
            template?: string; to?: string | string[];
            vars?: Record<string, any>; preview?: boolean; reply_to?: string;
        };

        if (!to) return json({ success: false, error: "Campo obrigatório ausente: to" }, 400);

        // preview: manda os 5 modelos com dados de exemplo para revisão
        if (preview && !template) {
            const sent: Array<Record<string, unknown>> = [];
            for (const name of Object.keys(SAMPLE)) {
                const mail = build(name, SAMPLE[name]);
                const { id } = await sendEmail({ to, ...mail, replyTo: reply_to });
                sent.push({ template: name, subject: mail.subject, id });
            }
            return json({ success: true, preview: true, sent });
        }

        if (!template) {
            return json({ success: false, error: "Campo obrigatório ausente: template" }, 400);
        }

        const mail = build(template, preview ? SAMPLE[template] ?? {} : vars ?? {});
        const { id } = await sendEmail({ to, ...mail, replyTo: reply_to });
        return json({ success: true, id, template, subject: mail.subject });
    } catch (error) {
        console.error("[send-account-email]", error);
        return json({ success: false, error: (error as Error).message }, 500);
    }
});
