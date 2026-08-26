-- Aviso no chat de quem encerrou o atendimento, no mesmo padrão da pill de
-- transferência e do alerta de visualização:
--
--   "DD/MM/AAAA HH:MI - O colaborador <nome> finalizou essa conversa com a etapa <etapa>"
--
-- O texto é gravado em `messages` pelo trigger crm_terminal_resolve_tickets,
-- que é o ponto por onde passam TODOS os encerramentos com etapa final
-- (modal "Encerrar Negociação" do inbox, arrastar card no kanban, auto-close,
-- api-crm close_ticket) — o card só chega numa etapa terminal por ali.
--
-- ORDEM IMPORTA: o INSERT acontece DEPOIS do `UPDATE conversations`, em
-- statement separado. Resolver a conversa dispara dois triggers em cadeia
-- (`archive_messages_before_resolve` copia messages -> messages_history e
-- `on_conversation_resolve` apaga a tabela messages), e ambos rodam no fim do
-- statement do UPDATE. Inserindo depois, a pill sobrevive em `messages` e:
--   * aparece no chat da conversa resolvida (useMessages concatena o histórico
--     arquivado com as mensagens vivas);
--   * NÃO vira o preview da lista (resolvidas leem messages_history->-1, e a
--     pill não está no arquivo).

CREATE OR REPLACE FUNCTION public.crm_terminal_resolve_tickets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_resolver UUID;
    v_resolver_name TEXT;
    v_actor TEXT;
    v_pill TEXT;
    v_closed UUID[];
    v_scope_conv UUID;
    v_remaining_queue UUID;
    v_remaining_inst UUID;
    v_remaining_ig UUID;
    v_queue_name TEXT;
    v_stage TEXT;
BEGIN
    IF NEW.contact_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.stage IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado')
       AND (TG_OP = 'INSERT'
            OR OLD.stage NOT IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado')) THEN

        -- Escopo por conversa (NULL = todas as conversas do canal do card)
        v_scope_conv := NULLIF(current_setting('clinvia.resolve_conversation_id', true), '')::UUID;

        -- "Quem encerra leva a atribuição" (service role não altera)
        SELECT tm.id, tm.name INTO v_resolver, v_resolver_name
        FROM team_members tm
        WHERE tm.auth_user_id = auth.uid()
          AND tm.user_id = NEW.user_id
        LIMIT 1;

        -- Sem auth.uid() (cron de encerramento automático, api-crm, campanhas)
        -- não existe colaborador para creditar.
        v_actor := CASE
            WHEN COALESCE(v_resolver_name, '') <> '' THEN 'O colaborador ' || v_resolver_name
            ELSE 'O sistema'
        END;

        WITH upd AS (
            UPDATE conversations c
            SET status = 'resolved',
                assigned_agent_id = COALESCE(v_resolver, c.assigned_agent_id)
            WHERE c.contact_id = NEW.contact_id
              AND c.user_id = NEW.user_id
              AND c.status IN ('open', 'pending')
              AND (v_scope_conv IS NULL OR c.id = v_scope_conv)
              -- card com canal => encerra só os tickets daquele canal
              AND (NEW.instance_id IS NULL OR c.instance_id = NEW.instance_id)
              AND (NEW.instagram_instance_id IS NULL OR c.instagram_instance_id = NEW.instagram_instance_id)
            RETURNING c.id
        )
        SELECT array_agg(id) INTO v_closed FROM upd;

        -- Statement separado: aqui o arquivamento e a limpeza de `messages` já
        -- terminaram, então a pill fica visível na conversa encerrada.
        IF COALESCE(array_length(v_closed, 1), 0) > 0 THEN
            v_pill := format(
                '%s - %s finalizou essa conversa com a etapa %s',
                to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
                v_actor,
                NEW.stage
            );

            INSERT INTO messages (conversation_id, user_id, body, message_type, direction)
            SELECT cid, NEW.user_id, v_pill, 'text', 'outbound'
            FROM unnest(v_closed) AS t(cid);
        END IF;

        -- Sobrou ticket aberto no MESMO canal? Ele precisa de card ativo.
        IF v_scope_conv IS NOT NULL THEN
            SELECT c.queue_id, c.instance_id, c.instagram_instance_id
              INTO v_remaining_queue, v_remaining_inst, v_remaining_ig
            FROM conversations c
            WHERE c.contact_id = NEW.contact_id
              AND c.user_id = NEW.user_id
              AND c.status IN ('open', 'pending')
              AND (NEW.instance_id IS NULL OR c.instance_id = NEW.instance_id)
              AND (NEW.instagram_instance_id IS NULL OR c.instagram_instance_id = NEW.instagram_instance_id)
            ORDER BY c.last_message_at DESC NULLS LAST
            LIMIT 1;

            IF FOUND THEN
                v_stage := 'Em Atendimento Humano';
                IF v_remaining_queue IS NOT NULL THEN
                    SELECT q.name INTO v_queue_name FROM queues q WHERE q.id = v_remaining_queue;
                    IF v_queue_name = 'Atendimento IA' THEN
                        v_stage := 'Em Atendimento IA';
                    END IF;
                END IF;

                INSERT INTO crm_client (user_id, contact_id, stage, instance_id, instagram_instance_id)
                VALUES (NEW.user_id, NEW.contact_id, v_stage, v_remaining_inst, v_remaining_ig)
                ON CONFLICT (contact_id, channel_key) WHERE is_active DO NOTHING;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END $function$;

-- A pill é aviso de sistema: fora do preview da lista de conversas.
CREATE OR REPLACE FUNCTION public.get_last_messages_for_conversations(p_conversation_ids uuid[])
RETURNS TABLE(conversation_id uuid, direction text, body text, created_at timestamp with time zone, status text, message_type text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
      AND m.body NOT LIKE '%finalizou essa conversa com a etapa%'
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm;
$function$;

-- ... e fora do contexto que vai para a IA.
CREATE OR REPLACE FUNCTION public.get_conversation_messages_toon(p_conversation_id uuid, p_limit integer DEFAULT 10)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
      AND content NOT LIKE '%finalizou essa conversa com a etapa%'
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
$function$;

NOTIFY pgrst, 'reload schema';
