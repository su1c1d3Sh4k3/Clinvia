-- Trigger para garantir que conversas pending virem open ao enviar mensagem outbound
-- Isso atua como fallback caso a Edge Function falhe em atualizar o status
-- E garante consistência: se tem resposta do atendente, não é mais pendente

CREATE OR REPLACE FUNCTION public.handle_outbound_message_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Se a mensagem for enviada pelo sistema/agente (outbound)
    IF NEW.direction = 'outbound' THEN
        -- Atualiza status para 'open' se estiver 'pending'
        UPDATE public.conversations
        SET status = 'open',
            updated_at = NOW()
        WHERE id = NEW.conversation_id
          AND status = 'pending';
          
        -- Nota: A atribuição de agente deve ser feita pela Edge Function ou Frontend antes/durante o envio
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger AFTER INSERT (para garantir que mensagem foi salva)
DROP TRIGGER IF EXISTS on_outbound_message_status ON public.messages;
CREATE TRIGGER on_outbound_message_status
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_outbound_message_status();
