-- Rollback de 20260923230000 (calibragem do cron-health-watch).
--
-- SAO DOIS PASSOS, NESTA ORDEM. As funcoes novas nao podem ser removidas
-- enquanto o varredor ainda as chama:
--
--   1. npx supabase db query --linked --file supabase/migrations/20260923200000_cron_health_watch.sql
--      (devolve cron_health_scan a versao anterior, que nao usa os dois auxiliares)
--   2. este arquivo
--
-- Efeito colateral de voltar: erro de cron volta a ser classificado com o bloco
-- DETAIL junto, entao nome de coluna volta a casar com padrao do catalogo, e
-- falha de cron volta a poder ser rebaixada para `media` — que nao entra em
-- incident_claim_for_notification e portanto NAO AVISA.

drop function if exists public.incident_piso_severidade(uuid, text);
drop function if exists public.clinvia_erro_resumo(text);
