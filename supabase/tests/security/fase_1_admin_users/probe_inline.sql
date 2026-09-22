-- Onde 'super-admin' aparece LITERAL (fora de is_super_admin()): policies e funcoes.
select info from (
  select 1 as ord, 'POLICY | ' || schemaname || '.' || tablename || ' | ' || policyname
         || ' | ' || cmd || ' | roles=' || array_to_string(roles, ',')
         || E'\n  using=' || coalesce(qual, '-')
         || E'\n  check=' || coalesce(with_check, '-') as info
  from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~* 'super-admin'
  union all
  select 2, 'FN | ' || p.proname || E'\n  ' || l.line
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  cross join lateral (
    select string_agg(t, E'\n  ') as line
    from unnest(string_to_array(p.prosrc, E'\n')) t
    where t ~* 'super-admin'
  ) l
  where p.prosrc ~* '''super-admin''' and p.proname <> 'is_super_admin'
) s order by ord, info;
