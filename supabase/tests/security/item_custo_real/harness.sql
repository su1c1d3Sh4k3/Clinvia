-- ARNES do custo real / margem (migration 20260922270000).
-- Mede o ANTES com cada persona, aplica a migration INLINE na mesma transacao,
-- mede o DEPOIS e termina em ROLLBACK. Producao nunca e tocada.
--
-- Personas (probe_personas.sql):
--   A  = PELE DERMATOLOGIA e697878e-... -> dono com 28.547 linhas em
--        token_usage_log, 707 delas com provider_cost_usd preenchido.
--   S  = admin@clinbia.com 23da6832-... -> UNICA linha de admin_users, e ela e
--        is_super_admin. Logo, apertar admin_can('clientes','view') para
--        is_super_admin() nao tira acesso de ninguem que exista hoje.
--   G  = um profile com role 'agent'.
--   anon / service_role.
begin;

set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;
grant all on _ids to authenticated, anon, service_role;

insert into _ids(k, v) values
  ('a', 'e697878e-29c9-4b7e-88bb-869f4f2c76af'),
  ('s', '23da6832-ca42-4d5b-a59b-1aad8a6f3964');

insert into _ids(k, v)
select 'g', p.id::text from public.profiles p where p.role = 'agent' limit 1;

insert into _r(info)
select 'setup | ' || k || ' = ' || coalesce(v, 'NULO') from _ids order by k;

insert into _r(info)
select 'setup | admin_users | linhas=' || count(*)::text ||
       ' | super_ativos=' || count(*) filter (where is_super_admin and is_active)::text ||
       ' | staff_nao_super=' || count(*) filter (where is_active and not is_super_admin)::text
from public.admin_users;

insert into _r(info)
select 'setup | A tem ' || count(*)::text || ' linhas, ' ||
       count(*) filter (where provider_cost_usd is not null)::text ||
       ' com provider_cost_usd | custo real do mes US$ ' ||
       coalesce(round(sum(provider_cost_usd), 4)::text, '0')
from public.token_usage_log
where owner_id = (select v from _ids where k = 'a')::uuid;

-- ===========================================================================
-- FASE ANTES
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

