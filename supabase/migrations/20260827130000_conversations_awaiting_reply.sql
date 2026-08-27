-- Filtro "Não respondidas" no banco (antes era client-side, só sobre as 100
-- conversas já carregadas). PostgREST não compara duas colunas, e as colunas
-- existentes não servem de proxy: last_customer_message_at é nula em 256
-- conversas com a bolinha laranja e last_message_at é empurrado pelas pílulas
-- de sistema (transferência, "visualizou essa conversa", entrou/saiu de grupo)
-- em outras 118. Daí a coluna própria, mantida pelo mesmo trigger que já
-- atualiza a conversa a cada mensagem e alimentada pela MESMA regra da RPC
-- get_last_messages_for_conversations (a que desenha a bolinha na lista).

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS awaiting_reply BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.conversations.awaiting_reply IS
  'true = a última mensagem real da conversa é do cliente (bolinha laranja na lista do inbox). Mantido por update_conversation_on_message.';

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_body TEXT := COALESCE(NEW.body, '');
  v_is_real BOOLEAN;
BEGIN
  -- Mesmas exclusões da RPC get_last_messages_for_conversations: pílulas de
  -- sistema não contam como "última mensagem" e portanto não mudam quem está
  -- devendo resposta.
  v_is_real :=
    v_body NOT LIKE '%transferida de%'
    AND v_body NOT LIKE '%transferiu para%'
    AND v_body NOT LIKE '👥 %entrou no grupo'
    AND v_body NOT LIKE '👥 %saiu do grupo'
    AND v_body NOT LIKE '%visualizou essa conversa%'
    AND v_body NOT LIKE '%finalizou essa conversa com a etapa%'
    AND COALESCE(NEW.message_type::TEXT, '') <> 'reaction';

  UPDATE conversations
  SET
    updated_at = NOW(),
    last_message_at = NOW(),
    awaiting_reply = CASE
      WHEN v_is_real THEN (NEW.direction::TEXT = 'inbound')
      ELSE awaiting_reply
    END
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
$function$;

CREATE INDEX IF NOT EXISTS idx_conversations_awaiting_reply
  ON public.conversations (last_message_at DESC)
  WHERE awaiting_reply;

NOTIFY pgrst, 'reload schema';
