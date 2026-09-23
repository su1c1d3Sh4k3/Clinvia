-- Rollback de 20260923290000_incident_component_catalog.sql
--
-- Derruba o catalogo de componentes e o RPC de leitura.
--
-- CONSEQUENCIA DE RODAR ISTO: todo alerta passa a sair com "componente nao
-- catalogado" no bloco "O QUE ESSE SERVICO FAZ". O alerta continua chegando e o
-- erro bruto continua la; o que se perde e a explicacao do que o servico faz.
-- Nenhum incidente e apagado.
--
-- O `alert-notify` trata a ausencia do RPC como componente nao catalogado, entao
-- rodar este rollback sem redeployar a function nao quebra o envio.

drop function if exists public.incident_component_info(text);
drop table if exists public.incident_component_catalog;
