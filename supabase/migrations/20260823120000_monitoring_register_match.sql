-- Monitoramento de Grupos: registro atômico de um match do termo.
-- Chamado pelo intercept do webhook-handle-message quando um membro do grupo
-- fala o termo monitorado. Faz, na ordem:
--   1) first-match-only: se o contato já tem entrada na campanha, não faz nada
--   2) takeover por contato (espelha campaign_takeover_sweep, escopo 1 contato):
--      campanhas ativas anteriores da MESMA instância perdem a tag deste
--      contato; entradas pending/open_ticket somem; 'sent' congela 'moved'
--      (respeitando conversa open)
--   3) tag do monitoramento no contato (trigger trg_one_campaign_tag_per_instance
--      garante 1 tag de campanha por instância)
--   4) conversa 1:1 imediata na instância do grupo (reusa open/pending; senão
--      cria pending na fila IA/Humano conforme ia_enabled — trigger de lifecycle
--      garante o card CRM)
--   5) entrada em campaign_contacts (pending) com monitor_message_id — o
--      campaign-dispatch envia a abordagem

CREATE OR REPLACE FUNCTION public.monitoring_register_match(
    p_campaign_id uuid,
    p_contact_id uuid,
    p_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    camp RECORD;
    cold RECORD;
    r RECORD;
    v_contact RECORD;
    v_conv_id uuid;
    v_queue_id uuid;
    v_queue_name text;
    v_entry_id uuid;
BEGIN
    SELECT id, user_id, instance_id, tag_id, ia_enabled, scheduled_at
      INTO camp
      FROM campaigns
     WHERE id = p_campaign_id
       AND source_type = 'monitoring'
       AND status NOT IN ('cancelled','expired','error')
       AND valid_until > now();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('created', false, 'reason', 'campaign_inactive');
    END IF;

    SELECT id, push_name, number INTO v_contact
      FROM contacts WHERE id = p_contact_id AND user_id = camp.user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('created', false, 'reason', 'contact_not_found');
    END IF;

    -- 1) primeiro match apenas
    IF EXISTS (SELECT 1 FROM campaign_contacts
                WHERE campaign_id = camp.id AND contact_id = p_contact_id) THEN
        RETURN jsonb_build_object('created', false, 'reason', 'already_matched');
    END IF;

    -- 2) takeover por contato: campanhas ativas anteriores da mesma instância
    IF camp.instance_id IS NOT NULL THEN
        FOR cold IN
            SELECT c.id, c.tag_id
              FROM campaigns c
             WHERE c.user_id = camp.user_id
               AND c.instance_id = camp.instance_id
               AND c.id <> camp.id
               AND c.status IN ('scheduled','awaiting_template','dispatching','dispatched')
               AND c.valid_until > now()
        LOOP
            IF cold.tag_id IS NOT NULL THEN
                DELETE FROM contact_tags
                 WHERE tag_id = cold.tag_id AND contact_id = p_contact_id;
            END IF;

            DELETE FROM campaign_contacts
             WHERE campaign_id = cold.id
               AND contact_id = p_contact_id
               AND status IN ('pending','open_ticket');

            FOR r IN
                SELECT occ.id, occ.sent_at, occ.conversation_id
                  FROM campaign_contacts occ
                 WHERE occ.campaign_id = cold.id
                   AND occ.contact_id = p_contact_id
                   AND occ.status = 'sent'
                   AND occ.frozen_at IS NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM conversations cv
                        WHERE cv.contact_id = p_contact_id AND cv.status = 'open'
                   )
            LOOP
                UPDATE campaign_contacts
                   SET frozen_at = now(),
                       frozen_reason = 'moved',
                       frozen_stage = 'Movido Para Outra Campanha',
                       frozen_agent = NULL,
                       frozen_scheduled = FALSE,
                       frozen_responded = public.campaign_contact_responded(p_contact_id, r.sent_at)
                 WHERE id = r.id;

                IF r.conversation_id IS NOT NULL THEN
                    UPDATE conversations SET status = 'resolved'
                     WHERE id = r.conversation_id AND status = 'pending';
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    -- 3) tag do monitoramento (trigger remove outras tags de campanha da instância)
    IF camp.tag_id IS NOT NULL THEN
        INSERT INTO contact_tags (contact_id, tag_id, user_id)
        VALUES (p_contact_id, camp.tag_id, camp.user_id)
        ON CONFLICT (contact_id, tag_id) DO NOTHING;
    END IF;

    -- 4) conversa 1:1 imediata na instância do grupo
    SELECT id INTO v_conv_id
      FROM conversations
     WHERE contact_id = p_contact_id
       AND instance_id = camp.instance_id
       AND status IN ('open','pending')
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_conv_id IS NULL THEN
        v_queue_name := CASE WHEN camp.ia_enabled THEN 'Atendimento IA' ELSE 'Atendimento Humano' END;
        SELECT id INTO v_queue_id FROM queues
         WHERE user_id = camp.user_id AND name = v_queue_name LIMIT 1;
        IF v_queue_id IS NULL THEN
            SELECT id INTO v_queue_id FROM queues
             WHERE user_id = camp.user_id AND name = 'Atendimento Humano' LIMIT 1;
        END IF;

        INSERT INTO conversations (contact_id, instance_id, user_id, status, unread_count, queue_id, last_message_at)
        VALUES (p_contact_id, camp.instance_id, camp.user_id, 'pending', 0, v_queue_id, now())
        RETURNING id INTO v_conv_id;
    END IF;

    -- 5) entrada da audiência (pending → campaign-dispatch envia a abordagem)
    INSERT INTO campaign_contacts
        (campaign_id, user_id, contact_id, conversation_id, raw_data, status, monitor_message_id)
    VALUES (
        camp.id, camp.user_id, p_contact_id, v_conv_id,
        jsonb_build_object('nome_cliente', COALESCE(NULLIF(v_contact.push_name, ''), v_contact.number)),
        'pending', p_message_id
    )
    RETURNING id INTO v_entry_id;

    RETURN jsonb_build_object('created', true, 'entry_id', v_entry_id, 'conversation_id', v_conv_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.monitoring_register_match(uuid, uuid, uuid) TO service_role;
