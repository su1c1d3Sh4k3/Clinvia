
reset role;

-- As duas tabelas de backup mudam de schema no meio da transacao; resolver o
-- nome aqui (como superuser) e usar dynamic SQL depois evita erro de parse e
-- deixa o "permission denied for schema private" aparecer como resultado.
delete from _ids where k in ('rel_backup', 'rel_audit');
insert into _ids(k, v) values
  ('rel_backup', coalesce(to_regclass('public.contacts_merge_backup_20260901')::text,
                          to_regclass('private.contacts_merge_backup_20260901')::text, 'sumiu')),
  ('rel_audit',  coalesce(to_regclass('public.crm_client_channel_split_audit')::text,
                          to_regclass('private.crm_client_channel_split_audit')::text, 'sumiu'));

insert into _r(info)
select '@FASE@ | nome da tabela | ' || k || ' = ' || v from _ids
where k in ('rel_backup', 'rel_audit');

insert into _r(info)
select '@FASE@ | policies | ' || rpad(tablename, 20) || ' = ' || count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename in ('team_costs', 'opportunities', 'notifications',
                    'dados_atendimento', 'llm_model_prices', '_reminder_log')
group by tablename order by tablename;

insert into _r(info)
select '@FASE@ | rls ligada | ' || rpad(c.relname, 34) || ' = ' || c.relrowsecurity::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('_reminder_log', 'contacts_merge_backup_20260901',
                    'crm_client_channel_split_audit')
  and n.nspname in ('public', 'private');

-- ===========================================================================
-- anon (chave publica do bundle, sem login)
-- ===========================================================================
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $harness$
declare n bigint;
begin
  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_backup') into n;
    insert into _r(info) values ('@FASE@ | anon le backup de contatos | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | anon le backup de contatos | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('@FASE@ | anon le auditoria do split | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | anon le auditoria do split | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public._reminder_log;
    insert into _r(info) values ('@FASE@ | anon le _reminder_log | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | anon le _reminder_log | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('@FASE@ | anon le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | anon le precos de LLM | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('@FASE@ | anon le opportunities | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | anon le opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('@FASE@ | anon le notifications | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | anon le notifications | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.team_costs;
    insert into _r(info) values ('@FASE@ | anon le team_costs | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | anon le team_costs | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_@FASE@_anon',
            (select v from _ids where k='a')::uuid);
    insert into _r(info) values ('@FASE@ | anon forja notificacao na conta de A | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | anon forja notificacao na conta de A | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Tenant A (PELE, dono/admin da propria conta)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

do $harness$
declare n bigint;
begin
  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_backup') into n;
    insert into _r(info) values ('@FASE@ | A le backup de contatos (137 sao de outro tenant) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A le backup de contatos | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('@FASE@ | A le auditoria do split | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A le auditoria do split | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('@FASE@ | A le opportunities (as 15 sao de B) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A le opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.opportunities set updated_at = updated_at
    where user_id = (select v from _ids where k='b')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('@FASE@ | A altera opportunities de B | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A altera opportunities de B | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('@FASE@ | A le precos de LLM (custo do provedor) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A le precos de LLM | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('@FASE@ | A le as proprias notificacoes | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A le as proprias notificacoes | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_@FASE@_a_em_b', (select v from _ids where k='b')::uuid);
    insert into _r(info) values ('@FASE@ | A forja notificacao na conta de B | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | A forja notificacao na conta de B | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_@FASE@_a_ok', (select v from _ids where k='a')::uuid);
    insert into _r(info) values ('@FASE@ | A cria notificacao na propria conta | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | A cria notificacao na propria conta | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.team_costs;
    insert into _r(info) values ('@FASE@ | A le team_costs | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A le team_costs | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.dados_atendimento;
    insert into _r(info) values ('@FASE@ | A le dados_atendimento (tabela vazia) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A le dados_atendimento | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public._reminder_log;
    insert into _r(info) values ('@FASE@ | A le _reminder_log | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | A le _reminder_log | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Tenant B (dev) -- dono das 15 opportunities: NAO pode perder o que e dele
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"3e21175c-b183-4041-b375-eacb292e8d41","role":"authenticated"}';

do $harness$
declare n bigint;
begin
  begin
    select count(*) into n from public.opportunities;
    insert into _r(info) values ('@FASE@ | B le as proprias opportunities (15) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | B le as proprias opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.opportunities set updated_at = updated_at
    where user_id = (select v from _ids where k='b')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('@FASE@ | B altera as proprias opportunities | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | B altera as proprias opportunities | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.notifications;
    insert into _r(info) values ('@FASE@ | B le as proprias notificacoes (350) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | B le as proprias notificacoes | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.notifications(type, title, user_id)
    values ('task_created', '_arnes_@FASE@_b_ok', (select v from _ids where k='b')::uuid);
    insert into _r(info) values ('@FASE@ | B cria notificacao na propria conta | PASSOU');
  exception when others then
    insert into _r(info) values ('@FASE@ | B cria notificacao na propria conta | BLOQUEADO ' || sqlstate);
  end;

  begin
    execute 'select count(*) from ' || (select v from _ids where k='rel_audit') into n;
    insert into _r(info) values ('@FASE@ | B le auditoria do split de A (177) | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | B le auditoria do split de A | BLOQUEADO ' || sqlstate);
  end;

  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('@FASE@ | B le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | B le precos de LLM | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- ===========================================================================
-- Staff da plataforma (admin_users ativo): e o unico que deve ver o custo do
-- provedor depois do lote.
-- ===========================================================================
do $harness$
declare n bigint; sid text;
begin
  sid := (select v from _ids where k='s');
  if sid is null then
    insert into _r(info) values ('@FASE@ | S staff | SEM admin_users ativo, teste pulado');
    return;
  end if;
  execute format('set local role authenticated');
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', sid, 'role', 'authenticated')::text);
  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('@FASE@ | S (staff) le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('@FASE@ | S (staff) le precos de LLM | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;
insert into _r(info) select 'tempo | @FASE@ fim | ' || to_char(clock_timestamp(), 'HH24:MI:SS.MS');
