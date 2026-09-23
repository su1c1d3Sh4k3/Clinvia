-- Estado ANTES de 20260923370000 (caminho por e-mail + detector do canal mudo).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_canal_alertas_email/antes.sql

select jsonb_pretty(jsonb_build_object(

    'destinatario_tem_email', exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'alert_recipients'
           and column_name = 'email'),

    'notificacao_registra_o_meio', exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'incident_notifications'
           and column_name = 'via'),

    'detector_existe', exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'canal_alertas_scan'),

    'vigia_agendado', exists (select 1 from cron.job where jobname = 'alert-channel-watch'),

    -- o vocabulario que a edge function ja usa mas o banco recusa
    'status_aceitos_hoje', (
        select pg_get_constraintdef(oid) from pg_constraint
         where conname = 'incident_notifications_status_check'),

    'skipped_severity_gravado_alguma_vez', exists (
        select 1 from public.incident_notifications where status = 'skipped_severity'),

    -- quantos caminhos de saida o alerta tem hoje
    'destinatarios_ativos', (select count(*) from public.alert_recipients where is_active),
    'caminhos_de_saida', jsonb_build_array('whatsapp'),

    'catalogo_admite_que_falta_email', exists (
        select 1 from public.incident_component_catalog
         where component = 'canal:whatsapp-alertas'
           and acao_padrao ilike '%ainda NAO esta implementada%')
));
