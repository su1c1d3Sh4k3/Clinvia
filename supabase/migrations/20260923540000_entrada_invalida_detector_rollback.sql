-- Rollback do detector de erro de entrada.
--
-- Desfaz o LADO SQL: cron, funcao e as 3 linhas de catalogo. NAO apaga incidente
-- nem evento algum — apagar historico para desfazer um cadastro seria mentir
-- sobre o passado.
--
-- LEIA ANTES DE RODAR: o lado TypeScript (`_shared/api-errors.ts` devolvendo 400
-- e chamando `reportInputError`) NAO sai por aqui; sai por redeploy das
-- functions. Rodar so este arquivo deixa o pior dos dois mundos no ar: os
-- eventos `entrada:<function>` continuam entrando, agora SEM linha de catalogo
-- — ou seja, severidade `media` (o padrao de quem nao tem cadastro), sem
-- `somente_painel`, e mais um incidente do detector
-- `monitoramento:componente-nao-catalogado` por function nova que errar.
-- Isso e exatamente o oposto do que o cadastro existe para fazer.
--
-- Ordem certa para desfazer de verdade:
--   1. reverter `_shared/api-errors.ts` e redeployar as functions;
--   2. so entao rodar este arquivo.
--
-- Se o incomodo for so o barulho dos dois detectores, NAO use este rollback:
--   update public.llm_platform_settings set alert_input_rate_enabled = false;
-- A contagem segue viva e o painel segue completo.

select cron.unschedule('entrada-invalida-scan')
 where exists (select 1 from cron.job where jobname = 'entrada-invalida-scan');

drop function if exists public.entrada_invalida_scan();

delete from public.incident_component_catalog
 where component in ('entrada:', 'entrada-invalida:surto', 'entrada-invalida:persistente');

-- A coluna FICA. Dropar apagaria a escolha de quem ja tivesse desligado o
-- detector, e uma coluna booleana sem leitor nao custa nada.
-- Para remover mesmo:
--   alter table public.llm_platform_settings drop column alert_input_rate_enabled;
