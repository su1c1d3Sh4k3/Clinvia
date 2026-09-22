-- Rollback de 20260922270000_custo_real_so_super_admin.sql
--
-- ATENCAO: rodar isto REABRE o vazamento. Volta a permitir que o dono da conta
-- leia `provider_cost_usd` / `markup_applied` / `cost_usd_original` /
-- `cost_brl_original` / `cache_ratio_applied` pela REST, e que qualquer usuario
-- logado leia `profiles.markup` de todas as contas. So usar se algum caminho
-- nao mapeado quebrar com 42501 e for preciso restaurar producao na hora.

-- Grant de tabela apaga a necessidade dos grants por coluna.
grant select on public.token_usage_log to anon, authenticated;
grant select (markup) on public.profiles to anon, authenticated;

-- Guarda da RPC volta para admin_can('clientes','view').
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
  if not public.admin_can('clientes', 'view') then
    raise exception 'forbidden';
  end if;

  v_ini := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;

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