do $harness$
declare v numeric; n bigint; t text;
begin
  -- O vazamento em si: o dono lendo o custo real da OpenAI.
  begin
    select round(sum(provider_cost_usd), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('ANTES | A le provider_cost_usd (custo REAL) | US$ ' || coalesce(v::text, 'null'));
  exception when others then
    insert into _r(info) values ('ANTES | A le provider_cost_usd | BLOQUEADO ' || sqlstate);
  end;

  -- E a margem aplicada linha por linha.
  begin
    select round(max(markup_applied), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('ANTES | A le markup_applied (MARGEM) | ' || coalesce(v::text, 'null'));
  exception when others then
    insert into _r(info) values ('ANTES | A le markup_applied | BLOQUEADO ' || sqlstate);
  end;

  begin
    select round(sum(cost_usd_original), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('ANTES | A le cost_usd_original (pre-margem) | US$ ' || coalesce(v::text, 'null'));
  exception when others then
    insert into _r(info) values ('ANTES | A le cost_usd_original | BLOQUEADO ' || sqlstate);
  end;

  begin
    select round(max(cache_ratio_applied), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('ANTES | A le cache_ratio_applied | ' || coalesce(v::text, 'null'));
  exception when others then
    insert into _r(info) values ('ANTES | A le cache_ratio_applied | BLOQUEADO ' || sqlstate);
  end;

  -- `select *` = o que um PostgREST select=* faria.
  begin
    select count(*) into n from (select * from public.token_usage_log limit 5) q;
    insert into _r(info) values ('ANTES | A faz select * (PostgREST select=*) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A faz select * | BLOQUEADO ' || sqlstate);
  end;

  -- A margem da conta, e de TODAS as outras (policy `Users can view all profiles`).
  begin
    select count(*) into n from public.profiles;
    insert into _r(info) values ('ANTES | A enxerga ' || n::text || ' linhas de profiles (esperado: 1)');
    select string_agg(coalesce(markup::text, 'null'), ',') into t from public.profiles;
    insert into _r(info) values ('ANTES | A le profiles.markup de TODAS as contas | ' || coalesce(t, '-'));
  exception when others then
    insert into _r(info) values ('ANTES | A le profiles.markup | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

-- O que o cliente ve hoje e NAO pode mudar: as 4 RPCs da aba Minha Conta.
do $harness$
declare t text;
begin
  begin
    select 'tokens_total=' || coalesce(s.total_tokens::text, '-') ||
           ' custo_total_brl=' || coalesce(round(s.total_cost_brl, 2)::text, '-') ||
           ' mes_brl=' || coalesce(round(s.month_cost_brl, 2)::text, '-')
      into t
    from public.get_my_token_stats() s;
    insert into _r(info) values ('ANTES | LEGITIMO get_my_token_stats | ' || coalesce(t, 'sem linha'));
  exception when others then
    insert into _r(info) values ('ANTES | LEGITIMO get_my_token_stats | ERRO ' || sqlstate || ' ' || sqlerrm);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- APPLY DA MIGRATION (inline, mesma transacao)
-- ===========================================================================
revoke select on public.token_usage_log from authenticated;

grant select (
    id, owner_id, team_member_id, function_name, model,
    prompt_tokens, completion_tokens, total_tokens,
    cost_usd, cost_brl, exchange_rate, created_at,
    workflow_id, execution_id, source,
    cached_prompt_tokens, cached_tokens_source,
    price_fallback, tokens_estimated, calls, billable, usage_key
) on public.token_usage_log to authenticated;

revoke select on public.token_usage_log from anon;

revoke select (markup) on public.profiles from anon, authenticated;

-- ===========================================================================
-- FASE DEPOIS
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

do $harness$
declare v numeric; n bigint; t text;
begin
  begin
    select round(sum(provider_cost_usd), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A le provider_cost_usd | PASSOU (US$ ' || coalesce(v::text, 'null') || ') <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | A le provider_cost_usd | BLOQUEADO ' || sqlstate || ' ' || sqlerrm);
  end;

  begin
    select round(max(markup_applied), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A le markup_applied | PASSOU <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | A le markup_applied | BLOQUEADO ' || sqlstate);
  end;

  begin
    select round(sum(cost_usd_original), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A le cost_usd_original | PASSOU <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | A le cost_usd_original | BLOQUEADO ' || sqlstate);
  end;

  begin
    select round(sum(cost_brl_original), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A le cost_brl_original | PASSOU <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | A le cost_brl_original | BLOQUEADO ' || sqlstate);
  end;

  begin
    select round(max(cache_ratio_applied), 4) into v
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A le cache_ratio_applied | PASSOU <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | A le cache_ratio_applied | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from (select * from public.token_usage_log limit 5) q;
    insert into _r(info) values ('DEPOIS | A faz select * | PASSOU linhas=' || n::text || ' <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | A faz select * | BLOQUEADO ' || sqlstate);
  end;

  -- Colunas liberadas: o valor COM acrescimo continua legivel.
  begin
    select 'tokens=' || coalesce(sum(total_tokens)::text, '0') ||
           ' cost_brl=' || coalesce(round(sum(cost_brl), 2)::text, '0')
      into t
    from public.token_usage_log
    where owner_id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | LEGITIMO A le total_tokens/cost_brl (valor COM acrescimo) | ' || t);
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO A le total_tokens/cost_brl | BLOQUEADO ' || sqlstate);
  end;

  begin
    select string_agg(coalesce(markup::text, 'null'), ',') into t from public.profiles;
    insert into _r(info) values ('DEPOIS | A le profiles.markup | PASSOU (' || coalesce(t, '-') || ') <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | A le profiles.markup | BLOQUEADO ' || sqlstate);
  end;

  -- Cadastro da empresa: o front depende, nao pode quebrar.
  begin
    select coalesce(company_name, '-') into t from public.profiles
    where id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | LEGITIMO A le profiles.company_name | ' || t);
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO A le profiles.company_name | BLOQUEADO ' || sqlstate);
  end;

  begin
    select 'tokens_total=' || coalesce(tokens_total::text, '-') ||
           ' custo_aprox=' || coalesce(approximate_cost_total::text, '-') into t
    from public.profiles where id = (select _ids.v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | LEGITIMO A le acumuladores de profiles | ' || t);
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO A le acumuladores de profiles | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

-- As 4 RPCs que servem o cliente: SECURITY DEFINER owner=postgres, nao passam
-- pelo grant de `authenticated`. Se alguma quebrar aqui, a migration nao sobe.
do $harness$
declare t text; n bigint;
begin
  begin
    select 'tokens_total=' || coalesce(s.total_tokens::text, '-') ||
           ' custo_total_brl=' || coalesce(round(s.total_cost_brl, 2)::text, '-') ||
           ' mes_brl=' || coalesce(round(s.month_cost_brl, 2)::text, '-')
      into t
    from public.get_my_token_stats() s;
    insert into _r(info) values ('DEPOIS | LEGITIMO get_my_token_stats | ' || coalesce(t, 'sem linha'));
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO get_my_token_stats | ERRO ' || sqlstate || ' ' || sqlerrm);
  end;

  begin
    select count(*) into n from public.get_my_token_monthly(
      to_char(now() at time zone 'America/Sao_Paulo', 'YYYY'));
    insert into _r(info) values ('DEPOIS | LEGITIMO get_my_token_monthly | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO get_my_token_monthly | ERRO ' || sqlstate || ' ' || sqlerrm);
  end;

  begin
    select count(*) into n from public.get_my_token_daily(30);
    insert into _r(info) values ('DEPOIS | LEGITIMO get_my_token_daily | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO get_my_token_daily | ERRO ' || sqlstate || ' ' || sqlerrm);
  end;

  begin
    select count(*) into n from public.get_my_token_years();
    insert into _r(info) values ('DEPOIS | LEGITIMO get_my_token_years | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO get_my_token_years | ERRO ' || sqlstate || ' ' || sqlerrm);
  end;

  -- Nenhuma delas pode devolver custo real ou margem.
  insert into _r(info)
  select 'DEPOIS | colunas devolvidas pelas RPCs do cliente | ' ||
         string_agg(distinct parameter_name, ',' order by parameter_name)
  from information_schema.parameters
  where specific_schema = 'public'
    and parameter_mode = 'OUT'
    and specific_name like any (array['get_my_token_stats%', 'get_my_token_monthly%',
                                      'get_my_token_daily%', 'get_my_token_years%']);
end $harness$;

reset role;

-- Agente comum: nem antes nem depois deveria ver custo (RLS ja corta por owner).
do $harness$
declare gid text; v numeric;
begin
  gid := (select _ids.v from _ids where k = 'g');
  if gid is null then
    insert into _r(info) values ('DEPOIS | G (agent) | sem profile de agent, pulado');
    return;
  end if;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', gid, 'role', 'authenticated')::text);
  begin
    select round(sum(provider_cost_usd), 4) into v from public.token_usage_log;
    insert into _r(info) values ('DEPOIS | G (agent) le provider_cost_usd | PASSOU <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | G (agent) le provider_cost_usd | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- anon: sem grant nenhum de volta.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $harness$
declare n bigint;
begin
  begin
    select count(*) into n from public.token_usage_log;
    insert into _r(info) values ('DEPOIS | anon conta token_usage_log | PASSOU linhas=' || n::text || ' <== FALHA DO ARNES');
  exception when others then
    insert into _r(info) values ('DEPOIS | anon conta token_usage_log | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- service_role: crons e edge functions precisam continuar lendo e gravando.
set local role service_role;
do $harness$
declare v numeric;
begin
  begin
    select round(sum(provider_cost_usd), 4) into v from public.token_usage_log;
    insert into _r(info) values ('DEPOIS | LEGITIMO service_role le provider_cost_usd | US$ ' || coalesce(v::text, 'null'));
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO service_role le provider_cost_usd | BLOQUEADO ' || sqlstate);
  end;
  begin
    insert into public.token_usage_log(owner_id, function_name, model, prompt_tokens,
        completion_tokens, total_tokens, cost_usd, provider_cost_usd, markup_applied, source)
    values ((select _ids.v from _ids where k = 'a')::uuid, 'arnes', 'gpt-test',
            1, 1, 2, 0.0001, 0.00008, 0.30, 'arnes');
    insert into _r(info) values ('DEPOIS | LEGITIMO service_role grava consumo | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO service_role grava consumo | BLOQUEADO ' || sqlstate || ' ' || sqlerrm);
  end;
end $harness$;

reset role;

insert into _r(info)
select 'DEPOIS | grant SELECT que sobrou p/ authenticated em token_usage_log | ' ||
       coalesce(string_agg(column_name, ',' order by column_name), 'NENHUMA')
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'token_usage_log'
  and grantee = 'authenticated' and privilege_type = 'SELECT';

insert into _r(info)
select 'DEPOIS | grant SELECT que sobrou p/ anon em token_usage_log | ' ||
       coalesce(string_agg(column_name, ',' order by column_name), 'NENHUMA')
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'token_usage_log'
  and grantee = 'anon' and privilege_type = 'SELECT';

insert into _r(info)
select 'DEPOIS | profiles.markup ainda legivel por | ' ||
       coalesce(string_agg(grantee, ','), 'NINGUEM alem de postgres/service_role')
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and column_name = 'markup' and privilege_type = 'SELECT'
  and grantee in ('anon', 'authenticated');

select info from _r order by ord;

rollback;
