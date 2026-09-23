-- Estado DEPOIS de 20260923370000 (caminho por e-mail + detector do canal mudo)
-- e de 20260923380000 (calibragem do sintoma meta_recusou).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_canal_alertas_email/verify.sql
--
-- Cada linha e uma afirmacao: `ok` false em qualquer uma reprova o item.

with checagens(item, ok, observado) as (
    values
    ('destinatario tem coluna email',
     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='alert_recipients'
                and column_name='email'),
     'alert_recipients.email'),

    ('notificacao registra por onde saiu',
     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='incident_notifications'
                and column_name='via'),
     'incident_notifications.via'),

    ('status aceita skipped_severity (defeito latente fechado)',
     (select pg_get_constraintdef(oid) from pg_constraint
       where conname='incident_notifications_status_check') ilike '%skipped_severity%',
     coalesce((select pg_get_constraintdef(oid) from pg_constraint
                where conname='incident_notifications_status_check'), 'sem restricao')),

    ('kind aceita canal',
     (select pg_get_constraintdef(oid) from pg_constraint
       where conname='incident_notifications_kind_check') ilike '%canal%',
     coalesce((select pg_get_constraintdef(oid) from pg_constraint
                where conname='incident_notifications_kind_check'), 'sem restricao')),

    ('detector existe',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='canal_alertas_scan'),
     'public.canal_alertas_scan()'),

    ('fechamento do ciclo existe',
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='canal_alertas_email_done'),
     'public.canal_alertas_email_done(uuid,uuid,boolean,text)'),

    -- `create function` concede EXECUTE a PUBLIC; conferir no catalogo, nunca na migration
    ('detector NAO e chamavel por anon',
     not has_function_privilege('anon','public.canal_alertas_scan()','EXECUTE'),
     'has_function_privilege(anon, canal_alertas_scan)'),

    ('detector NAO e chamavel por authenticated',
     not has_function_privilege('authenticated','public.canal_alertas_scan()','EXECUTE'),
     'has_function_privilege(authenticated, canal_alertas_scan)'),

    ('fechamento NAO e chamavel por anon',
     not has_function_privilege('anon',
        'public.canal_alertas_email_done(uuid,uuid,boolean,text)','EXECUTE'),
     'has_function_privilege(anon, canal_alertas_email_done)'),

    ('fechamento NAO e chamavel por authenticated',
     not has_function_privilege('authenticated',
        'public.canal_alertas_email_done(uuid,uuid,boolean,text)','EXECUTE'),
     'has_function_privilege(authenticated, canal_alertas_email_done)'),

    ('service_role executa o detector',
     has_function_privilege('service_role','public.canal_alertas_scan()','EXECUTE'),
     'has_function_privilege(service_role, canal_alertas_scan)'),

    ('detector tem search_path fixo',
     (select 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='canal_alertas_scan'),
     'proconfig de canal_alertas_scan'),

    ('vigia agendado de 15 em 15 min',
     exists (select 1 from cron.job
              where jobname='alert-channel-watch' and active and schedule='*/15 * * * *'),
     coalesce((select schedule from cron.job where jobname='alert-channel-watch'), 'nao agendado')),

    ('vigia e acordado pela chave NOVA (x-service-key), nao pelo JWT legado',
     (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='invoke_alert_channel_watch')
        ilike '%SUPABASE_EDGE_SECRET_KEY%',
     'prosrc de invoke_alert_channel_watch'),

    ('vigia passa pelo clinvia_http_post (senao a falha fica invisivel)',
     (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='invoke_alert_channel_watch')
        ilike '%clinvia_http_post%',
     'prosrc de invoke_alert_channel_watch'),

    ('chaves de desligar existem',
     (select count(*) from information_schema.columns
       where table_schema='public' and table_name='llm_platform_settings'
         and column_name in ('alert_email_enabled','canal_mudo_enabled',
                             'canal_mudo_atraso_min','canal_mudo_horas',
                             'canal_mudo_cooldown_min')) = 5,
     'llm_platform_settings'),

    ('catalogo nao diz mais que falta o e-mail',
     not exists (select 1 from public.incident_component_catalog
                  where component='canal:whatsapp-alertas'
                    and acao_padrao ilike '%ainda NAO esta implementada%'),
     coalesce((select left(acao_padrao, 60) from public.incident_component_catalog
                where component='canal:whatsapp-alertas'), 'sem linha no catalogo')),

    ('destinatario ativo tem e-mail (senao a 2a via nao existe na pratica)',
     exists (select 1 from public.alert_recipients
              where is_active and nullif(trim(email),'') is not null),
     coalesce((select string_agg(nome || '=' || coalesce(email,'sem e-mail'), ', ')
                 from public.alert_recipients where is_active), 'nenhum ativo')),

    ('nenhum destinatario de teste sobrou',
     not exists (select 1 from public.alert_recipients where nome ilike 'ZZ TESTE%'),
     coalesce((select string_agg(nome, ', ') from public.alert_recipients
                where nome ilike 'ZZ TESTE%'), 'nenhum')),

    -- Calibragem: recusa com entrega na mesma janela NAO e canal mudo
    ('meta_recusou exige que nada tenha saido na janela',
     (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='canal_alertas_scan')
        ilike '%v_recusas > 0 and v_ok_recente = 0%',
     'prosrc de canal_alertas_scan'),

    ('detector nao se alimenta do proprio eco',
     (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='canal_alertas_scan')
        ilike '%i.component <> ''canal:whatsapp-alertas''%',
     'prosrc de canal_alertas_scan'),

    ('o proprio vigia nao esta quebrado (sem incidente cron-http)',
     not exists (select 1 from public.incidents
                  where component = 'cron-http:alert-channel-watch'
                    and status <> 'resolved'),
     coalesce((select 'incidente aberto: ' || id::text from public.incidents
                where component='cron-http:alert-channel-watch' and status<>'resolved'
                limit 1), 'nenhum'))
)
select jsonb_pretty(jsonb_build_object(
    'reprovados', (select count(*) from checagens where not ok),
    'itens', (select jsonb_agg(jsonb_build_object(
                    'item', item, 'ok', ok, 'observado', observado) order by ok, item)
                from checagens)
));
