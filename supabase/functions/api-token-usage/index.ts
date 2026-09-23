// API de consumo de tokens do n8n (x-api-key = SCHEDULING_API_KEY)
//
// O n8n chama esta função a cada requisição da IA com o JSON de usage:
// [{ id: "<workflow_id>", name, execution_id, usage_key,
//    tokenUsage: { model, tokenUsage: { completionTokens, promptTokens, totalTokens,
//                                       promptTokensDetails: { cachedTokens } } } }]
//
// Fluxo por item:
//   1. Resolve o tenant pelo workflow_id (cada user tem workflow próprio):
//      instances.workflow_code → instances.workflow_id → ia_config.workflow_id
//   2. Preço USD por modelo via tabela llm_model_prices (editável no banco).
//      O input CACHEADO tem preço próprio (cached_input_usd_per_1m, ~10% do
//      input normal): o agente do n8n reenvia o prompt inteiro a cada passo de
//      tool-call, e é o cache que torna isso barato na fatura real. Como o n8n
//      NUNCA informa os tokens cacheados, eles são estimados por cache_ratio
//      (llm_cache_calibration, medido na Usage API; fallback default_cache_ratio).
//   3. Aplica a margem de revenda: cost_usd = provider_cost_usd * (1 + markup).
//      markup = profiles.markup ?? llm_platform_settings.default_markup (0 se a
//      conta usa chave própria do provedor: registra consumo, não cobra margem).
//   4. Converte para BRL com cotação real (AwesomeAPI USD-BRL; fallback última
//      cotação usada no log; fallback final 5.50)
//   5. Insere token_usage_log (source 'n8n', function_name 'n8n') e soma nos
//      acumuladores do tenant (profiles.tokens_total/monthly + custos)
//
// Idempotência: quando o item traz `usage_key` (montado pelo Code node do n8n
// sobre o payload já agregado), uma chave repetida NÃO grava nem soma de novo —
// o item volta com duplicate: true. Payloads sem usage_key gravam como antes.
//
// Resposta inclui o consumo do mês corrente do tenant separado por origem
// (n8n vs sistema) para monitoramento.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
    apiError,
    dbErrorResponse,
    describeDbError,
    requireApiKey,
    unexpectedErrorResponse,
} from '../_shared/api-errors.ts';
import { setIncidentComponent } from '../_shared/report-incident.ts';
import {
    computeTokenCost,
    DEFAULT_CACHE_RATIO,
    DEFAULT_MARKUP,
    type ModelPrice,
    normalizeModelName,
    readReportedCachedTokens,
} from '../_shared/token-cost.ts';

setIncidentComponent('api-token-usage');

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
const UNIQUE_VIOLATION = '23505';

