-- CRM por conexão: o card do funil passa a ser por (contato, canal) e não mais
-- por contato. Canal = instances.id (WhatsApp) OU instagram_instances.id, na
-- mesma convenção de conversations (instance_id NULL => Instagram).
--
-- Este arquivo é ATÔMICO de propósito: entre trocar o índice único e trocar o
-- corpo das funções não pode existir janela — as funções usam
-- ON CONFLICT (contact_id, channel_key) e o índice antigo (contact_id) precisa
-- sumir antes do backfill de canal.

SET lock_timeout = '5s';

-- ============================================================
-- 1. Modelo
-- ============================================================

ALTER TABLE public.crm_client
  ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instagram_instance_id UUID REFERENCES public.instagram_instances(id) ON DELETE SET NULL;

ALTER TABLE public.crm_client
  ADD COLUMN IF NOT EXISTS channel_key UUID GENERATED ALWAYS AS (
    COALESCE(instance_id, instagram_instance_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED;

ALTER TABLE public.crm_client
  DROP CONSTRAINT IF EXISTS crm_client_single_channel_chk;

ALTER TABLE public.crm_client
  ADD CONSTRAINT crm_client_single_channel_chk
  CHECK (instance_id IS NULL OR instagram_instance_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_client_one_active_per_contact_channel
  ON public.crm_client (contact_id, channel_key) WHERE is_active;

-- os DOIS índices legados "1 card ativo por CONTATO" (duplicados no schema)
DROP INDEX IF EXISTS public.uq_crm_client_one_active_per_contact;
DROP INDEX IF EXISTS public.idx_crm_client_active_contact;

CREATE INDEX IF NOT EXISTS idx_crm_client_channel_active
  ON public.crm_client (instance_id, is_active) WHERE instance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_client_ig_channel_active
  ON public.crm_client (instagram_instance_id, is_active) WHERE instagram_instance_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_client_channel_split_audit (
  card_id UUID PRIMARY KEY,
  contact_id UUID,
  user_id UUID,
  instance_id UUID,
  instagram_instance_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Ciclo de vida card <-> conversa
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_card_on_conv_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_stage TEXT := 'Em Atendimento Humano';
    v_queue_name TEXT;
    v_sentinel_id UUID;
BEGIN
    IF NEW.contact_id IS NULL OR NEW.status NOT IN ('open', 'pending') THEN
        RETURN NEW;
    END IF;

    -- já existe card ativo NESTE canal?
    IF EXISTS (SELECT 1 FROM crm_client cc
               WHERE cc.contact_id = NEW.contact_id
                 AND cc.is_active
                 AND cc.instance_id IS NOT DISTINCT FROM NEW.instance_id
                 AND cc.instagram_instance_id IS NOT DISTINCT FROM NEW.instagram_instance_id) THEN
        RETURN NEW;
    END IF;

    IF NEW.queue_id IS NOT NULL THEN
        SELECT q.name INTO v_queue_name FROM queues q WHERE q.id = NEW.queue_id;
        IF v_queue_name = 'Atendimento IA' THEN
            v_stage := 'Em Atendimento IA';
        END IF;
    END IF;

    -- card sentinela (legado/manual, sem canal): ADOTA em vez de duplicar
    IF NEW.instance_id IS NOT NULL OR NEW.instagram_instance_id IS NOT NULL THEN
        SELECT cc.id INTO v_sentinel_id
        FROM crm_client cc
        WHERE cc.contact_id = NEW.contact_id
          AND cc.user_id = NEW.user_id
          AND cc.is_active
          AND cc.instance_id IS NULL
          AND cc.instagram_instance_id IS NULL
        LIMIT 1;

        IF v_sentinel_id IS NOT NULL THEN
            UPDATE crm_client
            SET instance_id = NEW.instance_id,
                instagram_instance_id = NEW.instagram_instance_id,
                updated_at = NOW()
            WHERE id = v_sentinel_id;
            RETURN NEW;
        END IF;
    END IF;

    -- arbiter = uq_crm_client_one_active_per_contact_channel (parcial WHERE is_active)
    INSERT INTO crm_client (user_id, contact_id, stage, instance_id, instagram_instance_id)
    VALUES (NEW.user_id, NEW.contact_id, v_stage, NEW.instance_id, NEW.instagram_instance_id)
    ON CONFLICT (contact_id, channel_key) WHERE is_active DO NOTHING;

    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.crm_card_on_conv_resolve()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.status <> 'resolved' OR OLD.status = 'resolved' OR NEW.contact_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- ainda existe conversa aberta NO MESMO CANAL? então o card daquele canal fica
    IF EXISTS (SELECT 1 FROM conversations c
               WHERE c.contact_id = NEW.contact_id
                 AND c.user_id = NEW.user_id
                 AND c.id <> NEW.id
                 AND c.status IN ('open', 'pending')
                 AND c.instance_id IS NOT DISTINCT FROM NEW.instance_id
                 AND c.instagram_instance_id IS NOT DISTINCT FROM NEW.instagram_instance_id) THEN
        RETURN NEW;
    END IF;

    -- crm_terminal_enforce_inactive (BEFORE) desativa; crm_terminal_resolve_tickets
    -- (AFTER) roda mas não acha conversa open/pending no canal => converge.
    UPDATE crm_client cc
    SET stage = 'Finalizado', stage_changed_at = NOW(), updated_at = NOW()
    WHERE cc.contact_id = NEW.contact_id
      AND cc.user_id = NEW.user_id
      AND cc.is_active
      AND (
        (cc.instance_id IS NOT DISTINCT FROM NEW.instance_id
         AND cc.instagram_instance_id IS NOT DISTINCT FROM NEW.instagram_instance_id)
        -- card sentinela só finaliza quando o contato não tem mais NENHUM ticket
        OR (cc.instance_id IS NULL
            AND cc.instagram_instance_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM conversations c2
                            WHERE c2.contact_id = NEW.contact_id
                              AND c2.user_id = NEW.user_id
                              AND c2.id <> NEW.id
                              AND c2.status IN ('open', 'pending')))
      );

    RETURN NEW;
END $function$;

-- ============================================================
-- 3. Sincronismo etapa <-> fila (a cascata entre conexões)
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_queue_from_crm_stage()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_queue_name TEXT;
  v_queue_id UUID;
  v_humano_id UUID;
  v_ia_on BOOLEAN;
BEGIN
  IF NEW.is_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    RETURN NEW;
  END IF;

  v_queue_name := CASE NEW.stage
    WHEN 'Em Atendimento Humano' THEN 'Atendimento Humano'
    WHEN 'Aguardando Pagamento' THEN 'Atendimento Humano'
    WHEN 'Suporte' THEN 'Suporte'
    WHEN 'Financeiro' THEN 'Financeiro'
    WHEN 'Pós-Venda' THEN 'Pós-Venda'
    WHEN 'Em Atendimento IA' THEN 'Atendimento IA'
    WHEN 'Qualificado' THEN 'Atendimento IA'
    WHEN 'Agendado' THEN 'Atendimento IA'
    WHEN 'Pesquisa de Satisfação' THEN 'Atendimento IA'
    WHEN 'Follow Up' THEN 'Atendimento IA'
    WHEN 'Recorrencia' THEN 'Atendimento IA'
    WHEN 'Sem Contato' THEN 'Atendimento IA'
    WHEN 'Sem Interesse' THEN 'Atendimento IA'
    ELSE NULL -- etapas terminais / desconhecidas: não mexe na fila
  END;

  IF v_queue_name IS NULL OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_queue_name = 'Atendimento IA' THEN
    SELECT COALESCE(ic.ia_on, FALSE) INTO v_ia_on
    FROM ia_config ic WHERE ic.user_id = NEW.user_id;

    IF v_ia_on IS NOT TRUE THEN
      -- IA desligada ou sem ia_config: tudo vai para Atendimento Humano
      v_queue_name := 'Atendimento Humano';
    ELSE
      -- IA ligada: instâncias com ia_on_wpp = false vão para Atendimento Humano;
      -- as demais (ia_on_wpp = true ou sem instância) vão para Atendimento IA
      SELECT q.id INTO v_humano_id
      FROM queues q
      WHERE q.user_id = NEW.user_id AND q.name = 'Atendimento Humano'
      LIMIT 1;

      IF v_humano_id IS NOT NULL THEN
        UPDATE conversations c
        SET queue_id = v_humano_id, updated_at = NOW()
        WHERE c.contact_id = NEW.contact_id
          AND c.user_id = NEW.user_id
          AND c.status IN ('pending', 'open')
          AND c.queue_id IS DISTINCT FROM v_humano_id
          -- card com canal => só as conversas daquele canal (sem cascata)
          AND (NEW.instance_id IS NULL OR c.instance_id = NEW.instance_id)
          AND (NEW.instagram_instance_id IS NULL OR c.instagram_instance_id = NEW.instagram_instance_id)
          AND c.instance_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM instances i
            WHERE i.id = c.instance_id AND COALESCE(i.ia_on_wpp, FALSE) = FALSE
          );
      END IF;

      SELECT q.id INTO v_queue_id
      FROM queues q
      WHERE q.user_id = NEW.user_id AND q.name = 'Atendimento IA'
      LIMIT 1;

      IF v_queue_id IS NOT NULL THEN
        UPDATE conversations c
        SET queue_id = v_queue_id, updated_at = NOW()
        WHERE c.contact_id = NEW.contact_id
          AND c.user_id = NEW.user_id
          AND c.status IN ('pending', 'open')
          AND c.queue_id IS DISTINCT FROM v_queue_id
          AND (NEW.instance_id IS NULL OR c.instance_id = NEW.instance_id)
          AND (NEW.instagram_instance_id IS NULL OR c.instagram_instance_id = NEW.instagram_instance_id)
          AND (
            c.instance_id IS NULL
            OR EXISTS (
              SELECT 1 FROM instances i
              WHERE i.id = c.instance_id AND i.ia_on_wpp = TRUE
            )
          );
      END IF;

      RETURN NEW;
    END IF;
  END IF;

  SELECT q.id INTO v_queue_id
  FROM queues q
  WHERE q.user_id = NEW.user_id AND q.name = v_queue_name
  LIMIT 1;

  IF v_queue_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE conversations c
  SET queue_id = v_queue_id, updated_at = NOW()
  WHERE c.contact_id = NEW.contact_id
    AND c.user_id = NEW.user_id
    AND c.status IN ('pending', 'open')
    AND c.queue_id IS DISTINCT FROM v_queue_id
    AND (NEW.instance_id IS NULL OR c.instance_id = NEW.instance_id)
    AND (NEW.instagram_instance_id IS NULL OR c.instagram_instance_id = NEW.instagram_instance_id);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_crm_stage_from_queue()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_queue_name TEXT;
  v_stage TEXT;
  v_card_id UUID;
BEGIN
  IF OLD.queue_id IS NOT DISTINCT FROM NEW.queue_id THEN
    RETURN NEW;
  END IF;

  SELECT q.name INTO v_queue_name FROM queues q WHERE q.id = NEW.queue_id;

  v_stage := CASE v_queue_name
    WHEN 'Atendimento Humano' THEN 'Em Atendimento Humano'
    WHEN 'Suporte' THEN 'Suporte'
    WHEN 'Financeiro' THEN 'Financeiro'
    WHEN 'Pós-Venda' THEN 'Pós-Venda'
    WHEN 'Atendimento IA' THEN 'Em Atendimento IA'
    ELSE NULL -- filas custom: não mexe na etapa
  END;

  IF v_stage IS NULL OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- card ativo do canal DESTA conversa
  SELECT cc.id INTO v_card_id
  FROM crm_client cc
  WHERE cc.contact_id = NEW.contact_id
    AND cc.user_id = NEW.user_id
    AND cc.is_active = TRUE
    AND cc.instance_id IS NOT DISTINCT FROM NEW.instance_id
    AND cc.instagram_instance_id IS NOT DISTINCT FROM NEW.instagram_instance_id
  LIMIT 1;

  -- fallback: adota o card sentinela (legado, sem canal)
  IF v_card_id IS NULL AND (NEW.instance_id IS NOT NULL OR NEW.instagram_instance_id IS NOT NULL) THEN
    SELECT cc.id INTO v_card_id
    FROM crm_client cc
    WHERE cc.contact_id = NEW.contact_id
      AND cc.user_id = NEW.user_id
      AND cc.is_active = TRUE
      AND cc.instance_id IS NULL
      AND cc.instagram_instance_id IS NULL
    LIMIT 1;

    IF v_card_id IS NOT NULL THEN
      UPDATE crm_client
      SET instance_id = NEW.instance_id,
          instagram_instance_id = NEW.instagram_instance_id,
          updated_at = NOW()
      WHERE id = v_card_id;
    END IF;
  END IF;

  IF v_card_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE crm_client
  SET stage = v_stage, stage_changed_at = NOW(), updated_at = NOW()
  WHERE id = v_card_id
    AND stage IS DISTINCT FROM v_stage
    -- fila IA: preserva etapas que já pertencem ao grupo da IA
    AND NOT (v_queue_name = 'Atendimento IA' AND stage IN (
      'Em Atendimento IA', 'Qualificado', 'Agendado', 'Pesquisa de Satisfação',
      'Follow Up', 'Recorrencia', 'Sem Contato', 'Sem Interesse'
    ))
    -- fila Humano: preserva 'Aguardando Pagamento' (a própria etapa mandou a
    -- conversa pra cá — sem este guard o trigger devolveria o card p/
    -- 'Em Atendimento Humano' na sequência)
    AND NOT (v_queue_name = 'Atendimento Humano' AND stage = 'Aguardando Pagamento');

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 4. Etapas terminais / encerramento
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_terminal_resolve_tickets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_resolver UUID;
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
        SELECT tm.id INTO v_resolver
        FROM team_members tm
        WHERE tm.auth_user_id = auth.uid()
          AND tm.user_id = NEW.user_id
        LIMIT 1;

        UPDATE conversations c
        SET status = 'resolved',
            assigned_agent_id = COALESCE(v_resolver, c.assigned_agent_id)
        WHERE c.contact_id = NEW.contact_id
          AND c.user_id = NEW.user_id
          AND c.status IN ('open', 'pending')
          AND (v_scope_conv IS NULL OR c.id = v_scope_conv)
          -- card com canal => encerra só os tickets daquele canal
          AND (NEW.instance_id IS NULL OR c.instance_id = NEW.instance_id)
          AND (NEW.instagram_instance_id IS NULL OR c.instagram_instance_id = NEW.instagram_instance_id);

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

CREATE OR REPLACE FUNCTION public.crm_close_conversation_negotiation(p_conversation_id uuid, p_stage text, p_loss_reason text DEFAULT NULL::text, p_loss_reason_other text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_contact_id UUID;
    v_instance_id UUID;
    v_ig_instance_id UUID;
    v_card_id UUID;
BEGIN
    SELECT c.contact_id, c.instance_id, c.instagram_instance_id
      INTO v_contact_id, v_instance_id, v_ig_instance_id
    FROM conversations c
    WHERE c.id = p_conversation_id;

    IF v_contact_id IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('clinvia.resolve_conversation_id', p_conversation_id::TEXT, true);

    -- card do canal desta conversa
    SELECT cc.id INTO v_card_id
    FROM crm_client cc
    WHERE cc.contact_id = v_contact_id
      AND cc.is_active
      AND cc.instance_id IS NOT DISTINCT FROM v_instance_id
      AND cc.instagram_instance_id IS NOT DISTINCT FROM v_ig_instance_id
    LIMIT 1;

    -- fallback: card sentinela (legado, sem canal)
    IF v_card_id IS NULL THEN
        SELECT cc.id INTO v_card_id
        FROM crm_client cc
        WHERE cc.contact_id = v_contact_id
          AND cc.is_active
          AND cc.instance_id IS NULL
          AND cc.instagram_instance_id IS NULL
        LIMIT 1;
    END IF;

    IF v_card_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE crm_client cc
    SET stage = p_stage,
        is_active = false,
        stage_changed_at = NOW(),
        updated_at = NOW(),
        loss_reason = CASE WHEN p_stage IN ('Perdido', 'Sem Interesse')
                           THEN p_loss_reason ELSE cc.loss_reason END,
        loss_reason_other = CASE WHEN p_stage IN ('Perdido', 'Sem Interesse')
                                 THEN p_loss_reason_other ELSE cc.loss_reason_other END
    WHERE cc.id = v_card_id;
END $function$;

-- ============================================================
-- 5. Contadores do dashboard (USER RULE: total = open+pending+resolved)
-- ============================================================

DROP FUNCTION IF EXISTS public.compute_crm_stage_counts(uuid, date, uuid[], uuid[], uuid[]);

CREATE FUNCTION public.compute_crm_stage_counts(
    p_user_id uuid,
    p_date date,
    p_scope_instances uuid[] DEFAULT NULL::uuid[],
    p_scope_queues uuid[] DEFAULT NULL::uuid[],
    p_scope_tags uuid[] DEFAULT NULL::uuid[],
    p_channel uuid DEFAULT NULL::uuid
)
 RETURNS TABLE(stage text, total integer, open_count integer, pending_count integer, resolved_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH scoped_convs AS (
    SELECT c.contact_id, c.status, c.created_at,
           COALESCE(c.instance_id, c.instagram_instance_id,
                    '00000000-0000-0000-0000-000000000000'::uuid) AS channel_key
    FROM conversations c
    WHERE c.user_id = p_user_id
      AND (p_scope_instances IS NULL
           OR (c.instance_id IS NULL AND c.instagram_instance_id IS NULL)
           OR c.instance_id = ANY (p_scope_instances)
           OR c.instagram_instance_id = ANY (p_scope_instances))
      AND (p_scope_queues IS NULL
           OR c.queue_id IS NULL
           OR c.queue_id = ANY (p_scope_queues))
),
deals AS (
    SELECT cc.stage AS s, cc.contact_id, cc.channel_key
    FROM crm_client cc
    WHERE cc.user_id = p_user_id AND cc.is_active = TRUE
      AND (p_channel IS NULL OR cc.channel_key = p_channel)
      AND (p_scope_instances IS NULL
           OR cc.channel_key = '00000000-0000-0000-0000-000000000000'::uuid
           OR cc.channel_key = ANY (p_scope_instances))
      AND ((p_scope_instances IS NULL AND p_scope_queues IS NULL)
           OR EXISTS (SELECT 1 FROM scoped_convs sc WHERE sc.contact_id = cc.contact_id))
      AND (p_scope_tags IS NULL
           OR EXISTS (SELECT 1 FROM contact_tags ct
                      WHERE ct.contact_id = cc.contact_id AND ct.tag_id = ANY (p_scope_tags)))
),
latest_conv AS (
    SELECT DISTINCT ON (sc.contact_id, sc.channel_key)
           sc.contact_id, sc.channel_key, sc.status
    FROM scoped_convs sc
    ORDER BY sc.contact_id, sc.channel_key,
             (sc.status IN ('open', 'pending')) DESC,
             sc.created_at DESC
)
SELECT d.s AS stage,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE lc.status = 'open')::int AS open_count,
       COUNT(*) FILTER (WHERE lc.status = 'pending')::int AS pending_count,
       COUNT(*) FILTER (WHERE lc.status IS NULL OR lc.status NOT IN ('open', 'pending'))::int AS resolved_count
FROM deals d
LEFT JOIN latest_conv lc
       ON lc.contact_id = d.contact_id
      AND lc.channel_key = d.channel_key
GROUP BY d.s;
$function$;

DROP FUNCTION IF EXISTS public.get_crm_stage_counts();

CREATE FUNCTION public.get_crm_stage_counts(p_channel uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stage text, total integer, open_count integer, pending_count integer, resolved_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT * FROM public.compute_crm_stage_counts(
    public.get_owner_id(),
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    public.my_agent_scope_instances(),
    public.my_agent_scope_queues(),
    public.my_agent_scope_tags(),
    p_channel
);
$function$;

-- ============================================================
-- 6. Follow-up e relatório de campanha por canal
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_followup_pending_contacts(p_user_id uuid, p_minutes integer, p_follow_number integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, number text, push_name text, last_message text, last_message_time text, follow_number integer, user_id uuid, conversation_id uuid, instance_id uuid)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH candidatos AS (
        SELECT
            cv.id AS conv_id,
            cv.instance_id AS conv_instance_id,
            cv.last_message_at AS conv_last_message_at,
            c.id AS contact_id,
            c.number AS c_number,
            c.push_name AS c_push_name,
            c.last_message AS c_last_message,
            c.follow_number AS c_follow_number,
            c.user_id AS c_user_id
        FROM conversations cv
        JOIN queues q ON q.id = cv.queue_id AND q.name = 'Atendimento IA'
        JOIN contacts c ON c.id = cv.contact_id
        WHERE cv.user_id = p_user_id
          AND cv.status = 'pending'
          AND c.user_id = p_user_id
          AND c.ia_on = TRUE
          AND c.is_group = FALSE
          AND (p_follow_number IS NULL OR c.follow_number = p_follow_number)
          AND cv.last_message_at IS NOT NULL
          AND cv.last_message_at < (NOW() - (p_minutes || ' minutes')::INTERVAL)
          -- a ultima mensagem DESTA conversa precisa ter sido nossa
          AND (
              CASE
                  WHEN cv.last_customer_message_at IS NOT NULL
                      THEN cv.last_message_at > cv.last_customer_message_at
                  ELSE c.last_message = 'enviada'
              END
          )
          -- a instancia da conversa precisa estar com a IA ligada
          -- (instance_id NULL = Instagram, mesma convencao do guard de fila)
          AND (
              cv.instance_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM instances i
                  WHERE i.id = cv.instance_id AND i.ia_on_wpp IS TRUE
              )
          )
          -- entrega unica por etapa, por conversa
          AND cv.followup_claimed_number IS DISTINCT FROM c.follow_number
          -- card bloqueante precisa ser DO MESMO CANAL (ou sentinela legado):
          -- card 'Agendado' na instancia A nao pode matar o follow-up da B
          AND NOT EXISTS (
              SELECT 1 FROM crm_client cc
              WHERE cc.contact_id = c.id
                AND cc.user_id = p_user_id
                AND cc.is_active = TRUE
                AND cc.stage IN ('Agendado', 'Sem Interesse', 'Sem Contato', 'Pesquisa de Satisfação')
                AND (
                    (cc.instance_id IS NOT DISTINCT FROM cv.instance_id
                     AND cc.instagram_instance_id IS NOT DISTINCT FROM cv.instagram_instance_id)
                    OR (cc.instance_id IS NULL AND cc.instagram_instance_id IS NULL)
                )
          )
    ),
    reservados AS (
        UPDATE conversations cv2
        SET followup_claimed_number = cand.c_follow_number
        FROM candidatos cand
        WHERE cv2.id = cand.conv_id
          AND cv2.followup_claimed_number IS DISTINCT FROM cand.c_follow_number
        RETURNING cv2.id
    )
    SELECT
        cand.contact_id,
        cand.c_number,
        cand.c_push_name,
        cand.c_last_message,
        TO_CHAR(
            cand.conv_last_message_at AT TIME ZONE 'America/Sao_Paulo',
            'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'
        ),
        cand.c_follow_number,
        cand.c_user_id,
        cand.conv_id,
        cand.conv_instance_id
    FROM candidatos cand
    JOIN reservados r ON r.id = cand.conv_id
    ORDER BY cand.conv_last_message_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_campaign_contact_report(p_campaign_id uuid)
 RETURNS TABLE(campaign_contact_id uuid, responded boolean, scheduled boolean, stage text, agent text, frozen boolean, frozen_reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT
    cc.id AS campaign_contact_id,
    CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_responded, FALSE)
         ELSE cc.status = 'sent' AND public.campaign_contact_responded(cc.contact_id, cc.sent_at)
    END AS responded,
    CASE WHEN cc.frozen_at IS NOT NULL THEN COALESCE(cc.frozen_scheduled, FALSE)
         ELSE FALSE
    END AS scheduled,
    CASE WHEN cc.frozen_at IS NOT NULL THEN cc.frozen_stage
         ELSE crm.stage
    END AS stage,
    CASE WHEN cc.frozen_at IS NOT NULL THEN cc.frozen_agent
         WHEN conv.queue_name = 'Atendimento IA' THEN 'IA'
         ELSE conv.agent_name
    END AS agent,
    cc.frozen_at IS NOT NULL AS frozen,
    cc.frozen_reason
FROM campaign_contacts cc
JOIN campaigns c ON c.id = cc.campaign_id
LEFT JOIN LATERAL (
    SELECT k.stage
    FROM crm_client k
    WHERE k.contact_id = cc.contact_id
      AND k.is_active = TRUE
      AND cc.frozen_at IS NULL
      -- prefere o card da instância da campanha; sentinela como fallback
      AND (c.instance_id IS NULL
           OR k.instance_id IS NULL
           OR k.instance_id = c.instance_id)
    ORDER BY (k.instance_id IS NOT DISTINCT FROM c.instance_id) DESC, k.created_at DESC
    LIMIT 1
) crm ON TRUE
LEFT JOIN LATERAL (
    SELECT q.name AS queue_name, tm.name AS agent_name
    FROM conversations cv
    LEFT JOIN queues q ON q.id = cv.queue_id
    LEFT JOIN team_members tm ON tm.id = cv.assigned_agent_id
    WHERE cv.contact_id = cc.contact_id
      AND cv.status IN ('open', 'pending')
      AND cc.frozen_at IS NULL
      AND (c.instance_id IS NULL OR cv.instance_id = c.instance_id)
    ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC
    LIMIT 1
) conv ON TRUE
WHERE cc.campaign_id = p_campaign_id
  AND c.user_id = public.get_owner_id();
$function$;

-- ============================================================
-- 7. Salvaguarda: deletar conexão não pode violar o índice único
--    (ON DELETE SET NULL transformaria vários cards em sentinela)
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_deactivate_cards_on_channel_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_TABLE_NAME = 'instances' THEN
        UPDATE crm_client SET is_active = FALSE, updated_at = NOW()
        WHERE instance_id = OLD.id AND is_active;
    ELSE
        UPDATE crm_client SET is_active = FALSE, updated_at = NOW()
        WHERE instagram_instance_id = OLD.id AND is_active;
    END IF;
    RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_crm_cards_on_instance_delete ON public.instances;
CREATE TRIGGER trg_crm_cards_on_instance_delete
    BEFORE DELETE ON public.instances
    FOR EACH ROW EXECUTE FUNCTION public.crm_deactivate_cards_on_channel_delete();

DROP TRIGGER IF EXISTS trg_crm_cards_on_ig_instance_delete ON public.instagram_instances;
CREATE TRIGGER trg_crm_cards_on_ig_instance_delete
    BEFORE DELETE ON public.instagram_instances
    FOR EACH ROW EXECUTE FUNCTION public.crm_deactivate_cards_on_channel_delete();

NOTIFY pgrst, 'reload schema';
