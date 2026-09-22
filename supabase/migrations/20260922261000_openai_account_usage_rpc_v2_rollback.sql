-- Rollback da 20260922261000: volta a assinatura da 20260922131000
-- (sem is_estimated / spend_alert_threshold / spend_alert_level, synced_at
-- podendo vir -infinity).
--
-- Aplicar SO se o front ja tiver voltado tambem: o card novo le as colunas que
-- este arquivo remove.

drop function if exists public.admin_get_openai_account_usage(uuid);

create or replace function public.admin_get_openai_account_usage(p_profile_id uuid)
returns table (
  key_source text,
  project_id text,
  spend_limit_usd numeric,
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
begin
  if not public.admin_can('clientes', 'view') then
    raise exception 'forbidden';
  end if;

  v_ini := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;

  select coalesce(p.markup, s.default_markup)
    into v_markup
  from public.profiles p
  cross join public.llm_platform_settings s
  where p.id = p_profile_id;

  return query
  with prof as (
    select p.openai_key_source, p.openai_project_id, p.openai_spend_limit_usd,
           p.openai_provisioned_at, p.openai_provision_error
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
         prof.openai_spend_limit_usd,
         case when prof.openai_key_source = 'customer' then 0 else v_markup end,
         round(coalesce(cst.real_cost_usd, 0), 6),
         case when prof.openai_key_source = 'customer' then 0
              else round(coalesce(cst.real_cost_usd, 0) * (1 + v_markup), 6) end,
         coalesce(tok.input_tokens, 0),
         coalesce(tok.input_cached_tokens, 0),
         coalesce(tok.output_tokens, 0),
         coalesce(tok.num_model_requests, 0),
         greatest(coalesce(tok.synced_at, '-infinity'::timestamptz),
                  coalesce(cst.synced_at, '-infinity'::timestamptz)),
         prof.openai_provisioned_at,
         prof.openai_provision_error
  from prof, tok, cst;
end;
$$;

revoke all on function public.admin_get_openai_account_usage(uuid) from public, anon;
grant execute on function public.admin_get_openai_account_usage(uuid) to authenticated, service_role;
