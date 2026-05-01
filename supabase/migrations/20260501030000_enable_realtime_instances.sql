-- =====================================================
-- Habilita Realtime na tabela `instances`
-- =====================================================
-- Necessário para o DisconnectedInstancesBanner e RestrictedInstancesBanner
-- invalidarem o cache do React Query imediatamente quando o status muda
-- (connected ⇄ disconnected) ou quando restriction_active vira true/false.
-- Sem isso, banners ficavam ~60s exibindo estado obsoleto.
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.instances;
