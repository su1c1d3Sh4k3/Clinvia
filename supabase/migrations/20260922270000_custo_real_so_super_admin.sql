-- 20260922270000_custo_real_so_super_admin.sql
-- Rollback: 20260922270000_custo_real_so_super_admin_rollback.sql
--
-- REGRA DE NEGOCIO (decisao do user, 22/09/2026): o cliente SEMPRE ve o valor
-- com o acrescimo (custo real da OpenAI x markup). Ele NUNCA ve o custo real
-- nem o percentual de margem — em tela, relatorio, exportacao, e-mail ou API.
-- Quem ve os dois lado a lado e SO o Super Admin.
--
-- O QUE ESTAVA ERRADO (medido, nao presumido):
--   `token_usage_log` tem policy `Users can view own token logs`
--   (SELECT using owner_id = auth.uid()) e o papel `authenticated` tinha grant
--   de SELECT nas 27 colunas — inclusive `provider_cost_usd`, `markup_applied`,
--   `cache_ratio_applied`, `cost_usd_original` e `cost_brl_original`.
--   Resultado: o dono da conta lia o custo real e a propria margem com um
--   GET /rest/v1/token_usage_log?select=provider_cost_usd,markup_applied.
--   O vazamento nao estava na tela — estava na REST.
--
-- POR QUE `revoke` E NAO policy: policy nao filtra COLUNA, so LINHA. E, pela
-- regra do CLAUDE.md, revoke de coluna e inerte enquanto existe o grant de
-- tabela — entao aqui e `revoke select on <tabela>` e depois
-- `grant select (<colunas liberadas>)`.
--
-- NADA NO PRODUTO LE ESTA TABELA COMO `authenticated`:
--   - front: zero queries diretas (conferido em src/ — so comentarios citando
--     a tabela). O consumo do cliente vem das RPCs get_my_token_stats /
--     _monthly / _daily / _years, que sao SECURITY DEFINER owner=postgres e
--     portanto NAO passam pelo grant de `authenticated`;
--   - edge functions: api-token-usage, api-token-usage-sandbox e
--     infra-get-metrics usam SERVICE_ROLE_KEY (grant intacto).
--   O grant de volta e conservador (mantem tudo menos custo real e margem)
--   para nao quebrar nada que eu nao tenha mapeado.

revoke select on public.token_usage_log from authenticated;

grant select (
    id,
    owner_id,
    team_member_id,
    function_name,
    model,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cost_usd,
    cost_brl,
    exchange_rate,
    created_at,
    workflow_id,
    execution_id,
    source,
    cached_prompt_tokens,
    cached_tokens_source,
    price_fallback,
    tokens_estimated,
    calls,
    billable,
    usage_key
) on public.token_usage_log to authenticated;

-- `anon` nao tem motivo nenhum para ler consumo. Hoje a RLS ja o zera
-- (auth.uid() e null nas duas policies), mas o grant aberto era um acidente
-- esperando policy nova. Nenhuma coluna volta.
revoke select on public.token_usage_log from anon;

-- `profiles.markup` = o percentual de margem. Estava legivel por
-- `authenticated` E a policy de leitura de `profiles` e
-- `Users can view all profiles` USING (true) — ou seja, qualquer usuario
-- logado lia a margem de TODAS as contas, nao so da dele.
-- Aqui so fecho a coluna. A policy USING (true) de `profiles` (que tambem
-- expoe e-mail, empresa e acumuladores de consumo de todos os tenants) e
-- tratada em migration propria, com plano aprovado antes.
revoke select (markup) on public.profiles from anon, authenticated;

