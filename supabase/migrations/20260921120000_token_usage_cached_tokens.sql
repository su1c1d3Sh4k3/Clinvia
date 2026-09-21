-- Consumo de tokens do n8n: suporte a cached input e ao Gemini.
--
-- Motivo: o agente LangChain do n8n reenvia o prompt inteiro a cada passo de
-- tool-call (até 9 chamadas na mesma execução). A OpenAI/Google cobram esse
-- input repetido como "cached input" (~10% do preço normal), mas a api-token-usage
-- cobrava tudo a preço cheio — daí a diferença grande contra a fatura real.

-- 1) Preço do input cacheado por modelo. NULL = sem preço de cache cadastrado,
--    e nesse caso o cálculo continua usando input_usd_per_1m (comportamento atual).
alter table public.llm_model_prices
    add column if not exists cached_input_usd_per_1m numeric;

comment on column public.llm_model_prices.cached_input_usd_per_1m is
    'Preço USD por 1M de tokens de input CACHEADO. NULL = cobra como input normal.';

update public.llm_model_prices
set cached_input_usd_per_1m = 0.075, updated_at = now()
where model = 'gpt-5.4-mini';

update public.llm_model_prices
set cached_input_usd_per_1m = 0.125, updated_at = now()
where model = 'gpt-5.4';

-- 2) Gemini 2.5 Flash: estava sendo precificado silenciosamente como gpt-5.4-mini
--    (FALLBACK_MODEL da edge function).
insert into public.llm_model_prices (model, input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m)
values ('gemini-2.5-flash', 0.30, 2.50, 0.03)
on conflict (model) do update
set input_usd_per_1m = excluded.input_usd_per_1m,
    output_usd_per_1m = excluded.output_usd_per_1m,
    cached_input_usd_per_1m = excluded.cached_input_usd_per_1m,
    updated_at = now();

-- 3) Quantos tokens do prompt vieram do cache. prompt_tokens continua sendo o
--    TOTAL (cacheado + novo), para não mudar a semântica dos relatórios.
alter table public.token_usage_log
    add column if not exists cached_prompt_tokens integer not null default 0;

comment on column public.token_usage_log.cached_prompt_tokens is
    'Parte de prompt_tokens que foi servida pelo cache do provedor (cobrada mais barato).';
