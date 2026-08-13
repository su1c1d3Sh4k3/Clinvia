-- Fila materializada de mensagens automáticas (SÓ API oficial/Meta — decisão do
-- usuário): fonte da verdade da coluna "Agendadas" do painel Mensagens
-- Automáticas e do retry de envios que falham (ex.: Meta #131037).
--
-- Ciclo: planner do appointment-confirmation-cron projeta envios futuros
-- ('scheduled'), sender processa a fila com até 3 tentativas (30min entre
-- tentativas) → 'sent' | 'failed' (rejeitada) | 'canceled' (agendamento
-- cancelado antes do envio) | 'skipped' (sem número / template desligado).
-- Regras do usuário: template desligado NÃO conta como agendada; cancelado
-- antes do envio NÃO conta; 3 falhas = Rejeitada.

CREATE TABLE IF NOT EXISTS public.automation_send_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    flow_type text NOT NULL,               -- confirm_24h | reminder_2h | feedback_24h
    template_name text NOT NULL,           -- sys_confirm_24h_v1 | sys_confirm_multi_v1 | sys_reminder_2h_v1 | sys_feedback_24h_v1
    contact_id uuid NOT NULL,
    appointment_ids uuid[] NOT NULL DEFAULT '{}',
    appointment_date text NOT NULL,        -- dia BRT (YYYY-MM-DD) dos agendamentos (mesmo dedup das sessions)
    scheduled_for timestamptz NOT NULL,    -- quando a mensagem deve ser enviada
    status text NOT NULL DEFAULT 'scheduled',
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    next_attempt_at timestamptz,
    message_id text,                       -- messages.id (uuid como texto; sobrevive ao arquivamento)
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT automation_send_queue_status_check
        CHECK (status IN ('scheduled', 'sent', 'failed', 'canceled', 'skipped')),
    CONSTRAINT uq_automation_send_queue UNIQUE (user_id, flow_type, contact_id, appointment_date)
);

CREATE INDEX IF NOT EXISTS idx_asq_user_sched ON public.automation_send_queue (user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_asq_due ON public.automation_send_queue (status, scheduled_for) WHERE status = 'scheduled';

ALTER TABLE public.automation_send_queue ENABLE ROW LEVEL SECURITY;

-- Team-aware (padrão get_owner_id, não auth.uid): leitura no dashboard;
-- escrita fica só com o service role (cron)
DROP POLICY IF EXISTS "asq_select_owner" ON public.automation_send_queue;
CREATE POLICY "asq_select_owner" ON public.automation_send_queue
    FOR SELECT USING (user_id = public.get_owner_id());

-- RPC do painel: linhas da fila do dia + dados do contato.
-- Status de entrega vem da RPC já existente get_automation_template_messages
-- (messages vivas + arquivadas) — o frontend faz o join por message_id.
CREATE OR REPLACE FUNCTION public.get_automation_schedule(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(id uuid, flow_type text, template_name text, status text, attempts integer,
              last_error text, scheduled_for timestamptz, sent_at timestamptz, message_id text,
              contact_id uuid, contact_name text, contact_phone text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT q.id, q.flow_type, q.template_name, q.status, q.attempts,
       q.last_error, q.scheduled_for, q.sent_at, q.message_id,
       ct.id, ct.push_name, COALESCE(NULLIF(ct.phone, ''), split_part(ct.number, '@', 1))
FROM automation_send_queue q
LEFT JOIN contacts ct ON ct.id = q.contact_id
WHERE q.user_id = public.get_owner_id()
  AND q.scheduled_for >= p_start
  AND q.scheduled_for < p_end
ORDER BY q.scheduled_for ASC;
$function$;
