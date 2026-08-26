-- Board do CRM em UMA chamada.
-- O front paginava o cap de 1000 linhas do PostgREST: no tenant maior são 9 páginas
-- SEQUENCIAIS e cada uma re-escaneava + re-ordenava as ~8.1k linhas do funil
-- (sort em disco, ~1s por página no banco). Aqui a varredura acontece uma vez só,
-- devolvendo jsonb (uma linha => o cap de 1000 não se aplica), já com o contato.
-- NÃO agrega crm_client_services aqui: dentro de uma função o plano é genérico e a
-- policy daquela tabela (EXISTS em crm_client) vira SubPlan correlacionado por linha
-- em vez de hash — 500ms viravam 12s. O front segue buscando os serviços à parte.
-- SECURITY INVOKER: a RLS do chamador continua valendo (escopo de instância/fila/tag).

CREATE OR REPLACE FUNCTION public.get_crm_board_cards(
    p_instance_id UUID DEFAULT NULL,
    p_instagram_instance_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
    FROM (
        SELECT cc.id,
               cc.contact_id,
               cc.stage,
               cc.is_active,
               cc.value,
               cc.priority,
               cc.created_at,
               cc.stage_changed_at,
               cc.instance_id,
               cc.instagram_instance_id,
               CASE WHEN ct.id IS NULL THEN NULL ELSE jsonb_build_object(
                   'id', ct.id,
                   'push_name', ct.push_name,
                   'phone', ct.phone,
                   'number', ct.number,
                   'profile_pic_url', ct.profile_pic_url,
                   'client_stage', ct.client_stage
               ) END AS contact
        FROM crm_client cc
        LEFT JOIN contacts ct ON ct.id = cc.contact_id
        WHERE (cc.is_active
               OR cc.stage IN ('Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado'))
          AND (p_instance_id IS NULL OR cc.instance_id = p_instance_id)
          AND (p_instagram_instance_id IS NULL OR cc.instagram_instance_id = p_instagram_instance_id)
    ) x;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_board_cards(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
