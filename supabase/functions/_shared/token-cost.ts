// Fonte única do cálculo de custo de tokens de LLM.
//
// Regra de negócio (decidida pelo user em 21/09/2026):
//   provider_cost_usd = custo estimado do provedor (OpenAI/Google)
//   cost_usd          = provider_cost_usd * (1 + markup)   <- é o que o cliente vê
//
// O provedor cobra o input CACHEADO num preço próprio (~10% do input normal na
// família gpt-5.x, 50% no gpt-4o). O agente do n8n reenvia o prompt inteiro a
// cada passo de tool-call, então quase todo o input é cache hit — ignorar isso
// inflava o custo em 1,8x a 3,5x acima da fatura real.
//
// Quando o provedor não informa os tokens cacheados (o n8n nunca informa),
// estimamos por cache_ratio: medido por modelo na Usage API (llm_cache_calibration)
// ou, na falta, llm_model_prices.default_cache_ratio.

/** Abaixo disso o provedor não cacheia nada (regra da OpenAI). */
export const MIN_CACHEABLE_PROMPT_TOKENS = 1024;

export const DEFAULT_MARKUP = 0.25;
export const DEFAULT_CACHE_RATIO = 0.6;

/**
 * gpt-5.4-mini dobra o preço de entrada (e 1,5x o de saída) acima de ~270k
 * tokens de input numa única chamada. Ainda não tratamos o preço; só avisamos
 * quando um tenant se aproxima do limite.
 */
export const HIGH_VOLUME_PROMPT_TOKENS = 200_000;

export interface ModelPrice {
    /** Nome já normalizado. */
    model: string;
    /** USD por 1M de tokens de input não cacheado. */
    input: number;
    /** USD por 1M de tokens de output. */
    output: number;
    /** USD por 1M de tokens de input cacheado. null = sem preço cadastrado. */
    cachedInput: number | null;
    /** Markup global do modelo. */
    markup: number;
    /** Cache ratio usado quando não há calibração. */
    defaultCacheRatio: number;
}

export interface TokenCostInput {
    promptTokens: number;
    completionTokens: number;
    /** Tokens cacheados informados pelo provedor. null/0 = não informado. */
    reportedCachedTokens?: number | null;
    price: ModelPrice;
    /** Cache ratio medido na Usage API para este modelo. null = usa o default do preço. */
    calibratedCacheRatio?: number | null;
    /** Markup da conta (profiles.markup). null = usa o do modelo. */
    markupOverride?: number | null;
    /** false quando a conta usa chave própria do provedor: registra consumo, não cobra margem. */
    billable?: boolean;
    /** Quantas chamadas ao provedor esta linha agrega. */
    calls?: number;
}

export interface TokenCostResult {
    cachedTokens: number;
    freshPromptTokens: number;
    cacheRatioApplied: number;
    cachedTokensSource: "reported" | "estimated" | "none";
    tokensEstimated: boolean;
    providerCostUsd: number;
    costUsd: number;
    markupApplied: number;
    warnings: string[];
}

/**
 * Normaliza o nome do modelo para casar com llm_model_prices / llm_cache_calibration.
 * NUNCA usar para montar usage_key — a chave de idempotência é o texto cru do n8n.
 */
export function normalizeModelName(model: string | null | undefined): string {
    return String(model ?? "")
        .toLowerCase()
        .trim()
        .replace(/^models\//, "")
        .replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

/**
 * Tokens de prompt servidos pelo cache do provedor, quando informados.
 * Cada SDK batiza esse campo de um jeito (OpenAI: prompt_tokens_details.cached_tokens;
 * LangChain: promptTokensDetails.cachedTokens; Gemini: cachedContentTokenCount) e o
 * n8n repassa o objeto cru — então varremos todos os apelidos conhecidos.
 */
export function readReportedCachedTokens(usage: Record<string, any> | null | undefined): number {
    const candidates = [
        usage?.cachedTokens,
        usage?.cached_tokens,
        usage?.cachedContentTokenCount,
        usage?.promptTokensDetails?.cachedTokens,
        usage?.prompt_tokens_details?.cached_tokens,
        usage?.inputTokensDetails?.cachedTokens,
        usage?.input_tokens_details?.cached_tokens,
    ];
    for (const value of candidates) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return 0;
}

/**
 * Fração do prompt tratada como cacheada.
 * Sem preço de cache cadastrado → 0 (regra do user: não inventar desconto).
 * Prompt abaixo do mínimo cacheável → 0.
 */
export function resolveCacheRatio(
    promptTokens: number,
    price: ModelPrice,
    calibratedCacheRatio?: number | null,
): number {
    if (price.cachedInput === null || price.cachedInput === undefined) return 0;
    if (promptTokens < MIN_CACHEABLE_PROMPT_TOKENS) return 0;
    const calibrated = typeof calibratedCacheRatio === "number" && Number.isFinite(calibratedCacheRatio)
        ? calibratedCacheRatio
        : null;
    const ratio = calibrated ?? price.defaultCacheRatio ?? DEFAULT_CACHE_RATIO;
    if (!Number.isFinite(ratio) || ratio <= 0) return 0;
    return Math.min(Math.max(ratio, 0), 1);
}

export function computeTokenCost(input: TokenCostInput): TokenCostResult {
    const warnings: string[] = [];
    const promptTokens = Math.max(0, Math.round(input.promptTokens || 0));
    const completionTokens = Math.max(0, Math.round(input.completionTokens || 0));
    const price = input.price;
    const calls = Math.max(1, Math.round(input.calls || 1));
    const billable = input.billable !== false;

    const reported = Math.max(0, Math.round(input.reportedCachedTokens || 0));
    const cacheRatio = resolveCacheRatio(promptTokens, price, input.calibratedCacheRatio);

    let cachedTokens: number;
    let cachedTokensSource: TokenCostResult["cachedTokensSource"];
    let tokensEstimated: boolean;

    if (reported > 0) {
        cachedTokens = Math.min(reported, promptTokens);
        cachedTokensSource = "reported";
        tokensEstimated = false;
    } else {
        cachedTokens = Math.min(Math.round(promptTokens * cacheRatio), promptTokens);
        cachedTokensSource = cachedTokens > 0 ? "estimated" : "none";
        tokensEstimated = cachedTokens > 0;
    }

    const freshPromptTokens = promptTokens - cachedTokens;
    const cachedPrice = price.cachedInput ?? price.input;

    const providerCostUsd = (
        freshPromptTokens * price.input
        + cachedTokens * cachedPrice
        + completionTokens * price.output
    ) / 1_000_000;

    const override = typeof input.markupOverride === "number" && Number.isFinite(input.markupOverride)
        ? input.markupOverride
        : null;
    const markupApplied = billable
        ? (override ?? (Number.isFinite(price.markup) ? price.markup : DEFAULT_MARKUP))
        : 0;

    const costUsd = providerCostUsd * (1 + markupApplied);

    const promptPerCall = promptTokens / calls;
    if (promptPerCall > HIGH_VOLUME_PROMPT_TOKENS) {
        warnings.push(
            `prompt de ${Math.round(promptPerCall)} tokens por chamada no modelo ${price.model}: `
            + `acima de ~270k o provedor dobra o preço de entrada (limite de alerta: ${HIGH_VOLUME_PROMPT_TOKENS})`,
        );
    }

    return {
        cachedTokens,
        freshPromptTokens,
        cacheRatioApplied: promptTokens > 0 ? cachedTokens / promptTokens : 0,
        cachedTokensSource,
        tokensEstimated,
        providerCostUsd,
        costUsd,
        markupApplied,
        warnings,
    };
}
