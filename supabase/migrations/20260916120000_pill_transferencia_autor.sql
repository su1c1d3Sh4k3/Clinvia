-- Aviso de transferência de setor no chat passa a creditar quem transferiu,
-- no mesmo padrão da pill de encerramento (crm_terminal_resolve_tickets):
--
--   antes:  "Conversa a1b2c3d4 transferida de Comercial para Financeiro"
--   depois: "Conversa transferida de Comercial para Financeiro por João Silva"
--           "Conversa transferida de Atendimento IA para Comercial pelo sistema"
--
-- O trecho "transferida de" é MANTIDO de propósito: é por ele que a pill é
-- reconhecida no front (MessageList/ConversationChatModal) e escondida do
-- preview da lista, do contexto da IA e do awaiting_reply
-- (get_last_messages_for_conversations, get_conversation_messages_toon, ...).
-- Mudar esse trecho obrigaria a reescrever 7 funções do banco.
--
-- O id curto da conversa saiu: o front tentava removê-lo com /^Conversa \d+\s+/,
-- que nunca casava porque o id é hexadecimal — o usuário via o código cru.
--
-- SECURITY DEFINER: o lookup em team_members não pode depender da RLS do
-- chamador (atendente com escopo restrito cairia em "pelo sistema"). auth.uid()
-- continua sendo o do chamador — SECURITY DEFINER não mexe no JWT da requisição
-- —, então transferência feita por cron/service role (sem auth.uid()) segue
-- caindo corretamente em "pelo sistema".

CREATE OR REPLACE FUNCTION public.insert_transfer_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_old_queue_name TEXT;
    v_new_queue_name TEXT;
    v_actor_name TEXT;
    v_message_body TEXT;
BEGIN
    IF OLD.queue_id IS DISTINCT FROM NEW.queue_id THEN
        IF OLD.queue_id IS NOT NULL THEN
            SELECT name INTO v_old_queue_name FROM queues WHERE id = OLD.queue_id;
        END IF;

        IF NEW.queue_id IS NOT NULL THEN
            SELECT name INTO v_new_queue_name FROM queues WHERE id = NEW.queue_id;
        END IF;

        -- Colaborador logado do MESMO tenant; NULL em cron, API e automações.
        SELECT tm.name INTO v_actor_name
        FROM team_members tm
        WHERE tm.auth_user_id = auth.uid()
          AND tm.user_id = NEW.user_id
        LIMIT 1;

        v_message_body := format(
            'Conversa transferida de %s para %s %s',
            COALESCE(v_old_queue_name, 'Sem fila'),
            COALESCE(v_new_queue_name, 'Sem fila'),
            CASE
                WHEN COALESCE(v_actor_name, '') <> '' THEN 'por ' || v_actor_name
                ELSE 'pelo sistema'
            END
        );

        INSERT INTO messages (
            conversation_id,
            user_id,
            body,
            message_type,
            direction
        ) VALUES (
            NEW.id,
            NEW.user_id,
            v_message_body,
            'text',
            'outbound'
        );
    END IF;

    RETURN NEW;
END;
$function$;
