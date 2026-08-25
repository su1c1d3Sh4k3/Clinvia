-- Alerta de visualização de conversa (user rules, 2026-08-25):
-- - Quando um AGENTE abre uma conversa pelo INBOX, insere mensagem de sistema
--   "O colaborador <nome> visualizou essa conversa - dd/mm/yyyy hh:mm" (pill
--   central, mesmo estilo das transferências).
-- - Apenas UMA vez por agente por conversa (primeira visualização).
-- - Supervisor e Admin NUNCA disparam o alerta.
-- - A pill fica fora da "última mensagem" das listas (mesmo padrão das
--   notificações de grupo entrou/saiu).

-- ── Dedup: 1 registro por (conversa, membro) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_view_logs (
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    team_member_id  uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
    viewed_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, team_member_id)
);

ALTER TABLE public.conversation_view_logs ENABLE ROW LEVEL SECURITY;
-- Sem policies: escrita/leitura só via RPC SECURITY DEFINER abaixo.

-- ── RPC chamada pelo front ao abrir a conversa no inbox ─────────────────────
CREATE OR REPLACE FUNCTION public.register_conversation_view(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tm_id   uuid;
    v_tm_name text;
    v_owner   uuid;
BEGIN
    -- Só AGENTES disparam o alerta (supervisor/admin nunca)
    SELECT tm.id, tm.name INTO v_tm_id, v_tm_name
    FROM team_members tm
    WHERE tm.auth_user_id = auth.uid() AND tm.role = 'agent'
    LIMIT 1;
    IF v_tm_id IS NULL THEN
        RETURN false;
    END IF;

    -- Conversa precisa existir e ser do mesmo tenant do agente
    SELECT c.user_id INTO v_owner
    FROM conversations c
    JOIN team_members tm ON tm.id = v_tm_id AND tm.user_id = c.user_id
    WHERE c.id = p_conversation_id;
    IF v_owner IS NULL THEN
        RETURN false;
    END IF;

    -- Primeira visualização deste agente? (dedup por PK)
    INSERT INTO conversation_view_logs (conversation_id, team_member_id)
    VALUES (p_conversation_id, v_tm_id)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
        RETURN false;  -- já tinha visualizado antes
    END IF;

    -- Mensagem de sistema (mesmo shape do insert_transfer_message)
    INSERT INTO messages (conversation_id, user_id, body, message_type, direction)
    VALUES (
        p_conversation_id,
        v_owner,
        format(
            'O colaborador %s visualizou essa conversa - %s',
            COALESCE(v_tm_name, 'Agente'),
            to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
        ),
        'text',
        'outbound'
    );

    RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.register_conversation_view(uuid) TO authenticated;

-- ── Fora da "última mensagem" das listas (padrão das notificações de grupo) ─
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
      AND m.body NOT LIKE '%visualizou essa conversa%'
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm;
$$;

GRANT EXECUTE ON FUNCTION public.get_last_messages_for_conversations(uuid[]) TO authenticated;
