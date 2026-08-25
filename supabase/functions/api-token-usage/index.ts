// API de consumo de tokens do n8n (x-api-key = SCHEDULING_API_KEY)
//
// O n8n chama esta função a cada requisição da IA com o JSON de usage:
// [{ id: "<workflow_id>", name, execution_id,
//    tokenUsage: { model, tokenUsage: { completionTokens, promptTokens, totalTokens } } }]
//
// Fluxo por item:
//   1. Resolve o tenant pelo workflow_id (cada user tem workflow próprio):
//      instances.workflow_id → ia_config.workflow_id
//   2. Preço USD por modelo via tabela llm_model_prices (editável no banco)
//   3. Converte para BRL com cotação real (AwesomeAPI USD-BRL; fallback última
//      cotação usada no log; fallback final 5.50)
//   4. Insere token_usage_log (source 'n8n', function_name 'n8n', cost_usd +
//      cost_brl + exchange_rate + workflow_id + execution_id) e soma nos
//      acumuladores do tenant (profiles.tokens_total/monthly + custos)
//
// Resposta inclui o consumo do mês corrente do tenant separado por origem
// (n8n vs sistema) para monitoramento.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const FALLBACK_RATE = 5.50;
const FALLBACK_MODEL = 'gpt-5.4-mini';

interface UsageItem {
    id?: string;                 // workflow_id
    workflow_id?: string;        // alternativa explícita
    name?: string;
    execution_id?: number | string;
    tokenUsage?: {
        model?: string;
        tokenUsage?: { completionTokens?: number; promptTokens?: number; totalTokens?: number };
        // formato achatado (tolerância)
        completionTokens?: number;
        promptTokens?: number;
        totalTokens?: number;
    };
    model?: string;              // tolerância: model na raiz
}

