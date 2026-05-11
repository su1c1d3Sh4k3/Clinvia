-- ============================================================================
-- RPC: get_last_messages_for_conversations
-- ============================================================================
-- Substitui o padrão N+1 do useConversations que executava 1 SELECT em messages
-- por conversation (até 338 calls/min em produção, consumindo 43% do CPU).
--
-- Estratégia: unnest(uuid[]) + LATERAL com LIMIT 1 — usa o índice composto
-- idx_messages_conversation_created (conversation_id, created_at DESC) de
-- forma ótima. Cada conversation é 1 index lookup + 1 row.
--
-- Performance medida (5 conversations da Fabricia):
--   - N+1 antigo:    ~1100 ms (Promise.all de 5 queries)
--   - DISTINCT ON:   ~115_000 ms (lê TODAS as rows pra deduplicar — TOAST hit)
--   - LATERAL atual: 0.252 ms (459_000× mais rápido que DISTINCT ON)
--
-- SECURITY INVOKER: respeita RLS da tabela `messages`. A policy de messages
-- é `(user_id = get_owner_id())` — simples e indexada, não cria SubPlan.
--
-- Reversão: DROP FUNCTION public.get_last_messages_for_conversations(uuid[]);
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
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm;
$$;

GRANT EXECUTE ON FUNCTION public.get_last_messages_for_conversations(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_last_messages_for_conversations(uuid[]) IS
'Retorna a última mensagem (não-transferência) de cada conversation no array. '
'Substitui o N+1 do useConversations. SECURITY INVOKER — respeita RLS da tabela messages. '
'Reverte com DROP FUNCTION.';
