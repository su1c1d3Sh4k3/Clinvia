// API de consumo de tokens do ambiente de teste (x-api-key = SCHEDULING_API_KEY)
//
// Gêmea de `api-token-usage`. Duas diferenças, ambas decisão do cliente:
//   1. O tenant vem do `user_id` do corpo (o fluxo -sandbox é único e repassa o
//      user_id do payload), não do workflow_id.
//   2. O consumo é gravado em `sandbox_token_usage` — NUNCA em token_usage_log
//      nem nos acumuladores de `profiles`: gasto de teste não entra na fatura
//      do cliente nem no relatório de consumo da conta.
//
// Corpo aceito (mesmo formato do n8n, com o user_id junto):
//   { user_id, items: [...] } | { user_id, ...item } | [{ user_id, ... }]

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
    apiError,
    dbErrorResponse,
    describeDbError,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";
import { loadSandboxContext, logSandboxCall, SandboxContext } from "../_shared/sandbox.ts";
import {
    computeTokenCost,
    DEFAULT_CACHE_RATIO,
    DEFAULT_MARKUP,
    type ModelPrice,
    normalizeModelName,
    readReportedCachedTokens,
} from "../_shared/token-cost.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

const FALLBACK_RATE = 5.50;
const FALLBACK_MODEL = "gpt-5.4-mini";

interface UsageItem {
    id?: string;
    workflow_id?: string;
    name?: string;
    execution_id?: number | string;
    user_id?: string;
    conversation_id?: string;
    tokenUsage?: {
        model?: string;
        tokenUsage?: { completionTokens?: number; promptTokens?: number; totalTokens?: number };
        completionTokens?: number;
        promptTokens?: number;
        totalTokens?: number;
    };
    model?: string;
}

