-- Migration: Adicionar sender_agent_id para distinguir Humano vs IA
-- Objetivo: Garantir que status mude para 'open' SOMENTE se mensagem for enviada por humano

-- 1. Adicionar coluna sender_agent_id à tabela messages
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'sender_agent_id'
  ) THEN
    ALTER TABLE public.messages
    ADD COLUMN sender_agent_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.messages.sender_agent_id IS 'ID do agente que enviou a mensagem (se NULL, pode ser sistema/IA)';

-- 2. Atualizar trigger handle_outbound_message_status para lógica "Human Only"
CREATE OR REPLACE FUNCTION public.handle_outbound_message_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Se a mensagem for enviada pelo sistema/agente (outbound)
    IF NEW.direction = 'outbound' THEN
        
        -- Verificar se foi enviada por UM AGENTE HUMANO (sender_agent_id PRESENTE)
        IF NEW.sender_agent_id IS NOT NULL THEN
            
            -- Atualiza status para 'open' se estiver 'pending'
            UPDATE public.conversations
            SET status = 'open',
                updated_at = NOW(),
                assigned_agent_id = COALESCE(assigned_agent_id, NEW.sender_agent_id), -- Atribui agente se não tiver
                assigned_at = CASE WHEN assigned_agent_id IS NULL THEN NOW() ELSE assigned_at END
            WHERE id = NEW.conversation_id
              AND status = 'pending';
              
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir que trigger existe
DROP TRIGGER IF EXISTS on_outbound_message_status ON public.messages;
CREATE TRIGGER on_outbound_message_status
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_outbound_message_status();
