-- Fix follow-up: contacts.last_message só era atualizado pelo webhook-handle-message
-- (webhooks UAZAPI). Mensagens outbound enviadas via API (Meta não tem echo de
-- webhook para envios via Cloud API) deixavam last_message = 'recebida', e a RPC
-- get_followup_pending_contacts exige last_message = 'enviada' — contatos que a IA
-- respondeu nunca entravam no follow-up (caso Bruno, conversa Meta).
--
-- Solução: o trigger update_conversation_on_message (AFTER INSERT em messages)
-- passa a sincronizar também contacts.last_message/last_message_time a partir de
-- NEW.direction — cobre todos os caminhos (Meta, UAZAPI, cron, campanhas).
-- webhook-handle-message continua escrevendo os mesmos valores (convergente).

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
  SET
    updated_at = NOW(),
    last_message_at = NOW()
  WHERE id = NEW.conversation_id;

  UPDATE contacts c
  SET
    last_message = CASE WHEN NEW.direction = 'outbound' THEN 'enviada' ELSE 'recebida' END,
    last_message_time = COALESCE(NEW.created_at, NOW()),
    updated_at = NOW()
  FROM conversations conv
  WHERE conv.id = NEW.conversation_id
    AND c.id = conv.contact_id;

  RETURN NEW;
END;
$$;

-- Data fix: contatos cuja última mensagem real é outbound mas last_message ficou
-- 'recebida' (envios via API Meta) — recalcula a partir da última mensagem.
UPDATE contacts c
SET
  last_message = 'enviada',
  last_message_time = lm.created_at,
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (conv.contact_id)
    conv.contact_id,
    m.direction,
    m.created_at
  FROM messages m
  JOIN conversations conv ON conv.id = m.conversation_id
  WHERE conv.contact_id IS NOT NULL
  ORDER BY conv.contact_id, m.created_at DESC
) lm
WHERE lm.contact_id = c.id
  AND lm.direction = 'outbound'
  AND c.last_message IS DISTINCT FROM 'enviada';
