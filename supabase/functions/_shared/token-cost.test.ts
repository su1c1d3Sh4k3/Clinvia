// deno test --allow-none supabase/functions/_shared/token-cost.test.ts
import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
    computeTokenCost,
    type ModelPrice,
    normalizeModelName,
    resolveCacheRatio,
} from "./token-cost.ts";

const MINI: ModelPrice = {
    model: "gpt-5.4-mini",
    input: 0.75,
    output: 4.5,
    cachedInput: 0.075,
    defaultCacheRatio: 0.6,
};

const SEM_CACHE: ModelPrice = {
    model: "modelo-sem-cache",
    input: 2,
    output: 8,
    cachedInput: null,
    defaultCacheRatio: 0.6,
};

Deno.test("normalizeModelName: prefixo models/, sufixo de data, caixa e espaço", () => {
    assertEquals(normalizeModelName("models/gemini-2.5-flash"), "gemini-2.5-flash");
    assertEquals(normalizeModelName("GPT-4.1-2025-04-14"), "gpt-4.1");
    assertEquals(normalizeModelName("  gpt-5.4-Mini "), "gpt-5.4-mini");
    assertEquals(normalizeModelName(null), "");
});

Deno.test("cache reportado pelo provedor tem prioridade sobre a estimativa", () => {
    const r = computeTokenCost({
        promptTokens: 50_000,
        completionTokens: 500,
        reportedCachedTokens: 40_000,
        price: MINI,
    });
    // fresh 10.000 * 0,75 + cache 40.000 * 0,075 + saída 500 * 4,50 = 12.750 / 1M
    assertEquals(r.cachedTokens, 40_000);
    assertEquals(r.freshPromptTokens, 10_000);
    assertEquals(r.cachedTokensSource, "reported");
    assertEquals(r.tokensEstimated, false);
    assertAlmostEquals(r.providerCostUsd, 0.01275, 1e-12);
    // sem markup da conta e sem o da plataforma vale o piso DEFAULT_MARKUP (0,30)
    assertAlmostEquals(r.costUsd, 0.016575, 1e-12);
    assertEquals(r.markupApplied, 0.3);
});

Deno.test("sem cache reportado: estima por default_cache_ratio 0,60", () => {
    const r = computeTokenCost({ promptTokens: 50_000, completionTokens: 500, price: MINI });
    // cache 30.000, fresh 20.000 -> 15.000 + 2.250 + 2.250 = 19.500 / 1M
    assertEquals(r.cachedTokens, 30_000);
    assertEquals(r.cachedTokensSource, "estimated");
    assertEquals(r.tokensEstimated, true);
    assertAlmostEquals(r.cacheRatioApplied, 0.6, 1e-12);
    assertAlmostEquals(r.providerCostUsd, 0.0195, 1e-12);
    assertAlmostEquals(r.costUsd, 0.02535, 1e-12);
});

Deno.test("calibração medida vence o default do modelo", () => {
    const r = computeTokenCost({
        promptTokens: 50_000,
        completionTokens: 500,
        price: MINI,
        calibratedCacheRatio: 0.8,
    });
    // cache 40.000, fresh 10.000 -> 7.500 + 3.000 + 2.250 = 12.750 / 1M
    assertEquals(r.cachedTokens, 40_000);
    assertEquals(r.cachedTokensSource, "estimated");
    assertAlmostEquals(r.providerCostUsd, 0.01275, 1e-12);
    assertAlmostEquals(r.costUsd, 0.016575, 1e-12);
});

Deno.test("prompt abaixo de 1024 tokens não cacheia", () => {
    const r = computeTokenCost({ promptTokens: 1000, completionTokens: 100, price: MINI });
    // 1000 * 0,75 + 100 * 4,50 = 1.200 / 1M
    assertEquals(r.cachedTokens, 0);
    assertEquals(r.cachedTokensSource, "none");
    assertEquals(resolveCacheRatio(1000, MINI, 0.9), 0);
    assertAlmostEquals(r.providerCostUsd, 0.0012, 1e-12);
    assertAlmostEquals(r.costUsd, 0.00156, 1e-12);
});

Deno.test("modelo sem preço de cache cadastrado: cache_ratio forçado a 0", () => {
    const r = computeTokenCost({ promptTokens: 10_000, completionTokens: 200, price: SEM_CACHE });
    // 10.000 * 2 + 200 * 8 = 21.600 / 1M
    assertEquals(resolveCacheRatio(10_000, SEM_CACHE, 0.8), 0);
    assertEquals(r.cachedTokens, 0);
    assertAlmostEquals(r.providerCostUsd, 0.0216, 1e-12);
    assertAlmostEquals(r.costUsd, 0.02808, 1e-12);
});

Deno.test("conta com chave própria: markup 0, custo = custo do provedor", () => {
    const r = computeTokenCost({
        promptTokens: 50_000,
        completionTokens: 500,
        price: MINI,
        billable: false,
        markupOverride: 0.4,
        platformMarkup: 0.3,
    });
    assertEquals(r.markupApplied, 0);
    assertAlmostEquals(r.providerCostUsd, 0.0195, 1e-12);
    assertAlmostEquals(r.costUsd, 0.0195, 1e-12);
});

Deno.test("precedência da margem: conta vence a plataforma, que vence o piso", () => {
    const daConta = computeTokenCost({
        promptTokens: 50_000,
        completionTokens: 500,
        price: MINI,
        markupOverride: 0.4,
        platformMarkup: 0.3,
    });
    assertEquals(daConta.markupApplied, 0.4);
    assertAlmostEquals(daConta.costUsd, 0.0273, 1e-12);

    // markup 0 por conta (caso Bruno Admin) não pode cair no default
    const contaZerada = computeTokenCost({
        promptTokens: 50_000,
        completionTokens: 500,
        price: MINI,
        markupOverride: 0,
        platformMarkup: 0.3,
    });
    assertEquals(contaZerada.markupApplied, 0);
    assertAlmostEquals(contaZerada.costUsd, 0.0195, 1e-12);

    const daPlataforma = computeTokenCost({
        promptTokens: 50_000,
        completionTokens: 500,
        price: MINI,
        markupOverride: null,
        platformMarkup: 0.5,
    });
    assertEquals(daPlataforma.markupApplied, 0.5);
    assertAlmostEquals(daPlataforma.costUsd, 0.02925, 1e-12);

    const piso = computeTokenCost({
        promptTokens: 50_000,
        completionTokens: 500,
        price: MINI,
        markupOverride: null,
        platformMarkup: null,
    });
    assertEquals(piso.markupApplied, 0.3);
});

Deno.test("cache reportado acima do prompt é limitado ao prompt", () => {
    const r = computeTokenCost({
        promptTokens: 5_000,
        completionTokens: 0,
        reportedCachedTokens: 9_999,
        price: MINI,
    });
    assertEquals(r.cachedTokens, 5_000);
    assertEquals(r.freshPromptTokens, 0);
    assertAlmostEquals(r.providerCostUsd, 0.000375, 1e-12);
});

Deno.test("warning de volume alto dispara por chamada, não por linha", () => {
    const alto = computeTokenCost({
        promptTokens: 500_000,
        completionTokens: 0,
        calls: 2,
        price: MINI,
    });
    assertEquals(alto.warnings.length, 1);
    assert(alto.warnings[0].includes("250000"));

    const ok = computeTokenCost({
        promptTokens: 500_000,
        completionTokens: 0,
        calls: 3,
        price: MINI,
    });
    assertEquals(ok.warnings.length, 0);
});
