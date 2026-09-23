-- Rollback do catalogo do front.
--
-- Tira a linha de catalogo. NAO apaga incidente nenhum ja aberto: apagar
-- historico para desfazer um cadastro seria mentir sobre o passado.
--
-- CONSEQUENCIA de rodar isto com a function `frontend-error-ingest` ainda no ar:
-- os erros do front continuam chegando, mas passam a cair como componente NAO
-- CATALOGADO — ou seja, severidade `media` (o padrao de quem nao tem linha) e
-- MAIS um incidente do detector `monitoramento:componente-nao-catalogado` a
-- cada rota nova. Isso e o oposto do que este cadastro existe para fazer.
--
-- Para desligar o front de verdade, o caminho e a function, nao o catalogo.

delete from public.incident_component_catalog where component = 'front:';
