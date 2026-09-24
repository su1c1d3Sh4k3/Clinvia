-- Rollback de 20260924100000_alerta_rajada_agrupada.sql
--
-- ORDEM IMPORTA: a restricao so pode voltar a versao curta depois que nao
-- existir mais nenhuma linha `kind='rajada'` gravada. Por isso as linhas ja
-- despachadas em rajada sao reclassificadas como 'individual' (elas de fato
-- avisaram, o que muda e so o rotulo) em vez de apagadas.

update public.incident_notifications
   set kind = 'individual'
 where kind = 'rajada';

alter table public.incident_notifications
    drop constraint if exists incident_notifications_kind_check;

alter table public.incident_notifications
    add constraint incident_notifications_kind_check
    check (kind = any (array['individual','resumo','recorrencia','canal']));

alter table public.llm_platform_settings
    drop column if exists alert_rajada_enabled,
    drop column if exists alert_rajada_min;

update public.incident_component_catalog
   set somente_painel = false,
       updated_at     = now()
 where component = 'simulacao-de-alerta';
