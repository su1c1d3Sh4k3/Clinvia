-- Rollback de 20260923130000_incident_ingest.sql
--
-- Seguro: a funcao nasceu nesta migration e so a edge fn n8n-error-ingest chama.
-- Derrubar para de ingerir incidente novo; nao afeta nenhum fluxo de cliente.

drop function if exists public.incident_ingest(jsonb);
