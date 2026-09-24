-- Verificacao de 20260924120000_alerta_janela_24h_e_reconciliacao.sql
--
-- Rodar com:
--   npx supabase db query --linked --file supabase/tests/security/item_alerta_janela_24h/verify.sql
--
-- Toda linha tem que sair com veredito 'ok'. Qualquer 'FALHA' significa que o
-- canal de alertas voltou a poder ficar mudo em silencio.
--
-- NAO envia nada. Nao toca em producao. Leitura pura, exceto o teste (6), que
-- usa um wamid ficticio e desfaz o que fez.

with t as (

-- (1) as colunas existem
select 1 as n, 'coluna alert_recipients.last_inbound_at' as teste,
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='alert_recipients'
           and column_name='last_inbound_at')::text as obtido, '1' as esperado

union all
select 2, 'coluna incident_notifications.delivered_at',
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='incident_notifications'
           and column_name='delivered_at')::text, '1'

-- (2) as RPCs nao sao publicas.
-- `create function` concede EXECUTE a PUBLIC e `revoke from anon` NAO tira —
-- pegadinha ja cobrada duas vezes neste projeto.
union all
select 3, 'alert_notification_status fechada p/ anon+authenticated',
       (select (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text
          from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public' and p.proname='alert_notification_status'), 'false'

union all
select 4, 'alert_recipient_inbound fechada p/ anon+authenticated',
       (select (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text
          from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public' and p.proname='alert_recipient_inbound'), 'false'

union all
select 5, 'as duas executam por service_role',
       (select count(*)::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public'
           and p.proname in ('alert_notification_status','alert_recipient_inbound')
           and has_function_privilege('service_role', p.oid, 'EXECUTE')), '2'

-- (3) wamid desconhecido nao faz nada (o corte que evita mexer em mensagem de tenant)
union all
select 6, 'wamid fora dos alertas devolve false',
       public.alert_notification_status(
           'wamid.ZZZ_NAO_EXISTE_' || gen_random_uuid()::text, 'failed', '131047', 'teste')::text,
       'false'

union all
select 7, 'wamid vazio devolve false',
       public.alert_notification_status('', 'failed', '131047', 'teste')::text, 'false'

-- (4) telefone que nao e de alerta nao reabre janela de ninguem
union all
select 8, 'telefone desconhecido nao reabre janela',
       public.alert_recipient_inbound('5599999999999')::text, 'false'

union all
select 9, 'telefone curto e recusado',
       public.alert_recipient_inbound('1234')::text, 'false'

-- (5) o detector enxerga o motivo novo
union all
select 10, 'canal_alertas_scan conhece sem_confirmacao',
       (select count(*)::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public' and p.proname='canal_alertas_scan'
           and pg_get_functiondef(p.oid) like '%sem_confirmacao%'), '1'

union all
select 11, 'canal_alertas_scan fechada p/ anon+authenticated',
       (select (has_function_privilege('anon', p.oid, 'EXECUTE')
             or has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text
          from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public' and p.proname='canal_alertas_scan'), 'false'

-- (6) search_path fixo nas duas (SECURITY DEFINER sem isso e escalada)
union all
select 12, 'search_path fixo nas RPCs novas',
       (select count(*)::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='public'
           and p.proname in ('alert_notification_status','alert_recipient_inbound')
           and array_to_string(p.proconfig, ',') like '%search_path%'), '2'

-- (7) o backfill encontrou a janela do destinatario real
union all
select 13, 'destinatario ativo com janela conhecida',
       (select count(*)::text from public.alert_recipients
         where is_active and last_inbound_at is not null)::text,
       (select count(*)::text from public.alert_recipients where is_active)

)
select n, teste, esperado, obtido,
       case when obtido is not distinct from esperado then 'ok' else 'FALHA' end as veredito
  from t
 order by n;
