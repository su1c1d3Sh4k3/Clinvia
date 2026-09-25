-- Rollback de 20260925140000_recebimento_bruto.sql
--
-- ATENÇÃO: desfazer isto devolve o caminho da Meta ao estado em que mensagem de
-- paciente sumia em silêncio. A coluna `body_sha256` é preservada de propósito
-- (dado, não estrutura de decisão); o que sai é o índice, o catálogo e a tarefa.

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.unschedule('webhook-queue-drain')
where exists (select 1 from cron.job where jobname = 'webhook-queue-drain');

drop function if exists public.invoke_webhook_queue_processor();

delete from public.incident_component_catalog
where component in ('recebimento:perdida-', 'recebimento:nao-gravado');

drop index if exists public.idx_webhook_queue_body_sha256;

-- A coluna fica. Derrubá-la apagaria a identidade dos corpos já recebidos.
-- Para remover de fato:
--   alter table public.webhook_queue drop column body_sha256;
