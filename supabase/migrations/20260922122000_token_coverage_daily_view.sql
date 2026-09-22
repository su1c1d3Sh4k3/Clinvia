-- v_token_coverage_daily: quanto do que a OpenAI cobra chega ao nosso log.
--
-- Meta operacional (user, 22/09/2026): pct_tokens >= 95% no gpt-5.4-mini a medida
-- que o no Code novo (usage_key + calls) for publicado nos workflows do n8n.
-- Hoje a cobertura do gpt-5.4-mini esta em ~53% (13.779 requisicoes na API contra
-- 6.987 linhas de log na janela 21/08 -> 22/09), e e por isso que o custo estimado
-- fica abaixo da fatura.
--
-- O `day` de llm_provider_usage_daily vem dos buckets da Usage API, que sao UTC.
-- Por isso o log tambem e agrupado por created_at em UTC: comparar com dia de
-- Sao Paulo deslocaria 3h de consumo para o dia anterior. Esta view e de
-- diagnostico/faturamento, NAO de tela do cliente.
--
-- Cobertura so existe para modelos da OpenAI (gemini-2.5-flash aparece com
-- reqs_api/input_api nulos: o Google nao entra nessa API).

create or replace view public.v_token_coverage_daily as
with log as (
  select date_trunc('day', l.created_at)::date as day,
         lower(l.model) as model,
         count(*) as linhas_log,
         sum(l.prompt_tokens)::bigint as prompt_log,
         sum(l.completion_tokens)::bigint as completion_log
  from public.token_usage_log l
  group by 1, 2
),
api as (
  select d.day,
         lower(d.model) as model,
         sum(d.num_requests)::bigint as reqs_api,
         sum(d.input_tokens)::bigint as input_api,
         sum(d.input_cached_tokens)::bigint as cached_api,
         sum(d.output_tokens)::bigint as output_api
  from public.llm_provider_usage_daily d
  group by 1, 2
)
select coalesce(l.day, a.day) as day,
       coalesce(l.model, a.model) as model,
       coalesce(l.linhas_log, 0) as linhas_log,
       a.reqs_api,
       round(100.0 * coalesce(l.linhas_log, 0) / nullif(a.reqs_api, 0), 1) as pct_reqs,
       coalesce(l.prompt_log, 0) as prompt_log,
       a.input_api,
       round(100.0 * coalesce(l.prompt_log, 0) / nullif(a.input_api, 0), 1) as pct_tokens,
       coalesce(l.completion_log, 0) as completion_log,
       a.output_api,
       a.cached_api,
       round(100.0 * a.cached_api / nullif(a.input_api, 0), 1) as pct_cache_api
from log l
full join api a on a.day = l.day and a.model = l.model
order by 1 desc, 2;

comment on view public.v_token_coverage_daily is
  'Cobertura diaria do token_usage_log contra a Usage API da OpenAI (llm_provider_usage_daily). Dias em UTC. Meta: pct_tokens >= 95% no gpt-5.4-mini.';

-- A view roda com os privilegios do owner (postgres), logo furaria a RLS de
-- token_usage_log. Mantida restrita ao service_role / painel admin.
revoke all on public.v_token_coverage_daily from anon, authenticated;
grant select on public.v_token_coverage_daily to service_role;
