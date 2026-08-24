-- USER RULE (2026-08-24, caso Adrielly → Patricia): atendente PODE transferir um
-- atendimento que está atribuído a ele para outro atendente. Ele só NÃO pode
-- transferir atendimento que não é dele.
--
-- Problema: a transferência era um UPDATE direto em conversations via PostgREST.
-- O PostgREST sempre usa RETURNING internamente, e a policy restritiva de SELECT
-- conversations_agent_assignment é aplicada à linha NOVA — que, atribuída a outro
-- atendente, fica invisível para quem transferiu → "new row violates row-level
-- security policy" (403) em toda transferência agent→agent, mesmo legítima.
--
-- Fix: RPC SECURITY DEFINER que valida a regra e faz o UPDATE bypassando RLS:
--   - admin/supervisor/owner (my_agent_tm_id() IS NULL): transferem qualquer conversa
--   - agent: transfere se a conversa está atribuída a ele; se está SEM atribuição,
--     só pode assumir para si ou mover de fila sem responsável (comportamento atual)
--   - fila e atendente destino validados no mesmo tenant

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.transfer_conversation(
    p_conversation_id uuid,
    p_queue_id uuid,
    p_agent_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner uuid := get_owner_id();
    v_my_tm uuid := my_agent_tm_id(); -- NULL se chamador não é agent
    v_conv record;
BEGIN
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT id, user_id, assigned_agent_id
    INTO v_conv
    FROM conversations
    WHERE id = p_conversation_id;

    IF v_conv.id IS NULL OR v_conv.user_id <> v_owner THEN
        RAISE EXCEPTION 'Conversa não encontrada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM queues q WHERE q.id = p_queue_id AND q.user_id = v_owner) THEN
        RAISE EXCEPTION 'Fila inválida';
    END IF;

    IF p_agent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM team_members tm WHERE tm.id = p_agent_id AND tm.user_id = v_owner
    ) THEN
        RAISE EXCEPTION 'Atendente inválido';
    END IF;

    IF v_my_tm IS NOT NULL THEN
        IF v_conv.assigned_agent_id = v_my_tm THEN
            NULL; -- atribuída a ele: pode transferir para qualquer um
        ELSIF v_conv.assigned_agent_id IS NULL
            AND (p_agent_id IS NULL OR p_agent_id = v_my_tm) THEN
            NULL; -- sem dono: pode assumir para si ou mover de fila sem responsável
        ELSE
            RAISE EXCEPTION 'Você só pode transferir atendimentos atribuídos a você';
        END IF;
    END IF;

    UPDATE conversations
    SET queue_id = p_queue_id,
        assigned_agent_id = p_agent_id
    WHERE id = p_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_conversation(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_conversation(uuid, uuid, uuid) TO authenticated;
