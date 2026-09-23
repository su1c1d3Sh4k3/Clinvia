-- ============================================================
-- ROLLBACK de 20260923480000_incidente_origem_sem_nulo.sql
--
-- Devolve o CHECK que aceita nulo (o da 450000) e tira o default. O backfill
-- do residuo NAO e desfeito de proposito: ele so trocou nulo por um palpite
-- marcado como palpite, e reverter isso seria reintroduzir o vazio que a
-- migration veio resolver — sem beneficio nenhum para quem esta revertendo.
-- ============================================================

alter table public.incident_events
    alter column origem drop default;

alter table public.incidents
    alter column origem drop default;

alter table public.incident_events
    drop constraint if exists incident_events_origem_check;

alter table public.incident_events
    add constraint incident_events_origem_check
        check (origem is null or origem in (
            'ia_n8n','front','webhook_externo','cron','edge_interna',
            'integracao_externa','nao_identificada'
        ));

alter table public.incidents
    drop constraint if exists incidents_origem_check;

alter table public.incidents
    add constraint incidents_origem_check
        check (origem is null or origem in (
            'ia_n8n','front','webhook_externo','cron','edge_interna',
            'integracao_externa','nao_identificada'
        ));
