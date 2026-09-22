// Coleta consumo e custo real da OpenAI por PROJETO e grava por dia.
//
// Cron: de hora em hora (janela curta) e uma vez por dia (janela do mes, para
// corrigir dia fechado). Tambem chamavel a mao com { sinceDays, profileId }.
//
// NADA RETROATIVO: a janela de cada conta nunca comeca antes de
// `profiles.openai_provisioned_at`. Consumo anterior ao provisionamento ficou na
// chave compartilhada e continua sendo mostrado como "estimado" pelo
// token_usage_log — misturar os dois contaria o mesmo gasto duas vezes.
//
// Alerta de gasto: quando o custo real do mes cruza um patamar
// (`llm_platform_settings.spend_alert_threshold`, hoje 0.80, e 1.00), grava
// `openai_spend_alert_level` + `openai_spend_alert_sent_at` uma unica vez por
// patamar. O card do Super Admin le isso; aqui nao se dispara e-mail.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchCosts, fetchUsage, resolveAdminKey } from "../_shared/openai-admin.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json; charset=utf-8',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

/** Inicio do mes corrente em Sao Paulo, em unix seconds UTC. */
function monthStartUnix(): number {
    const sp = new Date(new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }));
    return Math.floor(Date.UTC(sp.getFullYear(), sp.getMonth(), 1, 3, 0, 0) / 1000);
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    try {
        const body = await req.json().catch(() => ({}));
        const sinceDays: number | null = Number.isFinite(body?.sinceDays) ? Number(body.sinceDays) : null;
        const onlyProfileId: string | null = typeof body?.profileId === 'string' ? body.profileId : null;

        const admin = resolveAdminKey();
        if (!admin) {
            return json({
                success: false,
                error: 'Nenhuma chave de admin da OpenAI configurada (OPENAI_ADMIN_KEY_WRITE ou OPENAI_ADMIN_KEY)',
                code: 'openai_admin_key_missing',
            }, 500);
        }

        const { data: settings } = await supabase
            .from('llm_platform_settings')
            .select('spend_alert_threshold')
            .eq('id', true)
            .maybeSingle();
        const threshold = Number(settings?.spend_alert_threshold ?? 0.8);

        let q = supabase
            .from('profiles')
            .select('id, company_name, full_name, openai_project_id, openai_provisioned_at, openai_spend_limit_usd, openai_spend_alert_level')
            .not('openai_project_id', 'is', null);
        if (onlyProfileId) q = q.eq('id', onlyProfileId);

        const { data: accounts, error: accErr } = await q;
        if (accErr) return json({ success: false, error: accErr.message, code: 'db_error' }, 500);

        const list = accounts ?? [];
        if (!list.length) {
            return json({ success: true, accounts: 0, message: 'Nenhuma conta com projeto na OpenAI.' });
        }

        // Janela: a mais antiga entre as contas, respeitando o provisionamento.
        const windowStart = sinceDays
            ? Math.floor(Date.now() / 1000) - sinceDays * 86400
            : monthStartUnix();
        const provisionedFloor = Math.min(
            ...list.map((a) => a.openai_provisioned_at
                ? Math.floor(new Date(a.openai_provisioned_at).getTime() / 1000)
                : windowStart),
        );
        const startTime = Math.max(windowStart, provisionedFloor);
        const projectIds = list.map((a) => a.openai_project_id as string);

        const [usage, costs] = await Promise.all([
            fetchUsage(admin, startTime, projectIds),
            fetchCosts(admin, startTime, projectIds),
        ]);

        // Corte por conta: nada antes do provisionamento daquela conta.
        const floorByProject = new Map<string, string>();
        for (const a of list) {
            if (a.openai_provisioned_at) {
                floorByProject.set(
                    a.openai_project_id as string,
                    new Date(a.openai_provisioned_at).toISOString().slice(0, 10),
                );
            }
        }
        const afterFloor = (projectId: string, day: string) => {
            const floor = floorByProject.get(projectId);
            return !floor || day >= floor;
        };

        const usageRows = usage
            .filter((u) => afterFloor(u.projectId, u.day))
            .map((u) => ({
                day: u.day,
                project_id: u.projectId,
                model: u.model,
                input_tokens: u.inputTokens,
                input_cached_tokens: u.inputCachedTokens,
                output_tokens: u.outputTokens,
                num_model_requests: u.numModelRequests,
                updated_at: new Date().toISOString(),
            }));

        const costRows = costs
            .filter((c) => afterFloor(c.projectId, c.day))
            .map((c) => ({
                day: c.day,
                project_id: c.projectId,
                line_item: c.lineItem,
                cost_usd: c.costUsd,
                currency: c.currency,
                updated_at: new Date().toISOString(),
            }));

        if (usageRows.length) {
            const { error } = await supabase
                .from('openai_project_usage_daily')
                .upsert(usageRows, { onConflict: 'day,project_id,model' });
            if (error) return json({ success: false, error: error.message, code: 'db_error_usage' }, 500);
        }
        if (costRows.length) {
            const { error } = await supabase
                .from('openai_project_costs_daily')
                .upsert(costRows, { onConflict: 'day,project_id,line_item' });
            if (error) return json({ success: false, error: error.message, code: 'db_error_costs' }, 500);
        }

        // Alerta de patamar, sobre o custo real do mes corrente.
        const monthFloor = new Date(monthStartUnix() * 1000).toISOString().slice(0, 10);
        const monthCostByProject = new Map<string, number>();
        for (const c of costRows) {
            if (c.day < monthFloor) continue;
            monthCostByProject.set(c.project_id, (monthCostByProject.get(c.project_id) ?? 0) + c.cost_usd);
        }

        const alerts: unknown[] = [];
        for (const a of list) {
            const limit = Number(a.openai_spend_limit_usd ?? 0);
            if (!limit) continue;
            const spent = monthCostByProject.get(a.openai_project_id as string) ?? 0;
            const ratio = spent / limit;
            const reached = ratio >= 1 ? 1 : ratio >= threshold ? threshold : 0;
            const current = Number(a.openai_spend_alert_level ?? 0);
            if (reached > current) {
                await supabase
                    .from('profiles')
                    .update({
                        openai_spend_alert_level: reached,
                        openai_spend_alert_sent_at: new Date().toISOString(),
                    })
                    .eq('id', a.id);
                const label = a.company_name ?? a.full_name ?? a.id;
                console.warn(`[sync-openai-usage] ALERTA ${label}: US$ ${spent.toFixed(2)} de US$ ${limit} (${Math.round(ratio * 100)}%)`);
                alerts.push({ profile_id: a.id, company: label, spent_usd: spent, limit_usd: limit, level: reached });
            }
        }

        return json({
            success: true,
            accounts: list.length,
            window_start: new Date(startTime * 1000).toISOString(),
            usage_rows: usageRows.length,
            cost_rows: costRows.length,
            alerts,
            admin_key_source: admin.source,
        });
    } catch (err: any) {
        console.error('[sync-openai-usage] erro:', err?.code, err?.message || err);
        return json({ success: false, error: err?.message || 'Erro inesperado', code: err?.code || 'unexpected_error' }, 500);
    }
});
