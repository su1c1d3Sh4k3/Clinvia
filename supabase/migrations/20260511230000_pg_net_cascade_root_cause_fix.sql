-- ============================================================================
-- Correção na ORIGEM da cascata do pg_net
-- ============================================================================
-- Migration de seguimento da `20260511224000_cleanup_pg_net_and_cron_history`.
-- Aplica correções na ORIGEM do problema (não só o sintoma).
--
-- ORIGEM IDENTIFICADA
-- ===================
-- A tabela `net._http_response` crescia descontroladamente porque:
--
-- 1. TRIGGERS em INSERT messages disparam DOIS http_post POR mensagem inbound:
--    - `push_on_new_message` → trigger_message_push_notification()
--        - Faz LOOP por cada team_member com notificações habilitadas
--        - 1 net.http_post POR AGENTE — owner com 5 agentes = 5 calls/msg
--    - `trg_delivery_automation_on_inbound` → trigger_delivery_automation_on_inbound()
--        - 1 net.http_post por inbound message com sessão de automação ativa
--
-- 2. TRIGGERS em OUTRAS tabelas que disparam http_post:
--    - appointments INSERT/UPDATE  → trigger_appointment_auto_message
--    - conversations UPDATE (resolved) → trigger_conversation_resolved_auto_message
--    - crm_deals INSERT/UPDATE      → trigger_crm_deal_auto_message
--
-- 3. CRONS que fazem http_post (rodam continuamente):
--    - delivery-automation-worker (jobid 19): a cada minuto
--    - check-reminders (jobid 14): a cada minuto
--    - process-auto-follow-up (jobid 7): a cada 2 min
--    - auto-complete-appointments (jobid 6): a cada 5 min
--    - process-auto-messages (jobid 17): a cada 10 min
--    - uzapi-health-check (jobid 21): a cada 10 min
--    - appointment-reminders (jobid 3): a cada 10 min
--    - instagram-enrich-profiles (jobid 22): a cada 30 min
--    - reset-stuck-webhook-jobs (jobid 16): a cada 30 min
--    - ... e os daily/weekly
--
-- 4. TTL DO pg_net = 6 HORAS (default, não-alterável em managed Supabase)
--    Cada response acumula até a próxima limpeza interna do pg_net, que
--    com volumes altos não dá conta.
--
-- VOLUME ESTIMADO (caso típico)
-- =============================
-- Owner com 5 agentes, 100 msg inbound/h:
--   - 5 push http_posts/msg × 100 msg/h = 500/h
--   - 1 delivery http_post/msg × 100 = 100/h
--   - Triggers de outras tabelas: ~50/h
--   - Crons: ~120/h (delivery-automation-worker + check-reminders por minuto)
--   = ~770 http_posts/h por owner médio
--
-- Com 6h de retention (default): 4620 rows × ~1KB = ~5MB por owner.
-- Em produção com dezenas de owners → centenas de MB rapidamente.
--
-- CORREÇÕES APLICADAS
-- ===================
-- A) Cron de cleanup mais agressivo
--    - Era: a cada 1h, mantém últimas 1h
--    - Agora: a cada 15 min, mantém últimas 30 min
--    - Razão: garantia de não passar de ~30 min de dados acumulados
--
-- B) Remoção de função legacy duplicada
--    - `trigger_push_notification()` (versão antiga, usava endpoint
--      send-push-notification que não existe mais — substituída por
--      `trigger_message_push_notification()`)
--    - Não estava ligada a nenhum trigger ativo, mas é boa hygiene
--
-- C) (não aplicado nesta migration — recomendação futura)
--    Reescrever `trigger_message_push_notification` para fazer 1 net.http_post
--    com lista de team_members em vez de loop com N calls. Reduziria volume
--    em 5-10× para owners com equipe grande.
--
-- ============================================================================

-- A) Ajustar cron de cleanup para a cada 15 min, mantendo 30 min de dados
DO $$
BEGIN
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname = 'cleanup-pg-net-responses';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-pg-net-responses',
  '*/15 * * * *',
  $$DELETE FROM net._http_response WHERE created < NOW() - INTERVAL '30 minutes'$$
);

-- B) Remover função legacy duplicada (sem trigger ativo referenciando)
DROP FUNCTION IF EXISTS public.trigger_push_notification();
