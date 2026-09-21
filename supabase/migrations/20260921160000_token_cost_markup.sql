-- Custo de tokens: separa custo do provedor do preco cobrado (markup explicito)
-- + estimativa de cache + idempotencia por usage_key + calibracao de cache ratio.
--
-- Regra de negocio: cost_usd = provider_cost_usd * (1 + markup)
--   markup = 0 quando a conta usa chave propria (billable = false)
--            senao coalesce(profiles.markup, llm_model_prices.markup, 0.25)

-- 1) llm_model_prices: markup por modelo + cache ratio padrao
alter table public.llm_model_prices
  add column if not exists markup numeric not null default 0.25,
  add column if not exists default_cache_ratio numeric not null default 0.60;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'llm_model_prices_markup_check') then
    alter table public.llm_model_prices
      add constraint llm_model_prices_markup_check check (markup >= 0 and markup <= 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'llm_model_prices_cache_ratio_check') then
    alter table public.llm_model_prices
      add constraint llm_model_prices_cache_ratio_check check (default_cache_ratio >= 0 and default_cache_ratio <= 1);
  end if;
end $$;

comment on column public.llm_model_prices.markup is 'Margem de revenda aplicada sobre o custo do provedor (0.25 = +25%). Sobrescrita por profiles.markup.';
comment on column public.llm_model_prices.default_cache_ratio is 'Fracao do prompt considerada cacheada quando o provedor nao informa (usado como fallback da llm_cache_calibration).';

-- 2) Precos de cache oficiais dos gpt-4.x (developers.openai.com/api/docs/pricing, 21/09/2026)
--    gpt-4o cacheia a 50% do input; os demais a 25%/25%/50% conforme tabela oficial.
update public.llm_model_prices set cached_input_usd_per_1m = 0.500  where lower(model) = 'gpt-4.1'      and cached_input_usd_per_1m is null;
update public.llm_model_prices set cached_input_usd_per_1m = 0.100  where lower(model) = 'gpt-4.1-mini' and cached_input_usd_per_1m is null;
update public.llm_model_prices set cached_input_usd_per_1m = 1.250  where lower(model) = 'gpt-4o'       and cached_input_usd_per_1m is null;
update public.llm_model_prices set cached_input_usd_per_1m = 0.075  where lower(model) = 'gpt-4o-mini'  and cached_input_usd_per_1m is null;

-- 3) Markup por tenant (null = usa o global do modelo)
alter table public.profiles
  add column if not exists markup numeric null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_markup_check') then
    alter table public.profiles
      add constraint profiles_markup_check check (markup is null or (markup >= 0 and markup <= 5));
  end if;
end $$;

comment on column public.profiles.markup is 'Margem de revenda de IA desta conta. NULL = usa llm_model_prices.markup.';

-- 4) Calibracao do cache ratio por modelo (alimentada pela edge fn calibrate-cache-ratio)
create table if not exists public.llm_cache_calibration (
  model text primary key,
  cache_ratio numeric not null check (cache_ratio >= 0 and cache_ratio <= 1),
  sample_input_tokens bigint not null default 0,
  period_start date,
  period_end date,
  source text not null default 'openai_usage_api',
  updated_at timestamptz not null default now()
);

comment on table public.llm_cache_calibration is 'Cache ratio real por modelo, medido na Usage API do provedor. Fallback = llm_model_prices.default_cache_ratio.';

alter table public.llm_cache_calibration enable row level security;
-- sem policies: acesso apenas por service_role (edge functions)

-- 5) Uso diario real do provedor (para conferir a estimativa contra a fatura)
create table if not exists public.llm_provider_usage_daily (
  day date not null,
  model text not null,
  input_tokens bigint not null default 0,
  input_cached_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  num_requests bigint not null default 0,
  source text not null default 'openai_usage_api',
  updated_at timestamptz not null default now(),
  primary key (day, model, source)
);

