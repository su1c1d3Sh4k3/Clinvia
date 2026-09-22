-- Rollback de 20260923100000_incidentes_monitoramento.sql
-- Derruba o modelo de dados do monitoramento de incidentes.
-- ATENCAO: apaga os incidentes gravados. Se quiser preservar o historico, exporte
-- incidents / incident_events antes de rodar.

drop table if exists public.incident_notifications;
drop table if exists public.alert_recipients;
drop table if exists public.incident_catalog;
drop table if exists public.incident_events;
drop table if exists public.incidents;

drop function if exists public.incident_fingerprint(text, text, text, text);
drop function if exists public.incident_normalize_message(text);
drop function if exists public.sanitize_incident_text(text);

alter table public.llm_platform_settings
    drop column if exists alert_notify_enabled,
    drop column if exists alert_summary_enabled,
    drop column if exists alert_max_per_hour,
    drop column if exists alert_analyze_enabled,
    drop column if exists alert_analyze_model;
