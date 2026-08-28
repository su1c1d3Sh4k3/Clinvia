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
    emailConviteColaborador,
    emailCadastroRecusado,
    emailConexaoCaiu,
    emailContaReativada,
    emailAvisoExclusao,
    emailRestricaoMeta,
    emailSenhaAlterada,
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

/** Único template que um usuário comum pode disparar — e só para o próprio
 *  e-mail, resolvido do JWT (o campo `to` da requisição é ignorado). */
const SELF_SERVICE_TEMPLATE = "password_changed";

type Auth =
    | { kind: "service" }
    | { kind: "super-admin" }
    | { kind: "self"; email: string; fullName?: string }
    | null;

async function authenticate(req: Request): Promise<Auth> {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return null;
    if (SERVICE_KEYS.includes(bearer)) return { kind: "service" };

    const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: userData } = await admin.auth.getUser(bearer);
    if (!userData?.user) return null;

    const { data: profile } = await admin
        .from("profiles").select("role, full_name").eq("id", userData.user.id).maybeSingle();
    if (profile?.role === "super-admin") return { kind: "super-admin" };
    if (!userData.user.email) return null;

    const { data: member } = await admin
        .from("team_members").select("full_name, name")
        .eq("auth_user_id", userData.user.id).maybeSingle();

    return {
        kind: "self",
        email: userData.user.email,
        fullName: member?.full_name || member?.name || profile?.full_name || undefined,
    };
}

const TEMPLATES = [
    "signup_confirmation", "access_released", "password_reset", "usage_report",
    "account_closed", "team_invite", "signup_rejected", "connection_down",
    "account_reactivated", "deletion_warning", "meta_restriction", "password_changed",
] as const;

function build(template: string, vars: Record<string, any>): BuiltEmail {
    switch (template) {
        case "signup_confirmation": return emailConfirmacaoCadastro(vars as any);
        case "access_released": return emailAcessoLiberado(vars as any);
        case "password_reset": return emailRecuperacaoSenha(vars as any);
        case "usage_report": return emailConsumoMensal(vars as any);
        case "account_closed": return emailContaEncerrada(vars as any);
        case "team_invite": return emailConviteColaborador(vars as any);
        case "signup_rejected": return emailCadastroRecusado(vars as any);
        case "connection_down": return emailConexaoCaiu(vars as any);
        case "account_reactivated": return emailContaReativada(vars as any);
        case "deletion_warning": return emailAvisoExclusao(vars as any);
        case "meta_restriction": return emailRestricaoMeta(vars as any);
        case "password_changed": return emailSenhaAlterada(vars as any);
        default:
            throw new Error(
                `Template desconhecido: "${template}". Válidos: ${TEMPLATES.join(", ")}.`,
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
    team_invite: {
        full_name: "Rafael Prado",
        company_name: "Clínica Vitalis",
        login_email: "rafael@clinicavitalis.com.br",
        temp_password: "Clinbia123",
        role: "agent",
    },
    signup_rejected: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
    },
    connection_down: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
        instance_name: "Recepção",
        phone: "(11) 98888-7777",
    },
    account_reactivated: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
        login_email: "marina@clinicavitalis.com.br",
    },
    deletion_warning: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
        data_exclusao: "27/09/2026",
        dias_restantes: 7,
    },
    meta_restriction: {
        full_name: "Marina Alves",
        company_name: "Clínica Vitalis",
        instance_name: "WhatsApp Oficial",
        phone: "(11) 98888-7777",
    },
    password_changed: {
        full_name: "Marina Alves",
        login_email: "marina@clinicavitalis.com.br",
        data_alteracao: "28/08/2026 às 14:32",
    },
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const auth = await authenticate(req);
        if (!auth) return json({ success: false, error: "Não autorizado" }, 401);

        const body = await req.json().catch(() => ({}));
        const { template, vars, preview, reply_to } = body as {
            template?: string; vars?: Record<string, any>;
            preview?: boolean; reply_to?: string;
        };
        let to = (body as { to?: string | string[] }).to;
        let finalVars = vars ?? {};

        // usuário comum: só o aviso de senha alterada, sempre para o próprio
        // e-mail, com nome e login vindos do JWT (não do corpo da requisição)
        if (auth.kind === "self") {
            if (template !== SELF_SERVICE_TEMPLATE || preview) {
                return json({ success: false, error: "Não autorizado" }, 403);
            }
            to = auth.email;
            finalVars = { ...finalVars, login_email: auth.email, full_name: auth.fullName };
        }

        if (!to) return json({ success: false, error: "Campo obrigatório ausente: to" }, 400);

        // preview: manda todos os modelos com dados de exemplo para revisão
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

        const mail = build(template, preview ? SAMPLE[template] ?? {} : finalVars);
        const { id } = await sendEmail({ to, ...mail, replyTo: reply_to });
        return json({ success: true, id, template, subject: mail.subject });
    } catch (error) {
        console.error("[send-account-email]", error);
        return json({ success: false, error: (error as Error).message }, 500);
    }
});
