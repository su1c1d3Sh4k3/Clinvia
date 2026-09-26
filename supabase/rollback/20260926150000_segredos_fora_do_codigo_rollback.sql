-- Rollback de 20260926150000_segredos_fora_do_codigo.
--
-- `is_active = false`, NUNCA `delete`. Apagar a linha do catalogo PROMOVE o
-- componente: sem linha nao ha piso de gravidade e nao ha `somente_painel`, e
-- `incident_severidade_efetiva` passa a devolver o que a IA achar.

set lock_timeout = '5s';
set statement_timeout = '120s';

update public.incident_component_catalog
   set is_active = false, updated_at = now()
 where component in ('uazapi:varredura-cega', 'uzapi_admin_token_missing');
