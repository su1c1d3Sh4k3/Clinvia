// Calibração do cache ratio por modelo (roda 1x/dia por pg_cron).
//
// O n8n nunca informa quantos tokens do prompt foram servidos pelo cache do
// provedor, então a api-token-usage estima por cache_ratio. Esta função mede o
// ratio REAL na Usage API da OpenAI e grava em llm_cache_calibration:
//
//   cache_ratio = sum(input_cached_tokens) / sum(input_tokens)
//
// (input_tokens da Usage API já INCLUI os cacheados — mesma semântica do
// promptTokens que o n8n manda.)
//
// Também guarda o uso diário bruto em llm_provider_usage_daily, que é o que
// permite comparar provider_cost_usd com a fatura real.
//
// Requer o secret OPENAI_ADMIN_KEY (chave de admin da organização; a chave de
// projeto NÃO tem acesso a /v1/organization/usage). Sem o secret a função
// responde com aviso e NÃO zera a calibração existente.
//
// Gemini não tem endpoint equivalente: fica no default_cache_ratio do preço.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { serveMonitored } from "../_shared/serve-monitored.ts";
import { apiError, describeDbError, unexpectedErrorResponse } from '../_shared/api-errors.ts';
import { normalizeModelName } from '../_shared/token-cost.ts';
import { fetchProvider } from "../_shared/provider-errors.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const USAGE_URL = 'https://api.openai.com/v1/organization/usage/completions';
const DEFAULT_DAYS = 7;
/** A Usage API devolve no máximo 31 baldes diários por página. */
const MAX_BUCKETS_PER_PAGE = 31;

interface UsageBucketResult {
    model?: string | null;
    input_tokens?: number;
    input_cached_tokens?: number;
    output_tokens?: number;
    num_model_requests?: number;
}

interface UsageBucket {
    start_time: number;
    end_time: number;
    results?: UsageBucketResult[];
}

function dayFromUnix(seconds: number): string {
    return new Date(seconds * 1000).toISOString().slice(0, 10);
}

