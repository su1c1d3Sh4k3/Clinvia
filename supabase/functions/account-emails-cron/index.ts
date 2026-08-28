import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendEmailSafe, emailConsumoMensal, emailAvisoExclusao } from "../_shared/emails.ts";

/**
 * account-emails-cron (pg_cron diário, 05:00 BRT = 08:00 UTC)
 *
 * Dois avisos por e-mail que dependem de calendário, não de uma ação do usuário:
 *
 * 1. Relatório de consumo — todo dia 1º, para cada conta ativa, com os números
 *    do mês ANTERIOR (RPC get_account_usage_report). Conta sem nenhum consumo
 *    no período é pulada.
 * 2. Aviso de exclusão — D-7 antes de a conta encerrada completar os 30 dias de
 *    retenção (profiles.deactivated_at). Enviado uma única vez, controlado por
 *    profiles.deletion_warning_sent_at.
 *
 * Rodar mais de uma vez no mesmo dia é seguro: o relatório usa o dia do mês como
 * gatilho e o aviso de exclusão tem carimbo próprio.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json; charset=utf-8",
};

/** Dias de retenção após o encerramento (espelha Admin.tsx). */
const RETENTION_DAYS = 30;
/** Quantos dias antes da exclusão o cliente é avisado. */
const WARNING_DAYS_BEFORE = 7;

const SP_TZ = "America/Sao_Paulo";

type Profile = {
    id: string;
    email: string | null;
    full_name: string | null;
    company_name: string | null;
    deactivated_at: string | null;
    deletion_warning_sent_at: string | null;
};

type UsageReport = {
    tokens_entrada: number;
    tokens_saida: number;
    tokens_total: number;
    custo_ia_brl: number;
    disparos_total: number;
    disparos_campanhas: number;
    disparos_automaticos: number;
    templates_meta: number;
    custo_meta_brl: number;
    custo_total_brl: number;
    conversas_atendidas: number;
};

function getSupabase() {
    return createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
}

/** Data de referência no fuso de São Paulo. O corpo pode passar `date` ("AAAA-MM-DD")
 *  para simular outro dia — é assim que se testa o relatório do dia 1º sem esperar
 *  a virada do mês. */
function referenceDate(override?: string): { year: number; month: number; day: number } {
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(override ?? "")
        ? override!
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: SP_TZ,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date());
    const [year, month, day] = iso.split("-").map(Number);
    return { year, month, day };
}

/** Instante UTC correspondente à meia-noite de São Paulo (BRT = UTC-3). */
function spMidnightUtc(year: number, month: number): string {
    return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0)).toISOString();
}

function periodoLabel(year: number, month: number): string {
    const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
        .format(new Date(Date.UTC(year, month - 1, 1)));
    return `${nome} de ${year}`;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const supabase = getSupabase();
    const summary = { usage_sent: 0, usage_skipped: 0, deletion_sent: 0, errors: 0 };

    try {
        const body = (await req.json().catch(() => ({}))) as { date?: string; dry_run?: boolean };
        const today = referenceDate(body.date);
        // dry_run monta os e-mails e conta quem receberia, sem enviar nada
        const dryRun = body.dry_run === true;

        const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, email, full_name, company_name, deactivated_at, deletion_warning_sent_at")
            .neq("role", "super-admin")
            .not("email", "is", null);

        if (profilesError) throw profilesError;
        const todos = (profiles ?? []) as Profile[];

        // ── 1. Relatório de consumo (todo dia 1º, mês anterior) ──
        if (today.day === 1) {
            const mesAnterior = today.month === 1 ? 12 : today.month - 1;
            const anoAnterior = today.month === 1 ? today.year - 1 : today.year;
            const inicio = spMidnightUtc(anoAnterior, mesAnterior);
            const fim = spMidnightUtc(today.year, today.month);
            const periodo = periodoLabel(anoAnterior, mesAnterior);

            for (const profile of todos.filter((p) => !p.deactivated_at)) {
                try {
                    const { data, error } = await supabase.rpc("get_account_usage_report", {
                        p_user_id: profile.id,
                        p_start: inicio,
                        p_end: fim,
                    });
                    if (error) throw error;

                    const uso = (Array.isArray(data) ? data[0] : data) as UsageReport | undefined;
                    // Conta sem movimento no mês não recebe relatório vazio
                    if (!uso || (Number(uso.tokens_total) === 0 && Number(uso.disparos_total) === 0)) {
                        summary.usage_skipped++;
                        continue;
                    }

                    const consumo = emailConsumoMensal({
                        full_name: profile.full_name || profile.email || "tudo bem",
                        company_name: profile.company_name ?? undefined,
                        periodo,
                        tokens_entrada: Number(uso.tokens_entrada),
                        tokens_saida: Number(uso.tokens_saida),
                        tokens_total: Number(uso.tokens_total),
                        custo_ia_brl: Number(uso.custo_ia_brl),
                        disparos_total: Number(uso.disparos_total),
                        disparos_campanhas: Number(uso.disparos_campanhas),
                        disparos_automaticos: Number(uso.disparos_automaticos),
                        templates_meta: Number(uso.templates_meta),
                        custo_meta_brl: Number(uso.custo_meta_brl),
                        custo_total_brl: Number(uso.custo_total_brl),
                        conversas_atendidas: Number(uso.conversas_atendidas),
                    });
                    const ok = dryRun
                        || await sendEmailSafe("usage_report", profile.email, consumo);
                    if (ok) summary.usage_sent++;
                    else summary.errors++;
                } catch (e) {
                    console.error(`[account-emails-cron] consumo de ${profile.id}:`, (e as Error).message);
                    summary.errors++;
                }
            }
        }

        // ── 2. Aviso de exclusão (D-7 do fim da retenção) ──
        for (const profile of todos) {
            if (!profile.deactivated_at || profile.deletion_warning_sent_at) continue;

            const exclusao = new Date(profile.deactivated_at);
            exclusao.setUTCDate(exclusao.getUTCDate() + RETENTION_DAYS);
            const diasRestantes = Math.ceil((exclusao.getTime() - Date.now()) / 86_400_000);
            if (diasRestantes > WARNING_DAYS_BEFORE || diasRestantes < 0) continue;

            const aviso = emailAvisoExclusao({
                full_name: profile.full_name || profile.email || "tudo bem",
                company_name: profile.company_name ?? undefined,
                data_exclusao: exclusao.toLocaleDateString("pt-BR", { timeZone: SP_TZ }),
                dias_restantes: diasRestantes,
            });
            if (dryRun) {
                summary.deletion_sent++;
                continue;
            }

            const ok = await sendEmailSafe("deletion_warning", profile.email, aviso);
            if (ok) {
                await supabase
                    .from("profiles")
                    .update({ deletion_warning_sent_at: new Date().toISOString() })
                    .eq("id", profile.id);
                summary.deletion_sent++;
            } else {
                summary.errors++;
            }
        }

        console.log("[account-emails-cron] summary:", JSON.stringify(summary));
        return new Response(JSON.stringify({ success: true, summary }), { headers: corsHeaders });
    } catch (err) {
        console.error("[account-emails-cron] fatal:", err);
        return new Response(
            JSON.stringify({ success: false, error: String(err), summary }),
            { status: 500, headers: corsHeaders },
        );
    }
});
