-- gpt-4-turbo nao estava em llm_model_prices: caia no FALLBACK_MODEL
-- ('gpt-5.4-mini') do _shared/token-cost.ts, ou seja era precificado a 0,75/4,50
-- em vez de 10/30 — 13x mais barato do que a OpenAI cobra.
--
-- Preco conferido em developers.openai.com/api/docs/pricing (22/09/2026),
-- gpt-4-turbo-2024-04-09: input US$10,00 / 1M, output US$30,00 / 1M,
-- SEM preco de input cacheado (o modelo nao tem cache de prompt) — por isso
-- cached_input_usd_per_1m fica NULL, o que forca cache_ratio = 0 na formula.

insert into public.llm_model_prices
  (model, input_usd_per_1m, cached_input_usd_per_1m, output_usd_per_1m, default_cache_ratio)
values
  ('gpt-4-turbo', 10.0, null, 30.0, 0)
on conflict (model) do update
set input_usd_per_1m = excluded.input_usd_per_1m,
    cached_input_usd_per_1m = excluded.cached_input_usd_per_1m,
    output_usd_per_1m = excluded.output_usd_per_1m,
    default_cache_ratio = excluded.default_cache_ratio,
    updated_at = now();