-- Endpoint do Super Admin: e o UNICO que devolve custo real e margem juntos.
-- Estava em `admin_can('clientes','view')` — qualquer membro de equipe da
-- plataforma com permissao de ver clientes. Sobe para `is_super_admin()`.
--
-- Corpo copiado da versao VIVA do banco (a migration 20260922131000 esta
-- desatualizada: o `is_estimated`, o `spend_alert_threshold` e o
-- `spend_alert_level` entraram depois). Unica linha alterada: a guarda.
create or replace function public.admin_get_openai_account_usage(p_profile_id uuid)
returns table (
  key_source text,
  project_id text,
  is_estimated boolean,
  spend_limit_usd numeric,
  spend_alert_threshold numeric,
  spend_alert_level numeric,
  markup numeric,
  real_cost_usd numeric,
  clinbia_cost_usd numeric,
  input_tokens bigint,
  input_cached_tokens bigint,
  output_tokens bigint,
  num_model_requests bigint,
  synced_at timestamptz,
  provisioned_at timestamptz,
  provision_error text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ini date;
  v_markup numeric;
  v_threshold numeric;
begin
  -- Custo real + margem sao dado de dono do negocio, nao de equipe de suporte.
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  v_ini := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;

  -- Precedencia do markup (decisao do user): profiles.markup por conta quando
  -- preenchido, senao llm_platform_settings.default_markup. `llm_model_prices`
  -- nao entra mais nessa conta.
  select coalesce(p.markup, s.default_markup), s.spend_alert_threshold
    into v_markup, v_threshold
  from public.profiles p
  cross join public.llm_platform_settings s
  where p.id = p_profile_id;

  return query
  with prof as (
    select p.openai_key_source, p.openai_project_id, p.openai_spend_limit_usd,
           p.openai_spend_alert_level, p.openai_provisioned_at, p.openai_provision_error
    from public.profiles p where p.id = p_profile_id
  ),
  tok as (
    select sum(u.input_tokens)::bigint as input_tokens,
           sum(u.input_cached_tokens)::bigint as input_cached_tokens,
           sum(u.output_tokens)::bigint as output_tokens,
           sum(u.num_model_requests)::bigint as num_model_requests,
           max(u.updated_at) as synced_at
    from public.openai_project_usage_daily u, prof
    where u.project_id = prof.openai_project_id and u.day >= v_ini
  ),
  cst as (
    select sum(c.cost_usd) as real_cost_usd, max(c.updated_at) as synced_at
    from public.openai_project_costs_daily c, prof
    where c.project_id = prof.openai_project_id and c.day >= v_ini
  )
  select prof.openai_key_source,
         prof.openai_project_id,
         -- sem projeto da plataforma nao existe custo real: o card mostra a
         -- estimativa do token_usage_log com selo "estimado".
         (prof.openai_key_source is distinct from 'platform'
          or prof.openai_project_id is null),
         prof.openai_spend_limit_usd,
         v_threshold,
         prof.openai_spend_alert_level,
         case when prof.openai_key_source = 'customer' then 0 else v_markup end,
         round(coalesce(cst.real_cost_usd, 0), 6),
         case when prof.openai_key_source = 'customer' then 0
              else round(coalesce(cst.real_cost_usd, 0) * (1 + v_markup), 6) end,
         coalesce(tok.input_tokens, 0),
         coalesce(tok.input_cached_tokens, 0),
         coalesce(tok.output_tokens, 0),
         coalesce(tok.num_model_requests, 0),
         nullif(greatest(coalesce(tok.synced_at, '-infinity'::timestamptz),
                         coalesce(cst.synced_at, '-infinity'::timestamptz)),
                '-infinity'::timestamptz),
         prof.openai_provisioned_at,
         prof.openai_provision_error
  from prof, tok, cst;
end;
$$;

revoke all on function public.admin_get_openai_account_usage(uuid) from public, anon;
grant execute on function public.admin_get_openai_account_usage(uuid) to authenticated, service_role;

comment on function public.admin_get_openai_account_usage(uuid) is
  'Custo real da OpenAI + valor com markup + percentual de margem do mes corrente. SO Super Admin (is_super_admin). Nenhum endpoint de cliente devolve custo real nem margem.';
