-- ============================================================
-- ROLLBACK de 20260923490000_incidente_origem_coercao.sql
--
-- Volta ao estado da 450000: CHECK que aceita nulo (com `multiplas` no
-- `incidents`, como sempre deveria ter sido) e sem gatilho de coercao.
--
-- NAO volta para o estado da 480000 de proposito. Aquela versao barrava
-- `multiplas` e teria derrubado a ingestao no primeiro incidente com origens
-- divergentes; reverter para ela seria reintroduzir o defeito. Quem desfizer
-- esta migration quer o comportamento anterior FUNCIONANDO, nao o bug
-- intermediario.
-- ============================================================

begin;

drop trigger if exists zz_incident_events_origem_norm on public.incident_events;
drop trigger if exists zz_incidents_origem_norm on public.incidents;
drop function if exists public.incident_origem_normalizar();

alter table public.incident_events
    drop constraint if exists incident_events_origem_check;
alter table public.incident_events
    add constraint incident_events_origem_check
        check (origem is null or origem = any (array[
            'ia_n8n','front','webhook_externo','cron','edge_interna',
            'integracao_externa','nao_identificada'
        ]));

alter table public.incidents
    drop constraint if exists incidents_origem_check;
alter table public.incidents
    add constraint incidents_origem_check
        check (origem is null or origem = any (array[
            'ia_n8n','front','webhook_externo','cron','edge_interna',
            'integracao_externa','nao_identificada','multiplas'
        ]));

commit;
