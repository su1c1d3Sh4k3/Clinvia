-- ARNES do lote 0.3 (#3, #6, #11, #12): mede o acesso ANTES, aplica a
-- migration na MESMA transacao, mede DEPOIS e termina em ROLLBACK.
-- Nada toca producao.
begin;

set local lock_timeout = '5s';

create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated, anon;
grant all on sequence _r_ord_seq to authenticated, anon;
grant all on _ids to authenticated, anon;

-- Personas: A = PELE (tenant grande, ativo), B = tenant de dev,
-- S = staff da plataforma (admin_users ativo) -- so ele deve ler llm_model_prices.
insert into _ids(k, v) values
  ('a', 'e697878e-29c9-4b7e-88bb-869f4f2c76af'),
  ('b', '3e21175c-b183-4041-b375-eacb292e8d41');

insert into _ids(k, v)
select 's', a.auth_user_id::text from public.admin_users a
where a.is_active and a.auth_user_id is not null limit 1;

insert into _r(info)
select 'setup | ' || k || ' = ' || coalesce(v, 'NULO') from _ids order by k;

-- Volume real por tabela, visto sem RLS (baseline do que ESTA la).
insert into _r(info)
select 'setup | linhas reais | backup=' || (select count(*) from public.contacts_merge_backup_20260901)::text
  || ' split_audit=' || (select count(*) from public.crm_client_channel_split_audit)::text
  || ' opportunities=' || (select count(*) from public.opportunities)::text
  || ' notifications=' || (select count(*) from public.notifications)::text
  || ' dados_atendimento=' || (select count(*) from public.dados_atendimento)::text
  || ' llm_model_prices=' || (select count(*) from public.llm_model_prices)::text
  || ' team_costs=' || (select count(*) from public.team_costs)::text
  || ' _reminder_log=' || (select count(*) from public._reminder_log)::text;
