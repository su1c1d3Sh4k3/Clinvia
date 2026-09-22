-- llm_model_prices depois do lote: super-admin (is_admin_staff) ainda le?
begin;
create temp table _r(ord serial, info text) on commit drop;
create temp table _ids(k text primary key, v text) on commit drop;
grant all on _r to authenticated;
grant all on sequence _r_ord_seq to authenticated;
grant all on _ids to authenticated;

insert into _ids(k, v)
select 'sa', p.id::text from public.profiles p where p.role = 'super-admin' limit 1;

insert into _r(info)
select 'SUPER-ADMINS = ' || count(*)::text from public.profiles where role = 'super-admin';

drop policy if exists "llm_model_prices_read" on public.llm_model_prices;
create policy "llm_model_prices_read" on public.llm_model_prices
  for select to authenticated using (public.is_admin_staff());

do $h$
declare n bigint; sid text;
begin
  sid := (select v from _ids where k='sa');
  if sid is null then
    insert into _r(info) values ('SEM super-admin, teste pulado');
    return;
  end if;
  insert into _r(info) values ('super-admin usado = ' || sid);
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', sid, 'role', 'authenticated')::text);
  begin
    select count(*) into n from public.llm_model_prices;
    insert into _r(info) values ('DEPOIS | super-admin le precos de LLM | linhas=' || n::text);
  exception when others then
    insert into _r(info) values ('DEPOIS | super-admin le precos de LLM | BLOQUEADO ' || sqlstate);
  end;
end $h$;

reset role;
select info from _r order by ord;
rollback;
