-- Rollback da Etapa 4: desagenda a varredura, remove a funcao, tira os tres
-- componentes do catalogo e devolve as colunas de configuracao.
--
-- Os incidentes ja abertos NAO sao apagados: sao registro do que aconteceu, e
-- apagar historico de incidente para desfazer um detector seria mentir sobre o
-- passado. Sem o catalogo eles voltam a aparecer como `media` no painel.

select cron.unschedule('provisionamento-scan')
 where exists (select 1 from cron.job where jobname = 'provisionamento-scan');

drop function if exists public.provisionamento_scan();

delete from public.incident_component_catalog
 where component in ('provisionamento:erro',
                     'provisionamento:fila-travada',
                     'provisionamento:conta-sem-chave');

alter table public.llm_platform_settings
    drop column if exists provisionamento_alert_enabled,
    drop column if exists provisionamento_carencia_min,
    drop column if exists provisionamento_max_tentativas;
