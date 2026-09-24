-- Teste de antes/depois de 20260924100000_alerta_rajada_agrupada.sql
-- Roda igual antes e depois; o que muda e a coluna `resultado`.

-- 1) a restricao aceita 'rajada'?  (o 23514 silencioso de 23/09 nasceu aqui)
select '1. kind rajada cabe na restricao' as teste,
       case when pg_get_constraintdef(con.oid) like '%rajada%' then 'OK' else 'FALTA' end as resultado,
       pg_get_constraintdef(con.oid) as detalhe
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
 where c.relname = 'incident_notifications'
   and con.conname = 'incident_notifications_kind_check'

union all
-- 2) as chaves de ajuste existem e vem ligadas
select '2. chaves alert_rajada_*',
       case when count(*) = 2 then 'OK' else 'FALTA' end,
       coalesce(string_agg(column_name || '=' || coalesce(column_default,'?'), ', '), '(nenhuma)')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'llm_platform_settings'
   and column_name in ('alert_rajada_enabled','alert_rajada_min')

union all
-- 3) o ensaio de alerta NAO pode chegar no telefone
select '3. simulacao-de-alerta e somente_painel',
       case when bool_and(somente_painel) then 'OK' else 'FALHA: ensaio vira WhatsApp' end,
       'piso=' || severidade_padrao || ' painel=' || somente_painel
  from public.incident_component_catalog
 where component = 'simulacao-de-alerta'
 group by severidade_padrao, somente_painel

union all
-- 4) o que a rajada teria economizado na serie ja medida: quantas mensagens
--    individuais NAO-criticas sairam no mesmo minuto
select '4. mensagens agrupaveis na serie medida',
       'INFORMATIVO',
       coalesce(sum(qtd - 1)::text, '0') || ' mensagens a menos em ' || count(*) || ' rajadas'
  from (
      select date_trunc('minute', n.sent_at) as minuto, count(*) as qtd
        from public.incident_notifications n
        join public.incidents i on i.id = n.incident_id
       where n.kind = 'individual' and n.status = 'sent'
         and public.incident_severidade_efetiva(i.component, i.ai_severity) <> 'critica'
       group by 1
      having count(*) >= 3
  ) r

union all
-- 5) ritmo atual, que e o numero que a meta de 5/dia persegue
select '5. mensagens por dia na serie',
       'INFORMATIVO',
       round(count(*) / greatest(extract(epoch from (max(sent_at) - min(sent_at)))/86400.0, 0.01), 1)::text
       || ' msgs/dia (' || count(*) || ' em ' ||
       round(extract(epoch from (max(sent_at) - min(sent_at)))/3600.0, 1)::text || 'h)'
  from public.incident_notifications
 where status = 'sent' and via = 'whatsapp';
