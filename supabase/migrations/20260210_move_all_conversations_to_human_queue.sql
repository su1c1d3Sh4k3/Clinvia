-- Migration: Move todas conversas abertas/pendentes para Atendimento Humano
-- Data: 2026-02-10
-- Descrição: Move todas as conversas com status 'open' ou 'pending' para a fila "Atendimento Humano"
-- de cada tenant (user_id)

DO $$
DECLARE
    v_queue_record RECORD;
    v_updated_count INTEGER := 0;
    v_total_count INTEGER := 0;
BEGIN
    -- Para cada fila "Atendimento Humano" de cada tenant
    FOR v_queue_record IN 
        SELECT id, user_id, name 
        FROM queues 
        WHERE name = 'Atendimento Humano' 
        AND is_active = true
    LOOP
        -- Contar conversas que serão movidas
        SELECT COUNT(*) INTO v_total_count
        FROM conversations
        WHERE user_id = v_queue_record.user_id
        AND status IN ('open', 'pending')
        AND (queue_id IS DISTINCT FROM v_queue_record.id);
        
        -- Atualizar conversas deste tenant para fila Atendimento Humano
        UPDATE conversations
        SET 
            queue_id = v_queue_record.id,
            updated_at = NOW()
        WHERE user_id = v_queue_record.user_id
        AND status IN ('open', 'pending')
        AND (queue_id IS DISTINCT FROM v_queue_record.id);
        
        -- Obter total de conversas atualizadas
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        
        -- Log do progresso
        IF v_updated_count > 0 THEN
            RAISE NOTICE 'Tenant %: Movidas % conversas para fila "%" (ID: %)', 
                v_queue_record.user_id, 
                v_updated_count, 
                v_queue_record.name, 
                v_queue_record.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Migration concluída! Total de conversas movidas em todos os tenants.';
END $$;

-- Log final de verificação
DO $$
DECLARE
    v_total INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total
    FROM conversations c
    INNER JOIN queues q ON c.queue_id = q.id
    WHERE c.status IN ('open', 'pending')
    AND q.name = 'Atendimento Humano';
    
    RAISE NOTICE 'Total de conversas abertas/pendentes em "Atendimento Humano": %', v_total;
END $$;
