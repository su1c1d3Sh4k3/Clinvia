-- =============================================================================
-- Appointment Confirmation: limpeza do backlog de sessões zumbis
-- =============================================================================
-- Até aqui a sessão só saía do ar quando o cliente completava o fluxo. Quem
-- respondia fora dos botões (ou não respondia) ficava com a sessão aberta para
-- sempre, e o intercept do webhook-handle-message bloqueava a IA desse contato
-- indefinidamente.
--
-- A partir do appointment-confirmation-cron desta mesma entrega, sessão parada
-- há 24h é encerrada automaticamente com aviso de falta de interação. O backlog
-- acumulado é encerrado AQUI e em SILÊNCIO: mandar "estamos encerrando o
-- contato" para centenas de pessoas de conversas de semanas atrás seria spam.
-- =============================================================================

-- 1. Resolve as conversas ainda abertas dessas sessões.
--    Precisa vir antes do UPDATE do card/estado: o trigger de sincronia de fila
--    só enxerga conversas em pending/open.
UPDATE public.conversations c
SET status = 'resolved',
    updated_at = now()
FROM public.appointment_confirmation_sessions s
WHERE s.conversation_id = c.id
  AND s.state NOT IN ('completed', 'transferred', 'failed')
  AND s.last_state_at < now() - interval '24 hours'
  AND c.status IN ('pending', 'open');

-- 2. Pesquisa de satisfação sem resposta: o card ficou preso na etapa.
UPDATE public.crm_client cc
SET stage = 'Finalizado',
    is_active = false,
    stage_changed_at = now(),
    updated_at = now()
FROM public.appointment_confirmation_sessions s
WHERE cc.contact_id = s.contact_id
  AND cc.user_id = s.user_id
  AND cc.is_active = true
  AND cc.stage = 'Pesquisa de Satisfação'
  AND s.flow_type = 'feedback_24h'
  AND s.state NOT IN ('completed', 'transferred', 'failed')
  AND s.last_state_at < now() - interval '24 hours';

-- 3. Encerra as sessões.
UPDATE public.appointment_confirmation_sessions
SET state = 'failed',
    ended_at = now()
WHERE state NOT IN ('completed', 'transferred', 'failed')
  AND last_state_at < now() - interval '24 hours';
