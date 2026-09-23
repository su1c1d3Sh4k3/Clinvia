-- Foto do ANTES do roteamento por gravidade (20260923350000).
--
-- Roda ANTES de aplicar a migration. Mede o defeito com numero, nao com opiniao:
-- quantos incidentes media/baixa a fila individual entregaria agora mesmo, e se
-- o caminho agrupado existe.
--
-- NAO chama incident_claim_for_notification: ela RESERVA o incidente por 5
-- minutos e atrasaria alerta de verdade. A condicao e replicada aqui em leitura.
--
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_roteamento_gravidade/antes.sql

with elegiveis as (
    select i.id, i.component, coalesce(i.ai_severity, '(nula)') as sev
      from public.incidents i
     where i.status <> 'resolved'
       and (
            i.analyzed_at is not null
            or (i.ai_severity in ('critica', 'alta')
                and i.created_at < now() - interval '2 minutes')
       )
       and (i.notify_claimed_at is null or i.notify_claimed_at < now() - interval '5 minutes')
       and (i.notify_next_attempt_at is null or i.notify_next_attempt_at <= now())
       and (
            i.notified_count = 0
            or (i.event_count > i.notified_at_event_count
                and i.last_notified_at < now() - make_interval(mins => greatest(0, coalesce(
                    (select s.incident_notify_cooldown_min from public.llm_platform_settings s limit 1), 60))))
       )
)
select jsonb_build_object(
    'fila_individual_por_severidade',
        (select jsonb_object_agg(sev, n) from (select sev, count(*) n from elegiveis group by sev) t),
    'media_baixa_que_iriam_individuais',
        (select coalesce(jsonb_agg(jsonb_build_object('componente', component, 'sev', sev)), '[]'::jsonb)
           from elegiveis where sev in ('media', 'baixa', '(nula)')),
    'ja_notificados_media_baixa',
        (select count(*) from public.incidents
          where notified_count > 0 and coalesce(ai_severity, 'media') in ('media', 'baixa')),
    'cron_de_resumo_existe',
        exists (select 1 from cron.job where jobname = 'alert-summary'),
    'claim_filtra_severidade',
        (select p.prosrc like '%i.ai_severity in (''critica'', ''alta'')%and%analyzed_at%'
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'incident_claim_for_notification'),
    'catalogo_tem_somente_painel',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'incident_component_catalog'
                   and column_name = 'somente_painel'),
    'avisos_de_componente_nao_catalogado_ja_enviados',
        (select count(*) from public.incident_notifications n
           join public.incidents i on i.id = n.incident_id
          where i.component = 'monitoramento:componente-nao-catalogado' and n.status = 'sent')
) as antes;