interface UsageItem {
    id?: string;                 // workflow_id
    workflow_id?: string;        // alternativa explícita
    name?: string;
    execution_id?: number | string;
    /** Chave de idempotência montada pelo n8n. Texto cru, NUNCA normalizado. */
    usage_key?: string;
    /** Quantas chamadas ao provedor o item agrega (n8n agrega o loop do agente). */
    calls?: number | string;
    tokenUsage?: {
        model?: string;
        tokenUsage?: Record<string, any>;
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
        const { data, error } = await supabase
            .from('token_usage_log')
            .select('exchange_rate')
            .not('exchange_rate', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        // Cotação é um fallback em cascata: falhar aqui só empurra pro valor fixo,
        // mas o motivo real precisa aparecer no log.
        if (error) console.warn('[api-token-usage]', describeDbError('ler a última cotação USD-BRL registrada em token_usage_log', error));
        const last = parseFloat(data?.exchange_rate);
        if (Number.isFinite(last) && last > 0) return { rate: last, source: 'last_used' };
    } catch (e) {
        console.warn('[api-token-usage]', describeDbError('ler a última cotação USD-BRL registrada em token_usage_log', e));
    }
    // 3) Fixo
    return { rate: FALLBACK_RATE, source: 'fixed_fallback' };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // Leitura manual do corpo (não dá pra usar readJsonBody: o n8n manda um
        // ARRAY de itens de usage, que o helper recusa por não ser objeto).
        const rawText = await req.text();
        if (!rawText.trim()) {
            return apiError(corsHeaders, {
                status: 400,
                code: 'body_empty',
                message: 'Corpo da requisição vazio. Envie o JSON de usage do n8n: um array [{ id: "<workflow_id>", execution_id, tokenUsage: { model, tokenUsage: { promptTokens, completionTokens, totalTokens } } }].',
            });
        }
        let raw: any;
        try {
            raw = JSON.parse(rawText);
        } catch (err) {
            return apiError(corsHeaders, {
                status: 400,
                code: 'body_invalid_json',
                message: 'O corpo da requisição não é um JSON válido. Envie o array de itens de usage do n8n.',
                details: `${String((err as Error)?.message ?? err)} | recebido: ${rawText.slice(0, 200)}`,
            });
        }

        const items: UsageItem[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : [raw]);
        if (!items.length) {
            return apiError(corsHeaders, {
                status: 400,
                code: 'empty_payload',
                message: 'Nenhum item de consumo no corpo da requisição: o array veio vazio. Envie ao menos um item com workflow id e tokenUsage.',
            });
        }

        // Avisos de falhas NÃO fatais (margem padrão, acumulador, consumo do mês):
        // o consumo já foi registrado, então a resposta segue 200 — mas o motivo
        // aparece aqui.
        const warnings: string[] = [];

        // Tabela de preços (uma leitura por chamada)
        const { data: priceRows, error: priceErr } = await supabase
            .from('llm_model_prices')
            .select('model, input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m, default_cache_ratio');
        if (priceErr) {
            return dbErrorResponse(corsHeaders, 'llm_model_prices_read_failed',
                'carregar a tabela de preços llm_model_prices, necessária para calcular o custo dos tokens', priceErr, req);
        }
        const prices = new Map<string, ModelPrice>();
        for (const p of priceRows ?? []) {
            const cached = Number(p.cached_input_usd_per_1m);
            const ratio = Number(p.default_cache_ratio);
            const key = normalizeModelName(p.model);
            prices.set(key, {
                model: key,
                input: Number(p.input_usd_per_1m),
                output: Number(p.output_usd_per_1m),
                // Sem preço de cache cadastrado o cache_ratio é forçado a 0: o token
                // cacheado é cobrado como input normal (não inventa desconto que o
                // provedor pode não dar).
                cachedInput: Number.isFinite(cached) && cached >= 0 ? cached : null,
                defaultCacheRatio: Number.isFinite(ratio) ? ratio : DEFAULT_CACHE_RATIO,
            });
        }

        // Margem padrão da plataforma: usada quando a conta não tem markup próprio.
        // Fonte ÚNICA desde 22/09/2026 (`llm_model_prices.markup` foi apagado).
        let platformMarkup: number | null = null;
        const { data: platformRow, error: platformErr } = await supabase
            .from('llm_platform_settings')
            .select('default_markup')
            .maybeSingle();
        if (platformErr) {
            const w = describeDbError(
                `ler a margem padrão da plataforma (llm_platform_settings.default_markup) — foi aplicado o piso de ${DEFAULT_MARKUP}`,
                platformErr,
            );
            console.warn('[api-token-usage]', w);
            warnings.push(w);
        } else {
            const parsed = Number(platformRow?.default_markup);
            platformMarkup = Number.isFinite(parsed) ? parsed : null;
        }

        // Cache ratio real por modelo (edge fn calibrate-cache-ratio, diária).
        // Sem calibração vale o default_cache_ratio do preço — nunca zera o cache
        // por falta de medição.
        const calibration = new Map<string, number>();
        const { data: calRows, error: calErr } = await supabase
            .from('llm_cache_calibration')
            .select('model, cache_ratio');
        if (calErr) {
            console.warn('[api-token-usage]', describeDbError('ler a calibração de cache (llm_cache_calibration)', calErr));
        }
        for (const c of calRows ?? []) {
            const ratio = Number(c.cache_ratio);
            if (Number.isFinite(ratio)) calibration.set(normalizeModelName(c.model), ratio);
        }

        const { rate, source: rateSource } = await getUsdBrlRate(supabase);

        const results: any[] = [];
        const ownerCache = new Map<string, string | null>();
        const billingCache = new Map<string, { markup: number | null; billable: boolean }>();
        let totalTokens = 0, totalUsd = 0, totalBrl = 0, totalProviderUsd = 0;
        let lastOwnerId: string | null = null;

        for (const item of items) {
            const workflowId = item.workflow_id || item.id || null;
            const usage = item.tokenUsage?.tokenUsage ?? item.tokenUsage ?? {};
            const model = (item.tokenUsage?.model || item.model || '').trim();
            const promptTokens = Number((usage as any).promptTokens) || 0;
            const completionTokens = Number((usage as any).completionTokens) || 0;
            const itemTokens = Number((usage as any).totalTokens) || (promptTokens + completionTokens);
            // promptTokens já INCLUI os cacheados; o cache nunca pode passar do total.
            const reportedCached = Math.min(readReportedCachedTokens(usage as any), promptTokens);
            const calls = Math.max(1, Math.round(Number(item.calls) || 1));
            // Chave de idempotência: texto CRU do n8n, sem normalizar (a normalização
            // vale só para achar o preço do modelo).
            const usageKey = typeof item.usage_key === 'string' && item.usage_key.trim()
                ? item.usage_key.trim()
                : null;

            if (!workflowId) {
                results.push({
                    ok: false,
                    code: 'workflow_id_missing',
                    error: 'Item sem identificação do workflow: nem "id" nem "workflow_id" vieram preenchidos, então não dá para saber de qual conta é o consumo. Envie o código do workflow do n8n em "id".',
                    item: item.name || null,
                });
                continue;
            }
            if (itemTokens <= 0) {
                results.push({
                    ok: false,
                    code: 'no_token_usage',
                    workflow_id: workflowId,
                    error: 'Item sem consumo de tokens: promptTokens, completionTokens e totalTokens vieram zerados ou ausentes. Nada foi registrado para este item.',
                });
                continue;
            }

            // Resolve tenant pelo código do workflow (cache por chamada):
            // instances.workflow_code (gravado pelo n8n) -> instances.workflow_id
            // (legado) -> ia_config.workflow_id (legado)
            let ownerId = ownerCache.get(workflowId);
            // Erro de banco em qualquer elo da cadeia não pode virar "conta não
            // encontrada": o motivo real vai junto da resposta do item.
            let lookupFailure: string | null = null;
            if (ownerId === undefined) {
                const { data: instByCode, error: byCodeErr } = await supabase
                    .from('instances')
                    .select('user_id')
                    .eq('workflow_code', workflowId)
                    .limit(1)
                    .maybeSingle();
                if (byCodeErr) {
                    lookupFailure = describeDbError(`buscar a instância com workflow_code = "${workflowId}"`, byCodeErr);
                }
                ownerId = instByCode?.user_id ?? null;
                if (!ownerId) {
                    const { data: inst, error: byIdErr } = await supabase
                        .from('instances')
                        .select('user_id')
                        .eq('workflow_id', workflowId)
                        .limit(1)
                        .maybeSingle();
                    if (byIdErr) {
                        lookupFailure = describeDbError(`buscar a instância com workflow_id = "${workflowId}" (legado)`, byIdErr);
                    }
                    ownerId = inst?.user_id ?? null;
                }
                if (!ownerId) {
                    const { data: cfg, error: cfgErr } = await supabase
                        .from('ia_config')
                        .select('user_id')
                        .eq('workflow_id', workflowId)
                        .limit(1)
                        .maybeSingle();
                    if (cfgErr) {
                        lookupFailure = describeDbError(`buscar a configuração de IA com workflow_id = "${workflowId}" (legado)`, cfgErr);
                    }
                    ownerId = cfg?.user_id ?? null;
                }
                ownerCache.set(workflowId, ownerId ?? null);
            }
            if (!ownerId) {
                results.push({
                    ok: false,
                    code: lookupFailure ? 'tenant_lookup_failed' : 'tenant_not_found',
                    workflow_id: workflowId,
                    error: lookupFailure
                        ? `${lookupFailure} — sem essa consulta não é possível descobrir de qual conta é o consumo do workflow "${workflowId}".`
                        : `Nenhuma conta está vinculada ao workflow "${workflowId}". A resolução tentou, nesta ordem: instances.workflow_code, instances.workflow_id (legado) e ia_config.workflow_id (legado) — o valor enviado não bate com nenhum registro. Confirme se o n8n gravou instances.workflow_code dessa conta.`,
                });
                continue;
            }

            // Margem da conta: markup próprio (profiles.markup) e se a conta é
            // cobrável. Conta com chave própria do provedor paga direto ao
            // provedor, então registra consumo com markup 0.
            //
            // `billable` é decidido por `openai_key_source`, NUNCA pela presença de
            // `openai_token`: desde o provisionamento por conta, a chave gravada aí
            // é a que a Clinbia criou e paga — decidir pelo token faria justamente
            // a conta cuja fatura é nossa virar `billable = false`.
            let billing = billingCache.get(ownerId);
            if (!billing) {
                const { data: prof, error: profErr } = await supabase
                    .from('profiles')
                    .select('markup, openai_key_source')
                    .eq('id', ownerId)
                    .maybeSingle();
                if (profErr) {
                    const profWarning = describeDbError(
                        `ler a margem da conta ${ownerId} (profiles.markup) — foi aplicada a margem padrão da plataforma`,
                        profErr,
                    );
                    console.warn('[api-token-usage]', profWarning);
                    if (!warnings.includes(profWarning)) warnings.push(profWarning);
                }
                const ownMarkup = Number(prof?.markup);
                billing = {
                    markup: Number.isFinite(ownMarkup) ? ownMarkup : null,
                    billable: prof?.openai_key_source !== 'customer',
                };
                billingCache.set(ownerId, billing);
            }

            // Preço do modelo (fallback: modelo padrão). A normalização vale só aqui.
            const modelKey = normalizeModelName(model);
            const price = prices.get(modelKey) ?? prices.get(FALLBACK_MODEL);
            const priceFallback = !prices.has(modelKey);
            if (priceFallback) {
                // Modelo desconhecido é cobrado com o preço de OUTRO modelo, então o
                // valor sai errado. Antes isso só existia no console: agora aparece
                // na resposta, senão ninguém descobre até comparar com a fatura.
                const fallbackWarning = `Modelo "${model || 'desconhecido'}" não está cadastrado em llm_model_prices: o custo foi calculado com o preço de "${FALLBACK_MODEL}" e NÃO reflete a fatura real do provedor. Cadastre o modelo para corrigir.`;
                console.warn('[api-token-usage]', fallbackWarning);
                if (!warnings.includes(fallbackWarning)) warnings.push(fallbackWarning);
            }
            // Sem preço do modelo E sem o modelo de fallback cadastrado não há como
            // calcular custo — antes isso estourava um TypeError genérico.
            if (!price) {
                results.push({
                    ok: false,
                    code: 'model_price_not_found',
                    workflow_id: workflowId,
                    error: `Não há preço cadastrado para o modelo "${model || 'desconhecido'}" nem para o modelo de fallback "${FALLBACK_MODEL}" na tabela llm_model_prices. Cadastre o modelo (input_usd_per_1m/output_usd_per_1m) para que o consumo possa ser precificado.`,
                });
                continue;
            }

            const cost = computeTokenCost({
                promptTokens,
                completionTokens,
                reportedCachedTokens: reportedCached,
                price,
                calibratedCacheRatio: calibration.get(priceFallback ? FALLBACK_MODEL : modelKey) ?? null,
                markupOverride: billing.markup,
                platformMarkup,
                billable: billing.billable,
                calls,
            });
            const costBrl = cost.costUsd * rate;
            for (const w of cost.warnings) {
                const scoped = `Conta ${ownerId}: ${w}`;
                console.warn('[api-token-usage]', scoped);
                if (!warnings.includes(scoped)) warnings.push(scoped);
            }

            const { error: insErr } = await supabase.from('token_usage_log').insert({
                owner_id: ownerId,
                team_member_id: null,
                function_name: 'n8n',
                source: 'n8n',
                model: model || 'unknown',
                prompt_tokens: promptTokens,
                cached_prompt_tokens: cost.cachedTokens,
                completion_tokens: completionTokens,
                total_tokens: itemTokens,
                provider_cost_usd: cost.providerCostUsd,
                cost_usd: cost.costUsd,
                cost_brl: costBrl,
                markup_applied: cost.markupApplied,
                cache_ratio_applied: cost.cacheRatioApplied,
                cached_tokens_source: cost.cachedTokensSource,
                tokens_estimated: cost.tokensEstimated,
                price_fallback: priceFallback,
                billable: billing.billable,
                calls,
                usage_key: usageKey,
                exchange_rate: rate,
                workflow_id: workflowId,
                execution_id: item.execution_id != null ? Number(item.execution_id) : null,
            });
            if (insErr) {
                // usage_key repetido = o n8n reenviou o mesmo consumo. Não grava nem
                // soma de novo; o item volta como duplicata para o workflow saber.
                if ((insErr as any)?.code === UNIQUE_VIOLATION && usageKey) {
                    results.push({
                        ok: true,
                        duplicate: true,
                        workflow_id: workflowId,
                        owner_id: ownerId,
                        usage_key: usageKey,
                        message: `Consumo com usage_key "${usageKey}" já registrado: nada foi gravado nem somado novamente.`,
                    });
                    continue;
                }
                results.push({
                    ok: false,
                    code: 'token_usage_log_insert_failed',
                    workflow_id: workflowId,
                    error: describeDbError(`gravar o consumo de ${itemTokens} tokens da conta ${ownerId} em token_usage_log`, insErr),
                });
                continue;
            }

            // Soma nos acumuladores do tenant (mesmos contadores da IA do sistema).
            // Falha aqui NÃO invalida o item: o log já foi gravado (fonte dos
            // relatórios) — só os acumuladores de profiles ficam defasados, então
            // vira aviso em vez de erro silencioso no console.
            const { error: accErr } = await supabase.rpc('increment_profile_token_usage', {
                p_owner_id: ownerId,
                p_tokens: itemTokens,
                p_cost_usd: cost.costUsd,
            });
            let accWarning: string | null = null;
            if (accErr) {
                accWarning = describeDbError(
                    `somar ${itemTokens} tokens nos acumuladores da conta ${ownerId} (RPC increment_profile_token_usage) — o consumo foi registrado em token_usage_log, mas profiles.tokens_* ficou defasado`,
                    accErr,
                );
                console.warn('[api-token-usage]', accWarning);
                warnings.push(accWarning);
            }

            totalTokens += itemTokens;
            totalUsd += cost.costUsd;
            totalBrl += costBrl;
            totalProviderUsd += cost.providerCostUsd;
            lastOwnerId = ownerId;

            results.push({
                ok: true,
                workflow_id: workflowId,
                owner_id: ownerId,
                model: model || 'unknown',
                price_fallback: priceFallback,
                tokens: {
                    prompt: promptTokens,
                    prompt_cached: cost.cachedTokens,
                    completion: completionTokens,
                    total: itemTokens,
                },
                cost_usd: Number(cost.costUsd.toFixed(6)),
                cost_brl: Number(costBrl.toFixed(6)),
                provider_cost_usd: Number(cost.providerCostUsd.toFixed(6)),
                markup_applied: cost.markupApplied,
                cache: {
                    ratio: Number(cost.cacheRatioApplied.toFixed(4)),
                    source: cost.cachedTokensSource,
                    estimated: cost.tokensEstimated,
                },
                ...(usageKey ? { usage_key: usageKey } : {}),
                ...(cost.warnings.length ? { warnings: cost.warnings } : {}),
                ...(accWarning ? { warning: accWarning } : {}),
            });
        }

        // Consumo do mês corrente do tenant, separado por origem (monitoramento).
        // Via RPC: o SELECT direto batia no teto de 1000 linhas do PostgREST e o
        // total do mês vinha truncado em contas de volume alto.
        let monthly: any = null;
        if (lastOwnerId) {
            const { data: monthRows, error: monthErr } = await supabase
                .rpc('token_usage_month_summary', { p_owner_id: lastOwnerId });
            // Bloco de monitoramento: falhar aqui não afeta o que foi registrado,
            // então `current_month` volta null com o motivo em `warnings`.
            if (monthErr) {
                const monthWarning = describeDbError(
                    `calcular o consumo do mês corrente da conta ${lastOwnerId} (campo current_month da resposta, RPC token_usage_month_summary)`,
                    monthErr,
                );
                console.warn('[api-token-usage]', monthWarning);
                warnings.push(monthWarning);
            }
            if (monthRows) {
                const agg = (src: 'n8n' | 'system') => {
                    const rows = (monthRows as any[]).filter((r) =>
                        src === 'n8n' ? r.source === 'n8n' : r.source !== 'n8n');
                    const sum = (f: string) => rows.reduce((s: number, r: any) => s + Number(r[f] || 0), 0);
                    return {
                        tokens: sum('total_tokens'),
                        cost_usd: Number(sum('cost_usd').toFixed(6)),
                        cost_brl: Number(sum('cost_brl').toFixed(6)),
                        provider_cost_usd: Number(sum('provider_cost_usd').toFixed(6)),
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
                provider_cost_usd: Number(totalProviderUsd.toFixed(6)),
            },
            current_month: monthly,
            ...(warnings.length ? { warnings } : {}),
        });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders,
            'Falha inesperada na API de consumo de tokens do n8n (api-token-usage)', error, req);
    }
});
