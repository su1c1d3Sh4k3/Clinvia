-- Rollback de 20260923140000_incident_record.sql
--
-- Seguro: a funcao nasceu nesta migration. Quem chama e o reporter das edge
-- functions (_shared/report-incident.ts) e o watcher do banco — os dois engolem
-- erro por definicao, entao derrubar a funcao para de REGISTRAR incidente e nao
-- quebra nenhuma requisicao de cliente.
--
-- ATENCAO: se o watcher (20260923150000) ainda estiver instalado, rode o
-- rollback DELE primeiro — ele chama esta funcao dentro de um cron.

drop function if exists public.incident_record(jsonb);
