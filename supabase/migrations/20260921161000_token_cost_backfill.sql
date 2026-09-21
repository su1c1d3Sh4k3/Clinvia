-- Recalculo do historico de custo de tokens do n8n (desde 21/08/2026).
--
-- ATENCAO: so aplicar DEPOIS de rodar calibrate-cache-ratio e conferir
-- provider_cost_usd contra a fatura real da OpenAI no mesmo periodo. Se o
-- estimado ficar ABAIXO da fatura, NAO aplicar: significa que ha chamadas que o
-- monitor antigo nunca registrou.
--
-- O que faz:
--   1. Guarda os valores originais em cost_usd_original / cost_brl_original
--      (uma unica vez — reexecucao nao sobrescreve o snapshot).
--   2. Recalcula as linhas source='n8n' com a formula nova:
--        cached   = reportado, senao round(prompt * cache_ratio)
--        provider = (fresh*input + cached*cached_input + completion*output)/1e6
--        cost_usd = provider * (1 + markup)
--      cache_ratio = llm_cache_calibration.cache_ratio, senao default_cache_ratio;
--      0 quando o modelo nao tem preco de cache cadastrado ou prompt < 1024.
--      markup = profiles.markup, senao llm_model_prices.markup; 0 se a conta usa
--      chave propria do provedor (billable = false).
--   3. Reescreve os acumuladores de profiles a partir do SUM do log, para o
--      painel "Minha Conta" bater com o log.
--
-- Linhas source='system' NAO sao tocadas aqui: elas vem do _shared/token-tracker.ts,
-- que so migra para a formula nova na etapa 2.

-- 1) Snapshot dos valores originais (idempotente)
update public.token_usage_log
set cost_usd_original = cost_usd,
    cost_brl_original = cost_brl
where cost_usd_original is null;

-- 2) Recalculo das linhas do n8n
with p as (
  select lower(model) as model,
         input_usd_per_1m as inp,
         output_usd_per_1m as outp,
         cached_input_usd_per_1m as cachedp,
         markup as model_markup,
         default_cache_ratio
  from public.llm_model_prices
),
cal as (
  select lower(model) as model, cache_ratio from public.llm_cache_calibration
),
base as (
  select t.id,
         t.prompt_tokens,
         t.completion_tokens,
         t.cached_prompt_tokens as cached_reportado,
         t.exchange_rate,
         p.inp, p.outp, p.cachedp,
         -- sem preco de cache cadastrado ou prompt curto => nao cacheia
         case
           when p.cachedp is null then 0
           when t.prompt_tokens < 1024 then 0
           else coalesce(cal.cache_ratio, p.default_cache_ratio, 0.60)
         end as ratio,
         case
           when prof.openai_token is not null and btrim(prof.openai_token) <> '' then false
           else true
         end as billable,
         coalesce(prof.markup, p.model_markup, 0.25) as markup
  from public.token_usage_log t
  left join p   on p.model   = lower(t.model)
  left join cal on cal.model = lower(t.model)
  left join public.profiles prof on prof.id = t.owner_id
  where t.source = 'n8n'
),
calc as (
  select b.*,
         case when b.cached_reportado > 0
              then least(b.cached_reportado, b.prompt_tokens)
              else least(round(b.prompt_tokens * b.ratio), b.prompt_tokens)
         end as cached_novo
  from base b
),
fin as (
  select c.*,
         (c.prompt_tokens - c.cached_novo) * coalesce(c.inp, 0)
           + c.cached_novo * coalesce(c.cachedp, c.inp, 0)
           + c.completion_tokens * coalesce(c.outp, 0) as micro_usd
  from calc c
)
update public.token_usage_log t
set provider_cost_usd  = f.micro_usd / 1000000.0,
    cost_usd           = (f.micro_usd / 1000000.0) * (1 + case when f.billable then f.markup else 0 end),
    cost_brl           = (f.micro_usd / 1000000.0) * (1 + case when f.billable then f.markup else 0 end)
                         * coalesce(f.exchange_rate, 5.50),
    cached_prompt_tokens = f.cached_novo,
    cached_tokens_source = case
                             when f.cached_reportado > 0 then 'reported'
                             when f.cached_novo > 0 then 'estimated'
                             else 'none'
                           end,
    tokens_estimated     = (f.cached_reportado = 0 and f.cached_novo > 0),
    cache_ratio_applied  = case when f.prompt_tokens > 0
                                then f.cached_novo::numeric / f.prompt_tokens
                                else 0 end,
    markup_applied       = case when f.billable then f.markup else 0 end,
    billable             = f.billable
from fin f
where t.id = f.id;

-- 3) Acumuladores de profiles reescritos a partir do log
--    (mes corrente em America/Sao_Paulo; total = log inteiro)
--
-- DUAS armadilhas tratadas aqui, ambas causadas pelo trigger
-- profiles.trigger_log_token_updates (ver 20260921163000_drop_phantom_token_trigger.sql):
--   a) linhas function_name='external-n8n' sao ESPELHOS dos acumuladores, nao
--      consumo real — somar tudo dobraria o total;
--   b) o proprio UPDATE abaixo dispararia o trigger, criando dezenas de milhares
--      de linhas fantasma novas. Por isso ele e desligado durante o UPDATE.
--
-- Se a migration que remove o trigger ja tiver sido aplicada, o DISABLE/ENABLE
-- abaixo vira no-op protegido pelo IF EXISTS.
do $$
declare
    v_tem_trigger boolean;
begin
    select exists (
        select 1 from pg_trigger
        where tgrelid = 'public.profiles'::regclass
          and tgname = 'trigger_log_token_updates'
          and not tgisinternal
    ) into v_tem_trigger;

    if v_tem_trigger then
        alter table public.profiles disable trigger trigger_log_token_updates;
    end if;

    with tot as (
      select owner_id,
             sum(total_tokens) as tokens_total,
             sum(cost_usd)     as cost_total,
             sum(total_tokens) filter (
               where created_at >= (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo')
             ) as tokens_mes,
             sum(cost_usd) filter (
               where created_at >= (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo')
             ) as cost_mes
      from public.token_usage_log
      where function_name is distinct from 'external-n8n'
      group by owner_id
    )
    update public.profiles pr
    set tokens_total             = coalesce(tot.tokens_total, 0),
        tokens_monthly           = coalesce(tot.tokens_mes, 0),
        approximate_cost_total   = coalesce(tot.cost_total, 0),
        approximate_cost_monthly = coalesce(tot.cost_mes, 0)
    from tot
    where pr.id = tot.owner_id;

    if v_tem_trigger then
        alter table public.profiles enable trigger trigger_log_token_updates;
    end if;
end $$;
