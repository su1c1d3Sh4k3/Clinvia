-- Rollback de 20260923390000_catalogo_faltantes_e_testes.sql
--
-- CONSEQUENCIA DE RODAR ISTO:
--   * incidente de teste (`zz-teste:...`) volta a poder sair no WhatsApp real;
--   * `api-scheduling` volta a nascer 'media' e a cair no resumo de 2 em 2 horas,
--     ou seja, agenda quebrada demora ate 2h para aparecer no telefone;
--   * `openai-alerts` volta a aparecer como "componente nao catalogado".
--
-- Se o incomodo for so o texto, EDITE a linha em vez de apagar: o catalogo e
-- dado, nao codigo, e `update ... where component = '...'` resolve sem migration.

delete from public.incident_component_catalog
 where component in ('zz-teste:', 'api-scheduling', 'openai-alerts');
