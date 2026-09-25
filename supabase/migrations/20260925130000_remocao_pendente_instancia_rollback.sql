-- Rollback de 20260925130000_remocao_pendente_instancia.sql
--
-- AVISO: derrubar as colunas APAGA a lista de instâncias que o provedor se recusou
-- a remover — exatamente o dado que a migration existe para preservar. Antes de
-- rodar, conferir que não há pendência aberta:
--
--   select id, instance_name, removal_pending_at, removal_error
--     from public.instances where removal_pending_at is not null;

delete from public.incident_component_catalog
 where component = 'uazapi:remocao-pendente';

drop index if exists public.idx_instances_removal_pending;

alter table public.instances
    drop column if exists removal_requested_by,
    drop column if exists removal_error,
    drop column if exists removal_pending_at;