async function getUsdBrlRate(supabase: any): Promise<{ rate: number; source: string }> {
    try {
        const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
            signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
            const data = await res.json();
            const bid = parseFloat(data?.USDBRL?.bid);
            if (Number.isFinite(bid) && bid > 0) return { rate: bid, source: "awesomeapi" };
        }
    } catch (e) {
        console.warn("[api-token-usage-sandbox] AwesomeAPI failed:", (e as Error).message);
    }
    // Última cotação já usada (produção serve de referência; é só leitura)
    try {
        const { data, error } = await supabase
            .from("token_usage_log")
            .select("exchange_rate")
            .not("exchange_rate", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) {
            console.warn("[api-token-usage-sandbox]",
                describeDbError("ler a última cotação USD-BRL registrada", error));
        }
        const last = parseFloat(data?.exchange_rate);
        if (Number.isFinite(last) && last > 0) return { rate: last, source: "last_used" };
    } catch (e) {
        console.warn("[api-token-usage-sandbox]",
            describeDbError("ler a última cotação USD-BRL registrada", e));
    }
    return { rate: FALLBACK_RATE, source: "fixed_fallback" };
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { auth: { autoRefreshToken: false, persistSession: false } },
        );

        // O n8n manda um ARRAY de itens de usage — readJsonBody recusaria.
        const rawText = await req.text();
        if (!rawText.trim()) {
            return apiError(corsHeaders, {
                status: 400,
                code: "body_empty",
                message: "Corpo da requisição vazio. Envie o JSON de usage do fluxo de teste: { user_id, items: [{ execution_id, tokenUsage: { model, tokenUsage: { promptTokens, completionTokens, totalTokens } } }] }.",
            });
        }
        let raw: any;
        try {
            raw = JSON.parse(rawText);
        } catch (err) {
            return apiError(corsHeaders, {
                status: 400,
                code: "body_invalid_json",
                message: "O corpo da requisição não é um JSON válido. Envie o array de itens de usage do fluxo de teste.",
                details: `${String((err as Error)?.message ?? err)} | recebido: ${rawText.slice(0, 200)}`,
            });
        }

        const items: UsageItem[] = Array.isArray(raw)
            ? raw
            : (Array.isArray(raw?.items) ? raw.items : [raw]);
        if (!items.length) {
            return apiError(corsHeaders, {
                status: 400,
                code: "empty_payload",
                message: "Nenhum item de consumo no corpo da requisição: o array veio vazio. Envie ao menos um item com tokenUsage.",
            });
        }

        // Tenant do ambiente de teste: user_id do corpo (raiz ou primeiro item).
        const rootUserId = !Array.isArray(raw) ? (raw?.user_id ?? null) : null;
        const rootConversationId = !Array.isArray(raw) ? (raw?.conversation_id ?? null) : null;
        const userId = rootUserId || items.find((i) => i.user_id)?.user_id || null;
        const conversationId = rootConversationId || items.find((i) => i.conversation_id)?.conversation_id || null;

        if (!userId && !conversationId) {
            return apiError(corsHeaders, {
                status: 400,
                code: "sandbox_context_missing",
                message: "Informe o user_id (ou conversation_id) do ambiente de teste no corpo da requisição — é por ele que o consumo é atribuído à conta certa.",
            });
        }

        const ctx: SandboxContext = await loadSandboxContext(supabase, { userId, conversationId });

        const { data: priceRows, error: priceErr } = await supabase
            .from("llm_model_prices")
            .select("model, input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m, default_cache_ratio");
        if (priceErr) {
            return dbErrorResponse(corsHeaders, "llm_model_prices_read_failed",
                "carregar a tabela de preços llm_model_prices, necessária para calcular o custo dos tokens", priceErr, req);
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
                cachedInput: Number.isFinite(cached) && cached >= 0 ? cached : null,
                defaultCacheRatio: Number.isFinite(ratio) ? ratio : DEFAULT_CACHE_RATIO,
            });
        }

        // Margem padrão da plataforma (fonte única da margem junto com
        // profiles.markup): o teste tem que precificar igual à produção.
        const { data: platformRow, error: platformErr } = await supabase
            .from("llm_platform_settings")
            .select("default_markup")
            .maybeSingle();
        if (platformErr) {
            console.warn("[api-token-usage-sandbox]", describeDbError(
                `ler a margem padrão da plataforma (llm_platform_settings.default_markup) — foi aplicado o piso de ${DEFAULT_MARKUP}`,
                platformErr,
            ));
        }
        const parsedPlatformMarkup = Number(platformRow?.default_markup);
        const platformMarkup = Number.isFinite(parsedPlatformMarkup) ? parsedPlatformMarkup : null;

        // Mesma estimativa de cache da produção: o teste tem que mostrar o mesmo
        // custo que a conversa real mostraria.
        const calibration = new Map<string, number>();
        const { data: calRows, error: calErr } = await supabase
            .from("llm_cache_calibration")
            .select("model, cache_ratio");
        if (calErr) {
            console.warn("[api-token-usage-sandbox]", describeDbError("ler a calibração de cache (llm_cache_calibration)", calErr));
        }
        for (const c of calRows ?? []) {
            const ratio = Number(c.cache_ratio);
            if (Number.isFinite(ratio)) calibration.set(normalizeModelName(c.model), ratio);
        }

        const { data: prof, error: profErr } = await supabase
            .from("profiles")
            .select("markup, openai_key_source")
            .eq("id", ctx.userId)
            .maybeSingle();
        if (profErr) {
            console.warn("[api-token-usage-sandbox]", describeDbError(`ler a margem da conta ${ctx.userId} (profiles.markup)`, profErr));
        }
        const ownMarkup = Number(prof?.markup);
        const markupOverride = Number.isFinite(ownMarkup) ? ownMarkup : null;
        // `billable` por `openai_key_source`, não pela presença do token: a chave
        // provisionada pela plataforma mora em `openai_token` e a fatura dela é nossa.
        const billable = prof?.openai_key_source !== "customer";

        const { rate, source: rateSource } = await getUsdBrlRate(supabase);

        const results: any[] = [];
        let totalTokens = 0, totalUsd = 0, totalBrl = 0;

        for (const item of items) {
            const usage = item.tokenUsage?.tokenUsage ?? item.tokenUsage ?? {};
            const model = (item.tokenUsage?.model || item.model || "").trim();
            const promptTokens = Number((usage as any).promptTokens) || 0;
            const completionTokens = Number((usage as any).completionTokens) || 0;
            const itemTokens = Number((usage as any).totalTokens) || (promptTokens + completionTokens);

            if (itemTokens <= 0) {
                results.push({
                    ok: false,
                    code: "no_token_usage",
                    error: "Item sem consumo de tokens: promptTokens, completionTokens e totalTokens vieram zerados ou ausentes. Nada foi registrado para este item.",
                });
                continue;
            }

            const modelKey = normalizeModelName(model);
            const price = prices.get(modelKey) ?? prices.get(FALLBACK_MODEL);
            const priceFallback = !prices.has(modelKey);
            if (!price) {
                results.push({
                    ok: false,
                    code: "model_price_not_found",
                    error: `Não há preço cadastrado para o modelo "${model || "desconhecido"}" nem para o modelo de fallback "${FALLBACK_MODEL}" na tabela llm_model_prices. Cadastre o modelo (input_usd_per_1m/output_usd_per_1m) para que o consumo do teste possa ser precificado.`,
                });
                continue;
            }

            // Mesma fórmula da produção (cache estimado + margem de revenda),
            // gravada nas colunas que sandbox_token_usage já tem.
            const cost = computeTokenCost({
                promptTokens,
                completionTokens,
                reportedCachedTokens: readReportedCachedTokens(usage as any),
                price,
                calibratedCacheRatio: calibration.get(priceFallback ? FALLBACK_MODEL : modelKey) ?? null,
                markupOverride,
                platformMarkup,
                billable,
            });
            const costUsd = cost.costUsd;
            const costBrl = costUsd * rate;

            const { error: insErr } = await supabase.from("sandbox_token_usage").insert({
                session_id: ctx.session.id,
                user_id: ctx.userId,
                model: model || "unknown",
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: itemTokens,
                cost_usd: costUsd,
                cost_brl: costBrl,
                exchange_rate: rate,
                workflow_id: item.workflow_id || item.id || null,
                execution_id: item.execution_id != null ? String(item.execution_id) : null,
            });
            if (insErr) {
                results.push({
                    ok: false,
                    code: "sandbox_token_usage_insert_failed",
                    error: describeDbError(
                        `gravar o consumo de ${itemTokens} tokens do ambiente de teste da conta ${ctx.userId}`, insErr),
                });
                continue;
            }

            totalTokens += itemTokens;
            totalUsd += costUsd;
            totalBrl += costBrl;

            results.push({
                ok: true,
                owner_id: ctx.userId,
                model: model || "unknown",
                price_fallback: priceFallback,
                tokens: { prompt: promptTokens, completion: completionTokens, total: itemTokens },
                cost_usd: Number(costUsd.toFixed(6)),
                cost_brl: Number(costBrl.toFixed(6)),
            });
        }

        // Total já consumido nesta sessão de teste (é o contador do topo da tela)
        const { data: sessionRows } = await supabase
            .from("sandbox_token_usage")
            .select("prompt_tokens, completion_tokens, total_tokens, cost_brl")
            .eq("session_id", ctx.session.id);
        const sessionTotals = (sessionRows || []).reduce(
            (acc: any, r: any) => ({
                prompt: acc.prompt + (r.prompt_tokens || 0),
                completion: acc.completion + (r.completion_tokens || 0),
                total: acc.total + (r.total_tokens || 0),
                cost_brl: acc.cost_brl + Number(r.cost_brl || 0),
            }),
            { prompt: 0, completion: 0, total: 0, cost_brl: 0 },
        );

        if (totalTokens > 0) {
            await logSandboxCall(supabase, ctx, {
                function_name: "api-token-usage-sandbox",
                label: `Consumiu ${totalTokens} tokens (R$ ${totalBrl.toFixed(4)}) nesta resposta`,
                request: { items: items.length },
            });
        }

        return json({
            success: true,
            sandbox: true,
            exchange_rate: { usd_brl: rate, source: rateSource },
            processed: results,
            totals: {
                tokens: totalTokens,
                cost_usd: Number(totalUsd.toFixed(6)),
                cost_brl: Number(totalBrl.toFixed(6)),
            },
            session_totals: {
                prompt_tokens: sessionTotals.prompt,
                completion_tokens: sessionTotals.completion,
                total_tokens: sessionTotals.total,
                cost_brl: Number(sessionTotals.cost_brl.toFixed(6)),
            },
        });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders,
            "Falha inesperada na API de consumo de tokens do ambiente de teste (api-token-usage-sandbox)", error, req);
    }
});
