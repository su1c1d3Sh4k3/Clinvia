-- Verificacao das migrations 20260923240000 (instagram-enrich-profiles) e
-- 20260923250000 (strategic-reports). Rode DEPOIS de aplicar as duas.
--
-- Esperado, linha a linha:
--   cron sumiu            -> 4 linhas, todas OK (os 4 jobs nao existem mais)
--   incidente fechado     -> OK (nenhum incidente aberto apontando para eles)
--   carencia limpa        -> OK (cron_health_seen sem os 4 nomes)
--   tabela preservada     -> OK (strategic_reports continua com as 5.104 linhas)
--   nada mais aponta      -> OK (nenhuma funcao do banco chama as edge functions removidas)

with alvos(nome) as (
    values ('instagram-enrich-profiles'),
           ('strategic-reports-daily'),
           ('strategic-reports-weekly'),
           ('strategic-reports-monthly')
),
cron_sumiu as (
    select 'cron sumiu' as verificacao,
           a.nome as detalhe,
           case when exists (select 1 from cron.job j where j.jobname = a.nome)
                then 'FALHOU - job ainda agendado' else 'OK' end as resultado
      from alvos a
),
inc_fechado as (
    select 'incidente fechado' as verificacao,
           coalesce(string_agg(distinct i.component, ', '), '-') as detalhe,
           case when count(*) = 0 then 'OK'
                else 'FALHOU - ' || count(*) || ' incidente(s) aberto(s)' end as resultado
      from public.incidents i
     where i.status <> 'resolved'
       and i.component in (select 'cron:' || nome from alvos)
),
carencia as (
    select 'carencia limpa' as verificacao,
           coalesce(string_agg(s.jobname, ', '), '-') as detalhe,
           case when count(*) = 0 then 'OK'
                else 'FALHOU - ' || count(*) || ' resto(s) em cron_health_seen' end as resultado
      from public.cron_health_seen s
     where s.jobname in (select nome from alvos)
),
tabela as (
    select 'tabela preservada' as verificacao,
           count(*)::text || ' linhas em strategic_reports' as detalhe,
           case when count(*) > 0 then 'OK' else 'FALHOU - historico sumiu' end as resultado
      from public.strategic_reports
),
sem_ponteiro as (
    select 'nada mais aponta' as verificacao,
           coalesce(string_agg(n.nspname || '.' || p.proname, ', '), '-') as detalhe,
           case when count(*) = 0 then 'OK'
                else 'ATENCAO - ainda ha quem chame' end as resultado
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and (p.prosrc ilike '%instagram-enrich-profiles%'
            or p.prosrc ilike '%generate-strategic-reports%')
)
select * from cron_sumiu
union all select * from inc_fechado
union all select * from carencia
union all select * from tabela
union all select * from sem_ponteiro;
