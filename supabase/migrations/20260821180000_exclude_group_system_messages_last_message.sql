-- ============================================================================
-- Notificações de grupo (entrou/saiu) não devem contar como "última mensagem"
-- ============================================================================
-- Mensagens de sistema "👥 <nome> entrou no grupo" / "👥 <nome> saiu do grupo"
-- (inseridas pelo webhook-handle-message no evento UAZAPI `groups`) são
-- renderizadas como pill no chat — mesmo padrão das transferências — e,
-- como elas, ficam fora da última mensagem exibida nas listas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_last_messages_for_conversations(
  p_conversation_ids uuid[]
)
RETURNS TABLE(
  conversation_id uuid,
  direction text,
  body text,
  created_at timestamptz,
  status text,
  message_type text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    lm.conversation_id,
    lm.direction::text,
    lm.body,
    lm.created_at,
    lm.status::text,
    lm.message_type::text
  FROM unnest(p_conversation_ids) AS t(conv_id)
  CROSS JOIN LATERAL (
    SELECT m.conversation_id, m.direction, m.body, m.created_at, m.status, m.message_type
    FROM public.messages m
    WHERE m.conversation_id = t.conv_id
      AND m.body NOT LIKE '%transferida de%'
      AND m.body NOT LIKE '%transferiu para%'
      AND m.body NOT LIKE '👥 %entrou no grupo'
      AND m.body NOT LIKE '👥 %saiu do grupo'
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm;
$$;

GRANT EXECUTE ON FUNCTION public.get_last_messages_for_conversations(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_last_messages_for_conversations(uuid[]) IS
'Retorna a última mensagem (não-transferência, não-notificação de grupo) de cada conversation no array. '
'Substitui o N+1 do useConversations. SECURITY INVOKER — respeita RLS da tabela messages. '
'Reverte com DROP FUNCTION.';
