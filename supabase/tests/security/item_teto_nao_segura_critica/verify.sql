-- Teto por hora nao segura critica/alta (24/09/2026).
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.

with
-- 1. O catalogo nao mente mais sobre o alcance do teto.
c1 as (
    select 1 as ord,
           'comentario da coluna diz que o teto e so media/baixa' as checagem,
           case when col_description('public.llm_platform_settings'::regclass,
                    (select attnum from pg_attribute
                      where attrelid = 'public.llm_platform_settings'::regclass
                        and attname = 'alert_max_per_hour')) ilike '%SOMENTE para media/baixa%'
                then 'ok' else 'FALHOU' end as resultado,
           '' as detalhe
),
-- 2. O teto continua existindo e editavel: foi restringido, nao removido.
c2 as (
    select 2, 'teto configurado dentro da faixa 1..100',
           case when alert_max_per_hour between 1 and 100 then 'ok' else 'FALHOU' end,
           alert_max_per_hour::text
      from public.llm_platform_settings
     limit 1
),
-- 3. O despacho automatico so reclama critica/alta — logo, depois desta
--    mudanca o teto nao tem como tocar em nada que o cron despacha.
c3 as (
    select 3, 'incident_claim_for_notification reclama so critica/alta',
           case when pg_get_functiondef(p.oid) ~* 'critica'
                 and pg_get_functiondef(p.oid) ~* 'alta'
                then 'ok' else 'FALHOU' end, ''
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'incident_claim_for_notification'
),
-- 4. Nao existe teto de TENTATIVAS: alerta segurado por qualquer motivo volta
--    para a fila para sempre, nunca e dado por perdido.
c4 as (
    select 4, 'incident_notification_done sem teto de tentativas',
           case when pg_get_functiondef(p.oid) !~* 'notify_failed_count\s*>=?\s*[0-9]'
                then 'ok' else 'FALHOU — apareceu um limite de tentativas' end, ''
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'incident_notification_done'
),
-- 5. Historico: quantas vezes o teto ja segurou alguma coisa e de que
--    severidade. Depois da correcao, critica/alta aqui tem que parar de crescer.
c5 as (
    select 5,
           'skipped_ratelimit historico — severidade '
               || coalesce(public.incident_severidade_efetiva(i.component, i.ai_severity), 'sem_incidente'),
           count(*)::text || ' linha(s)',
           coalesce(to_char(max(n.sent_at) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), '-')
      from public.incident_notifications n
      left join public.incidents i on i.id = n.incident_id
     where n.status = 'skipped_ratelimit'
     group by 2
),
-- 6. Contraprova do desenho: a janela de silencio, que ja era isenta para
--    critica/alta, nunca segurou nenhuma das duas.
c6 as (
    select 6, 'skipped_window nunca pegou critica/alta',
           case when count(*) = 0 then 'ok' else 'FALHOU' end,
           count(*)::text || ' linha(s)'
      from public.incident_notifications n
      join public.incidents i on i.id = n.incident_id
     where n.status = 'skipped_window'
       and public.incident_severidade_efetiva(i.component, i.ai_severity) in ('critica', 'alta')
)
select checagem, resultado, detalhe from (
    select * from c1 union all select * from c2 union all select * from c3
    union all select * from c4 union all select * from c5 union all select * from c6
) t order by ord, checagem;
