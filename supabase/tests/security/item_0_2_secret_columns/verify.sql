-- Verify pos-apply do bloqueio das colunas de segredo de profiles (20260922133000).
-- Mede contra o estado REAL e termina em rollback.
begin;

create temp table _r(ord int, info text);
grant all on _r to authenticated, anon, service_role;

insert into _r
select 1, 'GRANT DE TABELA | ' || pg_get_userbyid(ac.grantee) || ' | '
  || string_agg(distinct ac.privilege_type, ',' order by ac.privilege_type)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) ac
where n.nspname = 'public' and c.relname = 'profiles'
  and pg_get_userbyid(ac.grantee) in ('anon','authenticated')
group by pg_get_userbyid(ac.grantee);

insert into _r
select 2, 'COLUNAS COM SELECT | ' || pg_get_userbyid(ac.grantee)
  || ' | liberadas=' || count(*)::text
  || ' | secretas liberadas=' || count(*) filter (
       where a.attname in ('openai_token','openai_api_key_id','openai_service_account_id'))::text
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(a.attacl) ac
where a.attacl is not null and ac.privilege_type = 'SELECT'
  and n.nspname = 'public' and c.relname = 'profiles'
  and pg_get_userbyid(ac.grantee) in ('anon','authenticated')
group by pg_get_userbyid(ac.grantee);

insert into _r
select 3, 'TOTAL DE COLUNAS DE PROFILES | ' || count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles';

do $$
declare
  v_owner uuid := (select p.id from public.profiles p where p.role = 'admin'
                    order by p.created_at limit 1);
  persona text;
  n bigint;
  t text;
begin
  foreach persona in array array['DONO DA PROPRIA LINHA','ANON'] loop
    reset role;
    if persona = 'ANON' then
      set local role anon;
      perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
    else
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    end if;

    -- ataque: ler a chave (inclusive a propria)
    begin
      execute 'select openai_token from public.profiles limit 1' into t;
      insert into _r values (4, persona || ' | le openai_token | PASSOU '
        || coalesce(left(t, 12) || '...', '(null)'));
    exception when others then
      insert into _r values (4, persona || ' | le openai_token | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'select openai_api_key_id from public.profiles limit 1' into t;
      insert into _r values (4, persona || ' | le openai_api_key_id | PASSOU');
    exception when others then
      insert into _r values (4, persona || ' | le openai_api_key_id | BLOQUEADO ' || sqlstate);
    end;

    begin
      execute 'select openai_service_account_id from public.profiles limit 1' into t;
      insert into _r values (4, persona || ' | le openai_service_account_id | PASSOU');
    exception when others then
      insert into _r values (4, persona || ' | le openai_service_account_id | BLOQUEADO ' || sqlstate);
    end;

    -- ataque classico: select estrela
    begin
      execute 'select count(*) from (select * from public.profiles limit 1) s' into n;
      insert into _r values (4, persona || ' | select * | PASSOU');
    exception when others then
      insert into _r values (4, persona || ' | select * | BLOQUEADO ' || sqlstate);
    end;

    -- leituras legitimas que o front faz (colunas nomeadas)
    begin
      execute 'select count(*) from public.profiles' into n;
      insert into _r values (5, persona || ' | count(*) | linhas=' || n);
    exception when others then
      insert into _r values (5, persona || ' | count(*) | FALHOU ' || sqlstate);
    end;

    begin
      execute 'select count(*) from (select id, company_name, email, role, status,
                 financial_access, must_change_password, auto_close_enabled,
                 orcamento_header_url, openai_key_source, openai_spend_limit_usd,
                 openai_project_id, markup from public.profiles) s' into n;
      insert into _r values (5, persona || ' | colunas que o front le | linhas=' || n);
    exception when others then
      insert into _r values (5, persona || ' | colunas que o front le | FALHOU '
        || sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  reset role;
  set local role service_role;
  begin
    execute 'select openai_token from public.profiles where openai_token is not null limit 1' into t;
    insert into _r values (6, 'SERVICE_ROLE | le openai_token | '
      || case when t is null then 'sem chave gravada' else 'SIM (' || left(t, 8) || '...)' end);
  exception when others then
    insert into _r values (6, 'SERVICE_ROLE | le openai_token | FALHOU ' || sqlstate);
  end;
  reset role;
end $$;

select info from _r order by ord, info;

rollback;