async function fetchUsage(apiKey: string, startTime: number, endTime: number) {
    const buckets: UsageBucket[] = [];
    let page: string | null = null;
    let guard = 0;

    do {
        const url = new URL(USAGE_URL);
        url.searchParams.set('start_time', String(startTime));
        url.searchParams.set('end_time', String(endTime));
        url.searchParams.set('bucket_width', '1d');
        url.searchParams.append('group_by[]', 'model');
        url.searchParams.set('limit', String(MAX_BUCKETS_PER_PAGE));
        if (page) url.searchParams.set('page', page);

        const res = await fetchProvider(url.toString(), {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Usage API respondeu ${res.status}: ${body.slice(0, 400)}`);
        }
        const payload = await res.json();
        for (const b of payload?.data ?? []) buckets.push(b as UsageBucket);
        page = payload?.has_more ? (payload?.next_page ?? null) : null;
        guard += 1;
    } while (page && guard < 20);

    return buckets;
}

serveMonitored("calibrate-cache-ratio", async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            { auth: { autoRefreshToken: false, persistSession: false } },
        );

        let body: any = {};
        try {
            const text = await req.text();
            if (text.trim()) body = JSON.parse(text);
        } catch {
            body = {};
        }

        const apiKey = Deno.env.get('OPENAI_ADMIN_KEY');
        if (!apiKey) {
            // Sem a chave a calibração anterior continua valendo: NUNCA zerar o
            // cache_ratio por falta de medição (zerar inflaria o custo de todo mundo).
            const message = 'Secret OPENAI_ADMIN_KEY não configurado nesta função: a calibração do cache ratio não pôde ser medida. A calibração anterior (ou o default_cache_ratio de llm_model_prices) continua valendo. Crie uma Admin Key da organização na OpenAI e configure o secret para ativar a medição.';
            console.warn('[calibrate-cache-ratio]', message);
            return apiError(corsHeaders, { status: 503, code: 'openai_admin_key_missing', message });
        }

        // Janela: por padrão os últimos 7 dias completos. Aceita override explícito
        // (usado para comparar um período fechado com a fatura).
        const days = Math.max(1, Math.min(Number(body?.days) || DEFAULT_DAYS, 180));
        const nowSec = Math.floor(Date.now() / 1000);
        const endTime = Number(body?.end_time) || nowSec;
        const startTime = Number(body?.start_time) || (endTime - days * 86400);
        const persistCalibration = body?.persist_calibration !== false;

        let buckets: UsageBucket[];
        try {
            buckets = await fetchUsage(apiKey, startTime, endTime);
        } catch (err) {
            const message = `Falha ao consultar a Usage API da OpenAI: ${String((err as Error)?.message ?? err)}. A calibração anterior continua valendo — nada foi sobrescrito.`;
            console.error('[calibrate-cache-ratio]', message);
            return apiError(corsHeaders, { status: 502, code: 'openai_usage_api_failed', message });
        }

        // Agrega por modelo (calibração) e por dia+modelo (histórico p/ fatura)
        const byModel = new Map<string, { input: number; cached: number; output: number; requests: number }>();
        const daily = new Map<string, {
            day: string; model: string; input: number; cached: number; output: number; requests: number;
        }>();

        for (const bucket of buckets) {
            const day = dayFromUnix(bucket.start_time);
            for (const r of bucket.results ?? []) {
                const model = normalizeModelName(r.model);
                if (!model) continue;
                const input = Number(r.input_tokens) || 0;
                const cached = Number(r.input_cached_tokens) || 0;
                const output = Number(r.output_tokens) || 0;
                const requests = Number(r.num_model_requests) || 0;

                const m = byModel.get(model) ?? { input: 0, cached: 0, output: 0, requests: 0 };
                m.input += input; m.cached += cached; m.output += output; m.requests += requests;
                byModel.set(model, m);

                const key = `${day}|${model}`;
                const d = daily.get(key) ?? { day, model, input: 0, cached: 0, output: 0, requests: 0 };
                d.input += input; d.cached += cached; d.output += output; d.requests += requests;
                daily.set(key, d);
            }
        }

        const warnings: string[] = [];

        // Histórico diário (sempre gravado: é o lastro da comparação com a fatura)
        if (daily.size) {
            const rows = [...daily.values()].map((d) => ({
                day: d.day,
                model: d.model,
                input_tokens: d.input,
                input_cached_tokens: d.cached,
                output_tokens: d.output,
                num_requests: d.requests,
                source: 'openai_usage_api',
                updated_at: new Date().toISOString(),
            }));
            const { error } = await supabase
                .from('llm_provider_usage_daily')
                .upsert(rows, { onConflict: 'day,model,source' });
            if (error) {
                const w = describeDbError('gravar o uso diário do provedor em llm_provider_usage_daily', error);
                console.warn('[calibrate-cache-ratio]', w);
                warnings.push(w);
            }
        }

        // Calibração por modelo
        const calibrated: any[] = [];
        for (const [model, m] of byModel) {
            if (m.input <= 0) {
                warnings.push(`Modelo "${model}" não teve tokens de entrada no período: cache ratio não recalculado (a calibração anterior continua valendo).`);
                continue;
            }
            const ratio = Math.min(Math.max(m.cached / m.input, 0), 1);
            calibrated.push({
                model,
                cache_ratio: Number(ratio.toFixed(4)),
                input_tokens: m.input,
                cached_tokens: m.cached,
                requests: m.requests,
            });
        }

        if (persistCalibration && calibrated.length) {
            const { error } = await supabase.from('llm_cache_calibration').upsert(
                calibrated.map((c) => ({
                    model: c.model,
                    cache_ratio: c.cache_ratio,
                    sample_input_tokens: c.input_tokens,
                    period_start: dayFromUnix(startTime),
                    period_end: dayFromUnix(endTime),
                    source: 'openai_usage_api',
                    updated_at: new Date().toISOString(),
                })),
                { onConflict: 'model' },
            );
            if (error) {
                const w = describeDbError('gravar a calibração de cache em llm_cache_calibration', error);
                console.error('[calibrate-cache-ratio]', w);
                warnings.push(w);
            }
        }

        return json({
            success: true,
            period: { start: dayFromUnix(startTime), end: dayFromUnix(endTime), days },
            buckets: buckets.length,
            persisted: persistCalibration,
            calibrated,
            daily: [...daily.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
            ...(warnings.length ? { warnings } : {}),
        });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders,
            'Falha inesperada na calibração do cache ratio (calibrate-cache-ratio)', error, req);
    }
});
