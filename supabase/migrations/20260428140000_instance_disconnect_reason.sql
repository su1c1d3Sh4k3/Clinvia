-- =====================================================
-- Captura motivo real da desconexão da UZAPI/WhatsApp
-- =====================================================
-- Contexto: WhatsApp Multi-Device pode deslogar a sessão da UZAPI
-- ("logged out from another device") sem que ela retorne 401/403/404
-- nas chamadas de envio. Resultado: instância parece "connected" mas
-- mensagens travam ou retornam 5xx.
--
-- Este patch adiciona:
-- 1. last_disconnect_reason — string com a razão informada pela UZAPI
--    (ex: "logged out from another device with recentMessage")
-- 2. consecutive_send_failures — contador para auto-disconnect proativo
--    no evolution-send-message após N falhas seguidas
-- =====================================================

ALTER TABLE public.instances
    ADD COLUMN IF NOT EXISTS last_disconnect_reason TEXT,
    ADD COLUMN IF NOT EXISTS consecutive_send_failures INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.instances.last_disconnect_reason
    IS 'Motivo da última desconexão reportado pela UZAPI (lastDisconnectReason ou current_presence). Usado pelo banner para exibir mensagem amigável.';

COMMENT ON COLUMN public.instances.consecutive_send_failures
    IS 'Contador de falhas consecutivas no envio (uzapi_error/uzapi_timeout). Reseta em sucesso. Após 3, evolution-send-message marca como disconnected proativamente.';
