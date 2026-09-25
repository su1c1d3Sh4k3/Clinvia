-- Rollback de 20260925230000_sentinela_externa.sql
--
-- Desliga a vigilancia sobre a sentinela externa. A TABELA NAO E DERRUBADA:
-- ela guarda o rastro das medicoes e derrubar dado para desfazer um detector e
-- troca ruim. Quem quiser mesmo apagar roda o drop comentado no fim, ciente.
--
-- As linhas do catalogo saem por `is_active = false`, NUNCA por delete: apagar
-- a linha nao remove o componente, PROMOVE ele — sem linha o piso implicito e
-- `media` e o `somente_painel` se perde, entao o que ficaria mudo passaria a
-- tocar o telefone dele.

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.unschedule('sentinela-health-watch')
 where exists (select 1 from cron.job where jobname = 'sentinela-health-watch');

drop function if exists public.sentinela_health_scan();

update public.incident_component_catalog
   set is_active = false, updated_at = now()
 where component in ('sentinela:aplicacao-inacessivel', 'sentinela:parou-de-reportar');

-- drop table if exists public.sentinela_heartbeats;