async function getUsdBrlRate(supabase: any): Promise<{ rate: number; source: string }> {
    // 1) Cotação real do dia
    try {
        const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
            signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
            const data = await res.json();
            const bid = parseFloat(data?.USDBRL?.bid);
            if (Number.isFinite(bid) && bid > 0) return { rate: bid, source: 'awesomeapi' };
        }
    } catch (e) {
        console.warn('[api-token-usage] AwesomeAPI failed:', (e as Error).message);
    }
    // 2) Última cotação usada no log
    try {
        const { data } = await supabase
            .from('token_usage_log')
            .select('exchange_rate')
            .not('exchange_rate', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        const last = parseFloat(data?.exchange_rate);
        if (Number.isFinite(last) && last > 0) return { rate: last, source: 'last_used' };
    } catch { /* segue pro fallback fixo */ }
    // 3) Fixo
    return { rate: FALLBACK_RATE, source: 'fixed_fallback' };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const apiKey = req.headers.get('x-api-key');
        if (!apiKey || apiKey !== Deno.env.get('SCHEDULING_API_KEY')) {
            return json({ success: false, error: 'Invalid or missing x-api-key' }, 401);
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const raw = await req.json();
        const items: UsageItem[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : [raw]);
        if (!items.length) {
            return json({ success: false, error: 'Empty payload' }, 400);
        }

        // Tabela de preços (uma leitura por chamada)
        const { data: priceRows, error: priceErr } = await supabase
            .from('llm_model_prices')
            .select('model, input_usd_per_1m, output_usd_per_1m');
        if (priceErr) throw new Error('Failed to load llm_model_prices: ' + priceErr.message);
        const prices = new Map<string, { input: number; output: number }>();
        for (const p of priceRows ?? []) {
            prices.set(String(p.model).toLowerCase(), {
                input: Number(p.input_usd_per_1m),
                output: Number(p.output_usd_per_1m),
            });
        }

        const { rate, source: rateSource } = await getUsdBrlRate(supabase);

        const results: any[] = [];
        const ownerCache = new Map<string, string | null>();
        let totalTokens = 0, totalUsd = 0, totalBrl = 0;
        let lastOwnerId: string | null = null;

        for (const item of items) {
            const workflowId = item.workflow_id || item.id || null;
            const usage = item.tokenUsage?.tokenUsage ?? item.tokenUsage ?? {};
            const model = (item.tokenUsage?.model || item.model || '').trim();
            const promptTokens = Number((usage as any).promptTokens) || 0;
            const completionTokens = Number((usage as any).completionTokens) || 0;
            const itemTokens = Number((usage as any).totalTokens) || (promptTokens + completionTokens);

            if (!workflowId) {
                results.push({ ok: false, error: 'Missing workflow id', item: item.name || null });
                continue;
            }
            if (itemTokens <= 0) {
                results.push({ ok: false, workflow_id: workflowId, error: 'No token usage in item' });
                continue;
            }

            // Resolve tenant pelo código do workflow (cache por chamada):
            // instances.workflow_code (gravado pelo n8n) -> instances.workflow_id
            // (legado) -> ia_config.workflow_id (legado)
            let ownerId = ownerCache.get(workflowId);
            if (ownerId === undefined) {
                const { data: instByCode } = await supabase
                    .from('instances')
                    .select('user_id')
                    .eq('workflow_code', workflowId)
                    .limit(1)
                    .maybeSingle();
                ownerId = instByCode?.user_id ?? null;
                if (!ownerId) {
                    const { data: inst } = await supabase
                        .from('instances')
                        .select('user_id')
                        .eq('workflow_id', workflowId)
                        .limit(1)
                        .maybeSingle();
                    ownerId = inst?.user_id ?? null;
                }
                if (!ownerId) {
                    const { data: cfg } = await supabase
                        .from('ia_config')
                        .select('user_id')
                        .eq('workflow_id', workflowId)
                        .limit(1)
                        .maybeSingle();
                    ownerId = cfg?.user_id ?? null;
                }
                ownerCache.set(workflowId, ownerId);
            }
            if (!ownerId) {
                results.push({ ok: false, workflow_id: workflowId, error: 'No tenant found for this workflow_id' });
                continue;
            }

            // Preço do modelo (fallback: modelo padrão)
            const modelKey = model.toLowerCase();
            const price = prices.get(modelKey) ?? prices.get(FALLBACK_MODEL)!;
            const priceFallback = !prices.has(modelKey);
            if (priceFallback) {
                console.warn(`[api-token-usage] Unknown model "${model}" — using ${FALLBACK_MODEL} prices`);
            }

            const costUsd = (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
            const costBrl = costUsd * rate;

            const { error: insErr } = await supabase.from('token_usage_log').insert({
                owner_id: ownerId,
                team_member_id: null,
                function_name: 'n8n',
                source: 'n8n',
                model: model || 'unknown',
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: itemTokens,
                cost_usd: costUsd,
                cost_brl: costBrl,
                exchange_rate: rate,
                workflow_id: workflowId,
                execution_id: item.execution_id != null ? Number(item.execution_id) : null,
            });
            if (insErr) {
                results.push({ ok: false, workflow_id: workflowId, error: 'Log insert failed: ' + insErr.message });
                continue;
            }

            // Soma nos acumuladores do tenant (mesmos contadores da IA do sistema)
            const { error: accErr } = await supabase.rpc('increment_profile_token_usage', {
                p_owner_id: ownerId,
                p_tokens: itemTokens,
                p_cost_usd: costUsd,
            });
            if (accErr) console.error('[api-token-usage] accumulator error:', accErr.message);

            totalTokens += itemTokens;
            totalUsd += costUsd;
            totalBrl += costBrl;
            lastOwnerId = ownerId;

            results.push({
                ok: true,
                workflow_id: workflowId,
                owner_id: ownerId,
                model: model || 'unknown',
                price_fallback: priceFallback,
                tokens: { prompt: promptTokens, completion: completionTokens, total: itemTokens },
                cost_usd: Number(costUsd.toFixed(6)),
                cost_brl: Number(costBrl.toFixed(6)),
            });
        }

        // Consumo do mês corrente do tenant, separado por origem (monitoramento)
        let monthly: any = null;
        if (lastOwnerId) {
            const monthStart = new Date();
            monthStart.setUTCDate(1);
            monthStart.setUTCHours(0, 0, 0, 0);
            const { data: monthRows } = await supabase
                .from('token_usage_log')
                .select('source, total_tokens, cost_usd, cost_brl')
                .eq('owner_id', lastOwnerId)
                .gte('created_at', monthStart.toISOString());
            if (monthRows) {
                const agg = (src: string) => {
                    const rows = monthRows.filter((r: any) =>
                        src === 'n8n' ? r.source === 'n8n' : r.source !== 'n8n');
                    return {
                        tokens: rows.reduce((s: number, r: any) => s + (r.total_tokens || 0), 0),
                        cost_usd: Number(rows.reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0).toFixed(6)),
                        cost_brl: Number(rows.reduce((s: number, r: any) => s + Number(r.cost_brl || 0), 0).toFixed(6)),
                    };
                };
                monthly = { owner_id: lastOwnerId, ia_n8n: agg('n8n'), ia_sistema: agg('system') };
            }
        }

        return json({
            success: true,
            exchange_rate: { usd_brl: rate, source: rateSource },
            processed: results,
            totals: {
                tokens: totalTokens,
                cost_usd: Number(totalUsd.toFixed(6)),
                cost_brl: Number(totalBrl.toFixed(6)),
            },
            current_month: monthly,
        });
    } catch (error: any) {
        console.error('[api-token-usage] Error:', error);
        return json({ success: false, error: error.message }, 500);
    }
});
