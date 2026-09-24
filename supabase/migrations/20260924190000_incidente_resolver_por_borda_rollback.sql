-- Rollback de 20260924190000_incidente_resolver_por_borda.sql
--
-- Dropar a funcao NAO reabre os incidentes que ela ja fechou. Isso e de
-- proposito: reabrir em massa viraria rajada no telefone dele por causa de um
-- rollback. Se for mesmo preciso reabrir algum, faca a mao, um a um.

begin;

drop function if exists public.incident_resolver_edge(text, text, text);
drop function if exists public.incident_resolver_edge(text, text, text, text);

commit;
