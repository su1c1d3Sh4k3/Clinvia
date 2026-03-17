-- =============================================
-- FIX: Remove trigger incorreto em crm_deals
-- Data: 2026-03-17
--
-- Problema: O trigger push_on_deal_change chamava trigger_push_notification()
-- que foi projetada para a tabela messages (acessa NEW.direction e
-- NEW.conversation_id). Como crm_deals não tem essas colunas, todo INSERT
-- falhava com: ERROR: record "new" has no field "direction"
--
-- Isso bloqueava criação de negociações no frontend, via API e via N8N.
-- =============================================

DROP TRIGGER IF EXISTS push_on_deal_change ON public.crm_deals;
