-- Teste de acesso a public.token_usage_log (migration 20260923110000).
-- O MESMO arquivo roda antes e depois: ele mede o estado real e nao assume nada.
-- Termina em rollback; nenhuma linha e criada de verdade.
--
-- TRUNCATE nao e executado de proposito: mesmo dentro de transacao revertida ele pega
-- ACCESS EXCLUSIVE numa tabela quente de producao. Aqui se checa o PRIVILEGIO, que e o
-- que importa — TRUNCATE nao passa por RLS, entao ter o privilegio ja e o furo.
begin;

create temp table _r(ord int, info text);
grant all on _r to authenticated, anon, service_role;

-- 1. Privilegios de TABELA
insert into _r
select 1, 'GRANT DE TABELA | ' || pg_get_userbyid(ac.grantee) || ' | '
  || string_agg(distinct ac.privilege_type, ',' order by ac.privilege_type)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) ac
where n.nspname = 'public' and c.relname = 'token_usage_log'
  and pg_get_userbyid(ac.grantee) in ('anon','authenticated','service_role')
group by pg_get_userbyid(ac.grantee);

-- 2. Privilegios de COLUNA (o revoke de tabela derruba os de coluna junto)
insert into _r
select 2, 'GRANT DE COLUNA | ' || pg_get_userbyid(ac.grantee) || ' | '
  || ac.privilege_type || ' | ' || count(*)::text || ' colunas'
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(a.attacl) ac
where a.attacl is not null
  and n.nspname = 'public' and c.relname = 'token_usage_log'
  and pg_get_userbyid(ac.grantee) in ('anon','authenticated')
group by pg_get_userbyid(ac.grantee), ac.privilege_type;

-- 3. TRUNCATE: privilegio, nao execucao
insert into _r values
  (3, 'TRUNCATE (nao passa por RLS) | anon=' ||
      has_table_privilege('anon', 'public.token_usage_log', 'TRUNCATE')::text ||
      ' | authenticated=' ||
      has_table_privilege('authenticated', 'public.token_usage_log', 'TRUNCATE')::text ||
      ' | service_role=' ||
      has_table_privilege('service_role', 'public.token_usage_log', 'TRUNCATE')::text);

-- 4. As 5 colunas sensiveis, coluna a coluna
insert into _r
select 4, 'SENSIVEL | ' || c.column_name
  || ' | anon_sel=' || has_column_privilege('anon', 'public.token_usage_log', c.column_name, 'SELECT')::text
  || ' | auth_sel=' || has_column_privilege('authenticated', 'public.token_usage_log', c.column_name, 'SELECT')::text
  || ' | auth_upd=' || has_column_privilege('authenticated', 'public.token_usage_log', c.column_name, 'UPDATE')::text
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'token_usage_log'
  and c.column_name in ('provider_cost_usd','markup_applied','cost_usd_original',
                        'cost_brl_original','cache_ratio_applied');

-- 5. Ataques e leituras legitimas, por persona
do $$
declare
  v_owner uuid := (select owner_id from public.token_usage_log
                    where owner_id is not null order by created_at desc limit 1);
  persona text;
  n bigint;
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

    -- ataque: ler o custo real do provedor e a margem
    begin
      execute 'select count(*) from (select provider_cost_usd, markup_applied,
                 cost_usd_original, cost_brl_original, cache_ratio_applied
                 from public.token_usage_log limit 1) s' into n;
      insert into _r values (5, persona || ' | le colunas sensiveis | PASSOU');
    exception when others then
      insert into _r values (5, persona || ' | le colunas sensiveis | BLOQUEADO ' || sqlstate);
    end;

    -- ataque classico: select estrela
    begin
      execute 'select count(*) from (select * from public.token_usage_log limit 1) s' into n;
      insert into _r values (5, persona || ' | select * | PASSOU');
    exception when others then
      insert into _r values (5, persona || ' | select * | BLOQUEADO ' || sqlstate);
    end;

    -- ataque: forjar consumo de outra conta
    begin
      execute 'insert into public.token_usage_log (owner_id, source, model, function_name, total_tokens)
               values (gen_random_uuid(), ''n8n'', ''gpt-4o-mini'', ''__teste__'', 1)';
      insert into _r values (5, persona || ' | insert forjado | PASSOU');
    exception when others then
      insert into _r values (5, persona || ' | insert forjado | BLOQUEADO ' || sqlstate);
    end;

    -- ataque: zerar a propria fatura
    begin
      execute 'update public.token_usage_log set cost_brl = 0, total_tokens = 0';
      get diagnostics n = row_count;
      insert into _r values (5, persona || ' | update zerando custo | PASSOU, ' || n || ' linhas');
    exception when others then
      insert into _r values (5, persona || ' | update zerando custo | BLOQUEADO ' || sqlstate);
    end;

    -- ataque: apagar o rastro
    begin
      execute 'delete from public.token_usage_log';
      get diagnostics n = row_count;
      insert into _r values (5, persona || ' | delete | PASSOU, ' || n || ' linhas');
    exception when others then
      insert into _r values (5, persona || ' | delete | BLOQUEADO ' || sqlstate);
    end;

    -- leitura legitima: as 22 colunas nao sensiveis (o que o PostgREST expoe hoje)
    begin
      execute 'select count(*) from (select id, owner_id, team_member_id, source, model,
                 function_name, workflow_id, execution_id, usage_key, calls, billable,
                 prompt_tokens, completion_tokens, total_tokens, cached_prompt_tokens,
                 cached_tokens_source, tokens_estimated, price_fallback, cost_usd,
                 cost_brl, exchange_rate, created_at
                 from public.token_usage_log) s' into n;
      insert into _r values (6, persona || ' | le as 22 colunas liberadas | linhas=' || n);
    exception when others then
      insert into _r values (6, persona || ' | le as 22 colunas liberadas | FALHOU '
        || sqlstate || ' ' || sqlerrm);
    end;
  end loop;

  -- 7. Caminho real do produto: as RPCs SECURITY DEFINER continuam funcionando?
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin
    perform public.get_my_token_stats();
    insert into _r values (7, 'DONO | RPC get_my_token_stats | OK');
  exception when others then
    insert into _r values (7, 'DONO | RPC get_my_token_stats | FALHOU ' || sqlstate || ' ' || sqlerrm);
  end;

  -- 8. Escrita de producao (edge functions) intacta?
  reset role;
  set local role service_role;
  begin
    execute 'insert into public.token_usage_log (owner_id, source, model, function_name, total_tokens)
             values ($1, ''sistema'', ''__teste_privilegio__'', ''__teste__'', 1)' using v_owner;
    insert into _r values (8, 'SERVICE_ROLE | insert | OK');
  exception when others then
    insert into _r values (8, 'SERVICE_ROLE | insert | FALHOU ' || sqlstate);
  end;
  begin
    execute 'select count(*) from (select provider_cost_usd from public.token_usage_log limit 1) s' into n;
    insert into _r values (8, 'SERVICE_ROLE | le colunas sensiveis | OK');
  exception when others then
    insert into _r values (8, 'SERVICE_ROLE | le colunas sensiveis | FALHOU ' || sqlstate);
  end;
  reset role;
end $$;

select info from _r order by ord, info;

rollback;
