-- Escopo do atendente por canal: card cujo canal está fora de allowed_instance_ids
-- some direto (curto-circuito), em vez de depender do EXISTS sobre conversations.
-- Card sentinela (sem canal) continua caindo na regra antiga por contato.
-- Arquivo separado: DROP/CREATE POLICY pega ACCESS EXCLUSIVE em tabela quente.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.crm_card_in_scope(
    p_contact uuid,
    p_owner uuid,
    p_instance uuid,
    p_ig uuid,
    p_inst uuid[],
    p_queues uuid[]
)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT CASE
        WHEN p_inst IS NULL AND p_queues IS NULL THEN TRUE
        WHEN p_contact IS NULL THEN TRUE
        WHEN p_inst IS NOT NULL
             AND COALESCE(p_instance, p_ig) IS NOT NULL
             AND NOT (COALESCE(p_instance, p_ig) = ANY (p_inst)) THEN FALSE
        ELSE EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.contact_id = p_contact
              AND c.user_id = p_owner
              AND (p_instance IS NULL OR c.instance_id = p_instance)
              AND (p_ig IS NULL OR c.instagram_instance_id = p_ig)
              AND (p_inst IS NULL
                   OR (c.instance_id IS NULL AND c.instagram_instance_id IS NULL)
                   OR c.instance_id = ANY (p_inst)
                   OR c.instagram_instance_id = ANY (p_inst))
              AND (p_queues IS NULL
                   OR c.queue_id IS NULL
                   OR c.queue_id = ANY (p_queues))
        )
    END;
$function$;

DROP POLICY IF EXISTS crm_client_agent_scope ON public.crm_client;

CREATE POLICY crm_client_agent_scope ON public.crm_client
    AS RESTRICTIVE
    FOR SELECT
    USING (
        public.crm_card_in_scope(
            contact_id,
            user_id,
            instance_id,
            instagram_instance_id,
            (SELECT public.my_agent_scope_instances()),
            (SELECT public.my_agent_scope_queues())
        )
    );

NOTIFY pgrst, 'reload schema';
