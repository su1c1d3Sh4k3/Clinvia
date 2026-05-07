-- =====================================================
-- WhatsApp Multi-Device Companion Restriction
-- =====================================================
-- Captura RESTRICT_ALL_COMPANIONS / WHATSAPP_REACHOUT_TIMELOCK retornado
-- pelo servidor do WhatsApp quando um companion (UZAPI/Web/Desktop) está
-- recém-pareado e não pode INICIAR novas conversas — só responder em
-- janela de 24h de mensagens recebidas.
--
-- Diferente de "disconnected": a sessão UZAPI está saudável, é o WhatsApp
-- que limita o companion durante warmup. NÃO devemos derrubar status para
-- 'disconnected' nesses casos.
-- =====================================================

ALTER TABLE public.instances
    ADD COLUMN IF NOT EXISTS restriction_active BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS restriction_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restriction_type TEXT,
    ADD COLUMN IF NOT EXISTS restriction_detected_at TIMESTAMPTZ;

COMMENT ON COLUMN public.instances.restriction_active
    IS 'TRUE quando o WhatsApp aplicou RESTRICT_ALL_COMPANIONS / WHATSAPP_REACHOUT_TIMELOCK na instância. Companion não pode iniciar novas conversas até restriction_until.';

COMMENT ON COLUMN public.instances.restriction_until
    IS 'Timestamp UTC em que a restrição expira (vem de reachout_timelock.until na resposta UZAPI).';

COMMENT ON COLUMN public.instances.restriction_type
    IS 'Tipo de restrição: RESTRICT_ALL_COMPANIONS, etc. Vindo de reachout_timelock.enforcement_type.';

COMMENT ON COLUMN public.instances.restriction_detected_at
    IS 'Quando o sistema detectou a restrição pela primeira vez.';
