-- ARNES do item 0.5: escalonamento de privilegio via UPDATE na propria linha de
-- profiles. Mede ANTES, aplica o revoke de coluna na MESMA transacao, mede
-- DEPOIS e termina em ROLLBACK. Nada toca producao.
begin;

set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated, anon, service_role;
grant all on sequence _r_ord_seq to authenticated, anon, service_role;
grant all on _ids to authenticated, anon, service_role;

-- A = dono/admin comum (PELE). G = usuario com role 'agent' que tem linha em
-- profiles (2 existem).
insert into _ids(k, v)
select 'a', p.id::text from public.profiles p
where p.id = 'e697878e-29c9-4b7e-88bb-869f4f2c76af' and p.role = 'admin';

insert into _ids(k, v)
select 'a', p.id::text from public.profiles p
where p.role = 'admin' and not exists (select 1 from _ids where k = 'a') limit 1;

insert into _ids(k, v)
select 'g', p.id::text from public.profiles p where p.role = 'agent' limit 1;

insert into _ids(k, v)
select 'outro', p.id::text from public.profiles p
where p.role = 'admin' and p.id::text <> (select v from _ids where k = 'a') limit 1;

insert into _r(info)
select 'setup | ' || k || ' = ' || coalesce(v, 'NULO') from _ids order by k;

insert into _r(info)
select 'setup | A antes | role=' || p.role || ' status=' || coalesce(p.status, '-')
       || ' markup=' || coalesce(p.markup::text, '-')
       || ' tokens_total=' || coalesce(p.tokens_total::text, '-')
from public.profiles p where p.id::text = (select v from _ids where k = 'a');

-- ===========================================================================
-- FASE ANTES
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

do $harness$
declare n bigint;
begin
  begin
    update public.profiles set role = 'super-admin'
    where id = (select v from _ids where k = 'a')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | A se promove a super-admin | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A se promove a super-admin | BLOQUEADO ' || sqlstate);
  end;

  -- O que a promocao destrava de fato.
  insert into _r(info)
  select 'ANTES | A agora e is_super_admin()=' || public.is_super_admin()::text
         || ' is_admin_staff()=' || public.is_admin_staff()::text;

  begin
    update public.profiles set markup = 0
    where id = (select v from _ids where k = 'a')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | A zera o proprio markup | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A zera o proprio markup | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set tokens_total = 0, tokens_monthly = 0,
           approximate_cost_total = 0, approximate_cost_monthly = 0,
           audio_cost_total = 0, audio_cost_monthly = 0
    where id = (select v from _ids where k = 'a')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | A zera o proprio consumo de tokens | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A zera o proprio consumo | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set openai_spend_limit_usd = 999999,
           openai_key_source = 'platform', openai_token = 'sk-arnes'
    where id = (select v from _ids where k = 'a')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | A eleva o proprio limite de gasto OpenAI | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A eleva o limite de gasto OpenAI | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set status = 'ativo', deactivated_at = null,
           deletion_warning_sent_at = null
    where id = (select v from _ids where k = 'a')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | A reativa a propria conta / adia exclusao | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A reativa a propria conta | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set role = 'agent'
    where id = (select v from _ids where k = 'outro')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | A rebaixa OUTRO tenant | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | A rebaixa OUTRO tenant | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- Desfaz a promocao para a fase DEPOIS medir do mesmo ponto de partida.
update public.profiles set role = 'admin', markup = (select markup from public.profiles where id = (select v from _ids where k='outro')::uuid)
where id = (select v from _ids where k = 'a')::uuid;

