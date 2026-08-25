-- Encerrar um ticket não pode encerrar os tickets do MESMO contato em OUTRAS
-- instâncias (caso reportado 2026-08-25: cliente com conversa aberta em 2
-- instâncias — resolver uma resolvia as duas).
--
-- Causa: crm_terminal_resolve_tickets resolvia TODAS as conversas open/pending
-- do contato (o card do CRM é por CONTATO, não por conversa/instância).
--
-- Solução: escopo opcional por conversa via GUC transacional
-- `clinvia.resolve_conversation_id`. Quando definido (fluxo "Resolver Ticket"
-- do inbox e encerramento automático), o trigger resolve SÓ aquela conversa e,
-- se o contato ainda tiver ticket aberto em outra instância, recria o card
-- ativo (invariante lifecycle card<->conversa). Sem o GUC (arrastar card no
-- kanban, APIs de CRM/agendamento) o comportamento antigo é mantido: mover
-- para etapa final encerra todos os tickets do contato.

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
    v_queue_name TEXT;
    v_stage TEXT;
BEGIN
    IF NEW.contact_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.stage IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado')
       AND (TG_OP = 'INSERT'
            OR OLD.stage NOT IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado')) THEN

        -- Escopo por conversa (NULL = todas as conversas do contato)
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
          AND (v_scope_conv IS NULL OR c.id = v_scope_conv);

        -- Sobrou ticket aberto em outra instância? Ele precisa de card ativo.
        IF v_scope_conv IS NOT NULL THEN
            SELECT c.queue_id INTO v_remaining_queue
            FROM conversations c
            WHERE c.contact_id = NEW.contact_id
              AND c.user_id = NEW.user_id
              AND c.status IN ('open', 'pending')
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

                INSERT INTO crm_client (user_id, contact_id, stage)
                VALUES (NEW.user_id, NEW.contact_id, v_stage)
                ON CONFLICT (contact_id) WHERE is_active DO NOTHING;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END $function$;

-- RPC usada pelo modal "Encerrar Negociação" do inbox e pelo auto-close:
-- define o escopo e move o card ativo do contato para a etapa final, tudo na
-- mesma transação (o GUC é transacional — set_config(..., true)).
CREATE OR REPLACE FUNCTION public.crm_close_conversation_negotiation(
    p_conversation_id UUID,
    p_stage TEXT,
    p_loss_reason TEXT DEFAULT NULL,
    p_loss_reason_other TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
    v_contact_id UUID;
    v_card_id UUID;
BEGIN
    SELECT c.contact_id INTO v_contact_id
    FROM conversations c
    WHERE c.id = p_conversation_id;

    IF v_contact_id IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('clinvia.resolve_conversation_id', p_conversation_id::TEXT, true);

    SELECT cc.id INTO v_card_id
    FROM crm_client cc
    WHERE cc.contact_id = v_contact_id
      AND cc.is_active
    LIMIT 1;

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

GRANT EXECUTE ON FUNCTION public.crm_close_conversation_negotiation(UUID, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.crm_close_conversation_negotiation(UUID, TEXT, TEXT, TEXT) IS
    'Encerra a negociação do contato movendo o card ativo p/ etapa final, resolvendo APENAS a conversa informada (escopo via GUC clinvia.resolve_conversation_id).';
