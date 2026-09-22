-- Verificacao POS-APPLY do item 0.5 contra o estado REAL de producao.
-- Toda escrita de teste acontece dentro de transacao que termina em rollback.
begin;

set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;
grant all on _ids to authenticated, anon, service_role;

insert into _ids(k, v)
select 'a', p.id::text from public.profiles p
where p.id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af' and p.role = 'admin';

insert into _ids(k, v)
select 'g', p.id::text from public.profiles p where p.role = 'agent' limit 1;

insert into _r(info)
select 'GRANT TABELA | ' || rpad(grantee, 16) || ' | '
       || string_agg(distinct privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee;

insert into _r(info)
select 'GRANT UPDATE COLUNA | ' || grantee || ' | ' || count(*)::text || ' colunas | '
       || string_agg(column_name, ',' order by column_name)
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('anon', 'authenticated') and privilege_type = 'UPDATE'
group by grantee;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

do $v$
declare n bigint;
begin
  begin
    update public.profiles set role = 'super-admin'
    where id = (select v from _ids where k = 'a')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ATAQUE | se promove a super-admin | AINDA PASSA linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ATAQUE | se promove a super-admin | BLOQUEADO ' || sqlstate);
  end;

  insert into _r(info)
  select 'ATAQUE | is_super_admin()=' || public.is_super_admin()::text
         || ' is_admin_staff()=' || public.is_admin_staff()::text;

  begin
    update public.profiles set markup = 0 where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('ATAQUE | zera markup | AINDA PASSA');
  exception when others then
    insert into _r(info) values ('ATAQUE | zera markup | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set tokens_total = 0, tokens_monthly = 0,
           approximate_cost_total = 0, audio_cost_total = 0
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('ATAQUE | zera consumo de tokens | AINDA PASSA');
  exception when others then
    insert into _r(info) values ('ATAQUE | zera consumo de tokens | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set openai_spend_limit_usd = 999999, openai_token = 'sk-x',
           openai_key_source = 'platform'
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('ATAQUE | eleva limite OpenAI | AINDA PASSA');
  exception when others then
    insert into _r(info) values ('ATAQUE | eleva limite OpenAI | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set status = 'ativo', deactivated_at = null,
           deletion_warning_sent_at = null
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('ATAQUE | reativa conta / adia exclusao | AINDA PASSA');
  exception when others then
    insert into _r(info) values ('ATAQUE | reativa conta | BLOQUEADO ' || sqlstate);
  end;

  -- ===== caminhos LEGITIMOS do front =====
  begin
    update public.profiles set full_name = full_name, phone = phone, address = address,
           instagram = instagram, avatar_url = avatar_url, email = email, updated_at = now()
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('LEGITIMO | cadastro proprio | PASSOU');
  exception when others then
    insert into _r(info) values ('LEGITIMO | cadastro proprio | QUEBROU ' || sqlstate);
  end;

  begin
    insert into public.profiles(id, company_name, updated_at)
    values ((select v from _ids where k = 'a')::uuid,
            (select company_name from public.profiles where id = (select v from _ids where k='a')::uuid),
            now())
    on conflict (id) do update
      set id = excluded.id, company_name = excluded.company_name,
          updated_at = excluded.updated_at;
    insert into _r(info) values ('LEGITIMO | Settings.updateCompany (upsert) | PASSOU');
  exception when others then
    insert into _r(info) values ('LEGITIMO | Settings.updateCompany (upsert) | QUEBROU ' || sqlstate);
  end;

  begin
    update public.profiles set financial_access = financial_access,
           notifications_enabled = notifications_enabled,
           group_notifications_enabled = group_notifications_enabled,
           must_change_password = must_change_password
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('LEGITIMO | financial_access/notificacoes/senha | PASSOU');
  exception when others then
    insert into _r(info) values ('LEGITIMO | financial_access/notificacoes/senha | QUEBROU ' || sqlstate);
  end;

  begin
    update public.profiles set auto_close_enabled = auto_close_enabled,
           auto_close_warning_minutes = auto_close_warning_minutes,
           auto_close_final_minutes = auto_close_final_minutes,
           auto_close_warning_message = auto_close_warning_message,
           auto_close_final_message = auto_close_final_message,
           auto_close_no_interaction_enabled = auto_close_no_interaction_enabled,
           auto_close_no_interaction_hours = auto_close_no_interaction_hours,
           auto_close_no_interaction_include_customer = auto_close_no_interaction_include_customer
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('LEGITIMO | AutoCloseSettings | PASSOU');
  exception when others then
    insert into _r(info) values ('LEGITIMO | AutoCloseSettings | QUEBROU ' || sqlstate);
  end;

  begin
    update public.profiles set recurrence_dispatch_hour = recurrence_dispatch_hour,
           recurrence_campaign_duration_days = recurrence_campaign_duration_days,
           recurrence_default_msg_1 = recurrence_default_msg_1,
           recurrence_default_msg_2 = recurrence_default_msg_2,
           recurrence_default_msg_3 = recurrence_default_msg_3
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('LEGITIMO | Recorrencia | PASSOU');
  exception when others then
    insert into _r(info) values ('LEGITIMO | Recorrencia | QUEBROU ' || sqlstate);
  end;

  begin
    update public.profiles set orcamento_header_url = orcamento_header_url,
           orcamento_footer_text = orcamento_footer_text
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('LEGITIMO | branding do orcamento | PASSOU');
  exception when others then
    insert into _r(info) values ('LEGITIMO | branding do orcamento | QUEBROU ' || sqlstate);
  end;
end $v$;

reset role;

do $v$
declare gid text; n bigint;
begin
  gid := (select v from _ids where k = 'g');
  if gid is null then return; end if;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', gid, 'role', 'authenticated')::text);
  begin
    update public.profiles set role = 'super-admin' where id = gid::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ATAQUE | agent se promove a super-admin | AINDA PASSA linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ATAQUE | agent se promove a super-admin | BLOQUEADO ' || sqlstate);
  end;
end $v$;

reset role;

set local role service_role;
do $v$
begin
  begin
    update public.profiles set tokens_total = tokens_total
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('service_role | escreve tokens_total | PASSOU');
  exception when others then
    insert into _r(info) values ('service_role | escreve tokens_total | QUEBROU ' || sqlstate);
  end;
end $v$;

reset role;

-- Funcao SECURITY DEFINER que soma tokens continua funcionando.
do $v$
begin
  begin
    perform public.increment_profile_token_usage(
      (select v from _ids where k = 'a')::uuid, 0, 0, 0, 0);
    insert into _r(info) values ('SECDEF | increment_profile_token_usage | PASSOU');
  exception when others then
    insert into _r(info) values ('SECDEF | increment_profile_token_usage | ' || sqlstate || ' ' || sqlerrm);
  end;
end $v$;

select info from _r order by ord;

rollback;
