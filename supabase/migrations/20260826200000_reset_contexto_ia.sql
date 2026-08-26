-- Reset do contexto que chega na IA (ferramenta de teste).
--
-- `contacts.ia_context_reset_at` = corte: a RPC do TOON só considera mensagens
-- POSTERIORES a essa marca. Nada é apagado — o inbox segue mostrando tudo, e
-- limpar a coluna (NULL) devolve o histórico completo para a IA.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ia_context_reset_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contacts.ia_context_reset_at IS
  'Corte do histórico enviado à IA (bd_data.conversation_history). NULL = histórico completo. Setado pela edge fn api-reset-context.';

CREATE OR REPLACE FUNCTION public.get_conversation_messages_toon(
  p_conversation_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH conv AS (
    SELECT c.contact_id,
           c.instance_id,
           c.instagram_instance_id,
           COALESCE(ct.ia_context_reset_at, '-infinity'::timestamptz) AS cutoff
    FROM conversations c
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.id = p_conversation_id
  ),
  -- Conversas do MESMO contato na MESMA conexão (inclui as já resolvidas).
  scope AS (
    SELECT c.id, c.messages_history, conv.cutoff
    FROM conversations c, conv
    WHERE c.contact_id = conv.contact_id
      AND c.contact_id IS NOT NULL
      AND c.instance_id IS NOT DISTINCT FROM conv.instance_id
      AND c.instagram_instance_id IS NOT DISTINCT FROM conv.instagram_instance_id
  ),
  live AS (
    SELECT m.created_at,
           m.direction::text AS direction,
           COALESCE(NULLIF(m.transcription, ''), NULLIF(m.body, ''),
                    '[' || m.message_type::text || ']') AS content,
           m.sender_name,
           m.is_ai_response
    FROM messages m
    JOIN scope s ON s.id = m.conversation_id
    WHERE m.is_deleted IS DISTINCT FROM true
      AND m.message_type::text <> 'reaction'
      AND m.created_at > s.cutoff
  ),
  archived AS (
    SELECT (h->>'created_at')::timestamptz AS created_at,
           CASE WHEN h->>'role' = 'user' THEN 'inbound' ELSE 'outbound' END AS direction,
           COALESCE(NULLIF(h->>'transcription', ''), NULLIF(h->>'content', ''),
                    '[' || COALESCE(NULLIF(h->>'type', ''), 'midia') || ']') AS content,
           h->>'sender_name' AS sender_name,
           NULL::boolean AS is_ai_response
    FROM scope s
    CROSS JOIN LATERAL jsonb_array_elements(s.messages_history) h
    WHERE jsonb_typeof(s.messages_history) = 'array'
      AND COALESCE(h->>'type', '') <> 'reaction'
      AND h->>'created_at' IS NOT NULL
      AND (h->>'created_at')::timestamptz > s.cutoff
  ),
  todas AS (
    SELECT * FROM live
    UNION ALL
    SELECT * FROM archived
  ),
  -- Fora do contexto: avisos de sistema renderizados como mensagem.
  limpo AS (
    SELECT * FROM todas
    WHERE content IS NOT NULL AND content <> ''
      AND content NOT LIKE '%transferida de%'
      AND content NOT LIKE '%transferiu para%'
      AND content NOT LIKE '👥 %entrou no grupo%'
      AND content NOT LIKE '👥 %saiu do grupo%'
      AND content NOT LIKE 'O colaborador % visualizou essa conversa%'
  ),
  ultimas AS (
    SELECT * FROM limpo
    ORDER BY created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 10), 1)
  )
  SELECT string_agg(
    CASE
      WHEN direction = 'inbound' THEN 'C'
      WHEN is_ai_response IS TRUE THEN 'IA'
      WHEN COALESCE(sender_name, '') <> '' THEN 'A'
      -- Espelha src/lib/messageSender.ts: outbound sem assinatura só é IA
      -- se for posterior ao deploy que passou a gravar sender_name.
      WHEN created_at >= TIMESTAMPTZ '2026-08-19 16:00:00+00' THEN 'IA'
      ELSE 'A'
    END
    || '|' || to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
    || '|' || replace(replace(
         regexp_replace(content, '^\*[^*]+:\*\s*', ''), E'\n', ' '), E'\r', ' '),
    E'\n' ORDER BY created_at ASC)
  FROM ultimas;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_messages_toon(uuid, integer)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
