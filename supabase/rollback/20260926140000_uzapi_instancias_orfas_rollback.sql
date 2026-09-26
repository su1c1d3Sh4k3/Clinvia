-- Rollback de 20260926140000_uzapi_instancias_orfas
-- =================================================
-- O catalogo sai por `is_active = false`, nunca por `delete`: apagar a linha
-- PROMOVE o componente — sem linha ele perde o piso, o teto e o
-- `somente_painel`, e uma orfa de 2026-03 passaria a ser julgada so pela IA.
--
-- A edge function `uzapi-instancias-orfas` NAO e apagada por aqui. Se for para
-- desfazer tambem, e a mao — e lembrar que o secret `UAZAPI_ADMIN_TOKEN`
-- continua existindo (nao ha motivo para remove-lo: o token ja circulava, em
-- texto puro, dentro de `uzapi-create-instance`).

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.unschedule('uzapi-orfas-scan')
 where exists (select 1 from cron.job where jobname = 'uzapi-orfas-scan');

drop function if exists public.invoke_uzapi_instancias_orfas();

update public.incident_component_catalog
   set is_active = false, updated_at = now()
 where component = 'uazapi:instancia-orfa';
