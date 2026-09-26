-- Rollback de 20260926130000_folga_de_conexao
-- ===========================================
-- Desfaz o que e reversivel por SQL. O que foi mudado pela Management API
-- (`db_pool` do PostgREST e `default_pool_size` do pooler) NAO volta por aqui —
-- se for para desfazer tambem, e a mao:
--     PATCH /v1/projects/{ref}/postgrest              {"db_pool": null}
--     PATCH /v1/projects/{ref}/config/database/pooler {"default_pool_size": null}
-- `null` em ambos = voltar ao padrao do plano (era 21 conexoes de PostgREST).
--
-- O catalogo sai por `is_active = false`, nunca por `delete`: apagar a linha
-- PROMOVE o componente — sem linha ele perde o piso de gravidade e passa a ser
-- julgado so pela IA.

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.unschedule('db-conexoes-watch')
 where exists (select 1 from cron.job where jobname = 'db-conexoes-watch');

drop function if exists public.db_conexoes_scan();

update public.incident_component_catalog
   set is_active = false, updated_at = now()
 where component = 'banco:conexoes-saturadas';

drop table if exists public.db_conexoes_amostras;

alter role postgres reset idle_session_timeout;
