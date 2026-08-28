-- Chat de suporte com IA de 1o nivel: estado do atendimento, remetente 'ai'
-- e isolamento do chamado por USUARIO (nem o dono da conta ve o chamado do colaborador).

-- ============================================================
-- 1. Estado da IA no ticket
-- ============================================================

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS handled_by TEXT NOT NULL DEFAULT 'support',
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS transfer_reason TEXT,
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_handled_by_check CHECK (handled_by IN ('ai','support'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- support_messages passa a aceitar o remetente 'ai'
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_sender_type_check;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_sender_type_check
  CHECK (sender_type IN ('client','ai','support'));

-- Trigger: 'ai' toca o ticket mas NAO reabre chamado resolvido (so o cliente reabre)
CREATE OR REPLACE FUNCTION public.support_message_touch_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
     SET last_message_at  = NEW.created_at,
         last_sender_type = NEW.sender_type,
         status = CASE
                    WHEN NEW.sender_type = 'client' AND status = 'resolved' THEN 'open'
                    ELSE status
                  END,
         updated_at = NOW()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Isolamento por usuario
--    Regra nova: o chamado e da PESSOA, nao do tenant.
-- ============================================================

-- Tickets antigos criados via service role sem autor: o dono assume a autoria
UPDATE public.support_tickets SET auth_user_id = user_id WHERE auth_user_id IS NULL;

-- Policy legada vazava o chamado para o dono e para todo o time
DROP POLICY IF EXISTS "Users can view company tickets" ON public.support_tickets;

DROP POLICY IF EXISTS support_tickets_client_select ON public.support_tickets;
CREATE POLICY support_tickets_client_select ON public.support_tickets
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS support_tickets_client_insert ON public.support_tickets;
CREATE POLICY support_tickets_client_insert ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid() AND user_id = public.get_owner_id());

DROP POLICY IF EXISTS support_messages_client_select ON public.support_messages;
CREATE POLICY support_messages_client_select ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_messages.ticket_id
         AND t.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS support_messages_client_insert ON public.support_messages;
CREATE POLICY support_messages_client_insert ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_type = 'client'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
       WHERE t.id = support_messages.ticket_id
         AND t.auth_user_id = auth.uid()
    )
  );
