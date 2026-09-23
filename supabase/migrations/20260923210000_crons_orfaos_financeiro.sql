-- Dois crons orfaos, achados pelo cron-health-watch na primeira passada.
--
-- `20260116180000_replace_financial_with_sales_notifications.sql` removeu o
-- modulo de notificacao financeira e fez `DROP FUNCTION check_financial_due_today()`
-- e `DROP FUNCTION check_financial_overdue()` — mas nao desagendou os dois crons
-- que chamavam essas funcoes.
--
-- Resultado: desde 16/01/2026, todo dia, os dois jobs executam, o Postgres
-- responde `function ... does not exist` e o job termina com status `failed`.
-- Sao ~250 dias de falha diaria que ninguem viu, porque ninguem lia
-- cron.job_run_details. O varredor viu na primeira passada.
--
-- Desagendar e seguro por construcao: o job so consegue produzir erro. Nao ha
-- funcionalidade para preservar — o recurso foi removido de proposito em
-- janeiro e substituido pelas notificacoes de venda.

select cron.unschedule('financial_due_daily')
 where exists (select 1 from cron.job where jobname = 'financial_due_daily');

select cron.unschedule('financial_overdue_daily')
 where exists (select 1 from cron.job where jobname = 'financial_overdue_daily');

-- Os incidentes que o varredor abriu para eles ja cumpriram o papel.
update public.incidents
   set status = 'resolved',
       resolved_at = now(),
       notes = coalesce(notes || E'\n', '') ||
               'Cron orfao desde 16/01/2026: a migration 20260116180000 apagou a funcao e esqueceu de desagendar o job. Desagendado em 20260923210000.'
 where component in ('cron:financial_due_daily', 'cron:financial_overdue_daily')
   and status <> 'resolved';
