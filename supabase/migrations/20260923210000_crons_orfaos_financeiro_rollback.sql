-- Rollback de 20260923210000_crons_orfaos_financeiro.sql
--
-- Reagenda os dois jobs exatamente como estavam. ATENCAO: eles voltam a FALHAR
-- todo dia, porque as funcoes que eles chamam nao existem desde 16/01/2026.
-- Este rollback existe para fidelidade de estado, nao porque faca sentido rodar.

select cron.schedule('financial_due_daily',     '0 11 * * *', $cron$ SELECT check_financial_due_today() $cron$);
select cron.schedule('financial_overdue_daily', '0 12 * * *', $cron$ SELECT check_financial_overdue() $cron$);