comment on table public.llm_provider_usage_daily is 'Snapshot diario da Usage API do provedor, usado para validar provider_cost_usd contra a fatura real.';

alter table public.llm_provider_usage_daily enable row level security;

-- 6) token_usage_log: colunas novas (todas aditivas, relatorios atuais seguem lendo cost_usd)
alter table public.token_usage_log
  add column if not exists provider_cost_usd numeric,
  add column if not exists markup_applied numeric,
  add column if not exists cache_ratio_applied numeric,
  add column if not exists cached_tokens_source text,
  add column if not exists price_fallback boolean not null default false,
  add column if not exists tokens_estimated boolean not null default false,
  add column if not exists calls integer not null default 1,
  add column if not exists billable boolean not null default true,
  add column if not exists usage_key text,
  add column if not exists cost_usd_original numeric,
  add column if not exists cost_brl_original numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'token_usage_log_cached_src_check') then
    alter table public.token_usage_log
      add constraint token_usage_log_cached_src_check
      check (cached_tokens_source is null or cached_tokens_source in ('reported','estimated','none'));
  end if;
end $$;

comment on column public.token_usage_log.provider_cost_usd is 'Custo estimado do provedor (sem margem).';
comment on column public.token_usage_log.markup_applied is 'Margem aplicada nesta linha (0.25 = +25%). 0 quando a conta usa chave propria.';
comment on column public.token_usage_log.cache_ratio_applied is 'Fracao do prompt tratada como cacheada nesta linha.';
comment on column public.token_usage_log.cached_tokens_source is 'reported = o provedor informou; estimated = calculado por cache_ratio; none = sem cache.';
comment on column public.token_usage_log.price_fallback is 'true quando o modelo nao estava cadastrado em llm_model_prices.';
comment on column public.token_usage_log.tokens_estimated is 'true quando os tokens cacheados foram estimados (nao reportados).';
comment on column public.token_usage_log.calls is 'Quantas chamadas ao provedor esta linha agrega (1 por padrao).';
comment on column public.token_usage_log.billable is 'false quando a conta usa chave propria do provedor (registra consumo, nao cobra).';
comment on column public.token_usage_log.usage_key is 'Chave de idempotencia enviada pelo n8n (workflow:execution:model). NULL = sem dedup.';
comment on column public.token_usage_log.cost_usd_original is 'Valor de cost_usd antes do recalculo de 21/09/2026.';
comment on column public.token_usage_log.cost_brl_original is 'Valor de cost_brl antes do recalculo de 21/09/2026.';

create unique index if not exists token_usage_log_usage_key_uidx
  on public.token_usage_log (usage_key)
  where usage_key is not null;

-- 7) Resumo do mes corrente sem o teto de 1000 linhas do PostgREST
create or replace function public.token_usage_month_summary(p_owner_id uuid)
returns table (
  source text,
  total_tokens bigint,
  prompt_tokens bigint,
  completion_tokens bigint,
  cached_tokens bigint,
  provider_cost_usd numeric,
  cost_usd numeric,
  cost_brl numeric,
  rows_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    t.source,
    coalesce(sum(t.total_tokens), 0)::bigint,
    coalesce(sum(t.prompt_tokens), 0)::bigint,
    coalesce(sum(t.completion_tokens), 0)::bigint,
    coalesce(sum(t.cached_prompt_tokens), 0)::bigint,
    coalesce(sum(t.provider_cost_usd), 0)::numeric,
    coalesce(sum(t.cost_usd), 0)::numeric,
    coalesce(sum(t.cost_brl), 0)::numeric,
    count(*)::bigint
  from public.token_usage_log t
  where t.owner_id = p_owner_id
    and t.created_at >= (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo')
  group by t.source;
$$;

-- SECURITY DEFINER com owner_id arbitrario: apenas service_role (edge functions)
revoke all on function public.token_usage_month_summary(uuid) from public, anon, authenticated;
grant execute on function public.token_usage_month_summary(uuid) to service_role;
