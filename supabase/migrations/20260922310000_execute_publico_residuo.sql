-- Fecha o residuo do EXECUTE para PUBLIC em duas funcoes que nasceram abertas.
--
-- `create function` concede EXECUTE a PUBLIC por padrao, e `revoke ... from anon`
-- NAO tira esse grant: PUBLIC continua valendo para todo mundo, inclusive `anon`.
-- Era o caso destas duas (medido: public=true, anon=true nas duas).
--
-- Impacto real de cada uma, medido antes de mexer:
--
-- * `admin_get_dashboard_metrics()` (retorna jsonb) tem guard de super admin no
--   corpo, entao `anon` ja tomava erro — o problema era a funcao ser ALCANCAVEL.
--   Quem chama e so `src/components/admin/sections/AdminDashboard.tsx`, como
--   `authenticated`: esse papel CONTINUA com EXECUTE.
--
-- * `enqueue_openai_provision()` retorna `trigger` e serve a 1 trigger. Postgres
--   nao deixa chamar funcao de trigger direto, e o privilegio de EXECUTE de
--   funcao de trigger e checado na CRIACAO do trigger, nao a cada disparo — logo
--   revogar aqui nao para o provisionamento automatico. O grant estava errado,
--   a exposicao era zero.
--
-- Uso: npx supabase db query --linked --file supabase/migrations/20260922310000_execute_publico_residuo.sql

revoke all on function public.admin_get_dashboard_metrics() from public, anon;
grant execute on function public.admin_get_dashboard_metrics() to authenticated, service_role;

revoke all on function public.enqueue_openai_provision() from public, anon, authenticated;
grant execute on function public.enqueue_openai_provision() to service_role;

select 'FN | ' || p.proname
       || ' | public=' || has_function_privilege('public', p.oid, 'EXECUTE')::text
       || ' | anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text
       || ' | authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
       || ' | service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text as info
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_get_dashboard_metrics', 'enqueue_openai_provision')
order by 1;