-- Agente com linha em profiles.
do $harness$
declare gid text; n bigint;
begin
  gid := (select v from _ids where k = 'g');
  if gid is null then
    insert into _r(info) values ('ANTES | G (agent) | sem profile de agent, teste pulado');
    return;
  end if;
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', gid, 'role', 'authenticated')::text);
  begin
    update public.profiles set role = 'super-admin' where id = gid::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | G (agent) se promove a super-admin | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | G (agent) se promove a super-admin | BLOQUEADO ' || sqlstate);
  end;
  begin
    update public.profiles set financial_access = true where id = gid::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('ANTES | G (agent) se da financial_access | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('ANTES | G (agent) se da financial_access | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;
update public.profiles set role = 'agent'
where id::text = (select v from _ids where k = 'g');

-- ===========================================================================
-- APPLY DO REVOKE (mesma transacao)
-- ===========================================================================
-- Privilegio de COLUNA nao vence GRANT de TABELA: `revoke update (col)` e
-- silenciosamente inocuo enquanto existir `grant update on profiles`. Tem de
-- tirar o privilegio da tabela e devolver coluna por coluna.
revoke update on public.profiles from authenticated, anon;

grant update (
  id, full_name, avatar_url, company_name, phone, address, email, instagram,
  notifications_enabled, group_notifications_enabled, financial_access,
  must_change_password, updated_at,
  recurrence_dispatch_hour, recurrence_campaign_duration_days,
  recurrence_default_msg_1, recurrence_default_msg_2, recurrence_default_msg_3,
  auto_close_enabled, auto_close_warning_minutes, auto_close_final_minutes,
  auto_close_warning_message, auto_close_final_message,
  auto_close_no_interaction_enabled, auto_close_no_interaction_hours,
  auto_close_no_interaction_include_customer,
  orcamento_header_url, orcamento_footer_text
) on public.profiles to authenticated;

-- ===========================================================================
-- FASE DEPOIS
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e697878e-29c9-4b7e-88bb-869f4f2c76af","role":"authenticated"}';

do $harness$
declare n bigint;
begin
  begin
    update public.profiles set role = 'super-admin'
    where id = (select v from _ids where k = 'a')::uuid;
    get diagnostics n = row_count;
    insert into _r(info) values ('DEPOIS | A se promove a super-admin | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | A se promove a super-admin | BLOQUEADO ' || sqlstate);
  end;

  insert into _r(info)
  select 'DEPOIS | A segue is_super_admin()=' || public.is_super_admin()::text
         || ' is_admin_staff()=' || public.is_admin_staff()::text;

  begin
    update public.profiles set markup = 0
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A zera o proprio markup | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | A zera o proprio markup | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set tokens_total = 0, approximate_cost_total = 0
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A zera o proprio consumo de tokens | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | A zera o proprio consumo | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set openai_spend_limit_usd = 999999, openai_token = 'sk-arnes'
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A eleva o proprio limite de gasto OpenAI | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | A eleva o limite de gasto OpenAI | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set status = 'ativo', deactivated_at = null
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | A reativa a propria conta | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | A reativa a propria conta | BLOQUEADO ' || sqlstate);
  end;

  -- ===== O que o front FAZ hoje e nao pode quebrar =====
  begin
    update public.profiles set full_name = 'Arnes 0.5', phone = '11999999999',
           address = 'rua x', instagram = '@x', avatar_url = 'http://x/y.png',
           email = (select email from public.profiles where id = (select v from _ids where k='a')::uuid),
           updated_at = now()
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | LEGITIMO cadastro proprio (nome/telefone/foto) | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO cadastro proprio | BLOQUEADO ' || sqlstate);
  end;

  begin
    insert into public.profiles(id, company_name, updated_at)
    values ((select v from _ids where k = 'a')::uuid, 'Arnes Clinica', now())
    on conflict (id) do update
      set id = excluded.id, company_name = excluded.company_name,
          updated_at = excluded.updated_at;
    insert into _r(info) values ('DEPOIS | LEGITIMO Settings.updateCompany (upsert) | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO Settings.updateCompany (upsert) | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set financial_access = true, notifications_enabled = true,
           group_notifications_enabled = true, must_change_password = false
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | LEGITIMO financial_access/notificacoes/senha | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO financial_access/notificacoes | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set auto_close_enabled = true, auto_close_warning_minutes = 10,
           auto_close_final_minutes = 20, auto_close_warning_message = 'x',
           auto_close_final_message = 'y', auto_close_no_interaction_enabled = true,
           auto_close_no_interaction_hours = 24,
           auto_close_no_interaction_include_customer = true
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | LEGITIMO AutoCloseSettings | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO AutoCloseSettings | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set recurrence_dispatch_hour = 9,
           recurrence_campaign_duration_days = 30,
           recurrence_default_msg_1 = 'a', recurrence_default_msg_2 = 'b',
           recurrence_default_msg_3 = 'c'
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | LEGITIMO Recorrencia (hora/dias/textos) | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO Recorrencia | BLOQUEADO ' || sqlstate);
  end;

  begin
    update public.profiles set orcamento_header_url = 'http://x/h.png',
           orcamento_footer_text = 'rodape'
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | LEGITIMO branding do orcamento | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | LEGITIMO branding do orcamento | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

do $harness$
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
    insert into _r(info) values ('DEPOIS | G (agent) se promove a super-admin | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | G (agent) se promove a super-admin | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- service_role (edge functions / crons) nao passa por privilegio revogado de
-- outro role, mas confirmar e barato.
set local role service_role;
do $harness$
begin
  begin
    update public.profiles set tokens_total = tokens_total
    where id = (select v from _ids where k = 'a')::uuid;
    insert into _r(info) values ('DEPOIS | service_role escreve tokens_total | PASSOU');
  exception when others then
    insert into _r(info) values ('DEPOIS | service_role escreve tokens_total | BLOQUEADO ' || sqlstate);
  end;
end $harness$;

reset role;

-- As funcoes SECURITY DEFINER que somam token continuam podendo escrever.
insert into _r(info)
select 'DEPOIS | grant UPDATE que sobrou para authenticated | '
       || string_agg(column_name, ',' order by column_name)
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type = 'UPDATE';

insert into _r(info) select 'DEPOIS | current_user=' || current_user || ' session_user=' || session_user;

select info from _r order by ord;

rollback;
