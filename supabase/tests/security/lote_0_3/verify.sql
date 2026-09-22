-- Verify pos-apply do lote 0.3 contra o estado REAL. Termina em rollback.
begin;

create temp table _r(ord int, info text);
grant all on _r to authenticated, anon, service_role;

-- ============ estrutura ============
insert into _r
select 1, 'SCHEMA PRIVATE | existe=' || count(*)::text from pg_namespace where nspname = 'private';

insert into _r
select 1, 'SCHEMA PRIVATE | grant ' || pg_get_userbyid(ac.grantee) || '=' || ac.privilege_type
from pg_namespace n
cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) ac
where n.nspname = 'private' and pg_get_userbyid(ac.grantee) in ('anon','authenticated','service_role');

insert into _r
select 2, 'TABELA MOVIDA | ' || n.nspname || '.' || c.relname
  || ' | rls=' || c.relrowsecurity::text
  || ' | policies=' || (select count(*) from pg_policies p
                         where p.schemaname = n.nspname and p.tablename = c.relname)::text
  || ' | grants_front=' || (
       select count(*) from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        where pg_get_userbyid(a.grantee) in ('anon','authenticated'))::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('contacts_merge_backup_20260901','crm_client_channel_split_audit','_reminder_log');

insert into _r
select 3, 'POLICY | ' || tablename || ' | ' || policyname || ' | ' || cmd
  || ' | using=' || coalesce(qual, '(nenhum)')
  || ' | check=' || coalesce(with_check, '(nenhum)')
from pg_policies
where schemaname = 'public'
  and tablename in ('team_costs','opportunities','notifications','dados_atendimento','llm_model_prices');

-- ============ personas ============
do $$
declare
  v_admin uuid := (select p.id from public.profiles p where p.role = 'admin'
                    and p.email is not null order by p.created_at limit 1);
  n bigint;
begin
  insert into _r values (4, 'PERSONA ADMIN DE TENANT | ' || coalesce(v_admin::text, '(nenhum)'));

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- leituras legitimas que o front faz
  begin
    execute 'select count(*) from public.notifications' into n;
    insert into _r values (5, 'LEGITIMO | le notifications | linhas=' || n);
  exception when others then
    insert into _r values (5, 'LEGITIMO | le notifications | FALHOU ' || sqlstate || ' ' || sqlerrm);
  end;

  begin
    execute 'select count(*) from public.opportunities' into n;
    insert into _r values (5, 'LEGITIMO | le opportunities | linhas=' || n);
  exception when others then
    insert into _r values (5, 'LEGITIMO | le opportunities | FALHOU ' || sqlstate);
  end;

  begin
    execute 'select count(*) from public.team_costs' into n;
    insert into _r values (5, 'LEGITIMO | le team_costs | linhas=' || n);
  exception when others then
    insert into _r values (5, 'LEGITIMO | le team_costs | FALHOU ' || sqlstate);
  end;

  -- ataques que o lote fecha
  begin
    execute 'select count(*) from private.contacts_merge_backup_20260901' into n;
    insert into _r values (6, 'ATAQUE | le backup de contatos | PASSOU linhas=' || n);
  exception when others then
    insert into _r values (6, 'ATAQUE | le backup de contatos | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from public.llm_model_prices' into n;
    if n = 0 then
      insert into _r values (6, 'ATAQUE | le preco de custo do provedor | BLOQUEADO (0 linhas por policy)');
    else
      insert into _r values (6, 'ATAQUE | le preco de custo do provedor | PASSOU linhas=' || n);
    end if;
  exception when others then
    insert into _r values (6, 'ATAQUE | le preco de custo do provedor | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'insert into public.notifications(user_id, type, title, description)
             values (''00000000-0000-0000-0000-000000000001'', ''task_created'',
                     ''forjada pelo arnes'', ''nao deveria entrar'')';
    insert into _r values (6, 'ATAQUE | forja notificacao em outra conta | PASSOU');
  exception when others then
    insert into _r values (6, 'ATAQUE | forja notificacao em outra conta | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from public._reminder_log' into n;
    insert into _r values (6, 'ATAQUE | le _reminder_log | PASSOU linhas=' || n);
  exception when others then
    insert into _r values (6, 'ATAQUE | le _reminder_log | BLOQUEADO ' || sqlstate);
  end;

  reset role;

  -- anon
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  begin
    execute 'select count(*) from private.crm_client_channel_split_audit' into n;
    insert into _r values (7, 'ANON | le auditoria de split | PASSOU linhas=' || n);
  exception when others then
    insert into _r values (7, 'ANON | le auditoria de split | BLOQUEADO ' || sqlstate);
  end;
  reset role;
end $$;

-- service_role continua enxergando (as edge functions dependem disso)
do $$
declare n bigint;
begin
  set local role service_role;
  begin
    execute 'select count(*) from public.llm_model_prices' into n;
    insert into _r values (8, 'SERVICE_ROLE | llm_model_prices | linhas=' || n);
  exception when others then
    insert into _r values (8, 'SERVICE_ROLE | llm_model_prices | FALHOU ' || sqlstate);
  end;
  begin
    execute 'select count(*) from private.contacts_merge_backup_20260901' into n;
    insert into _r values (8, 'SERVICE_ROLE | backup de contatos | linhas=' || n);
  exception when others then
    insert into _r values (8, 'SERVICE_ROLE | backup de contatos | FALHOU ' || sqlstate);
  end;
  reset role;
end $$;

select info from _r order by ord, info;

rollback;
