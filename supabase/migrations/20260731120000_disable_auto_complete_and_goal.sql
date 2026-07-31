-- Desativação dos sistemas legados (decisão do usuário, 2026-07-31):
-- 1) "Lançar receita de agendamentos automaticamente" (auto_complete) — cron
--    auto-complete-appointments desagendado + flag zerada para todos os users.
--    Conclusão manual de agendamentos segue gerando receita/Ganho normalmente.
-- 2) Template de Notificação — apenas UI (coluna notification_template mantida,
--    sem consumidores).
-- 3) Meta Mensal de Agendamentos — apenas UI/relatório (tabela appointment_goals
--    mantida, sem consumidores).

SELECT cron.unschedule('auto-complete-appointments');

UPDATE public.scheduling_settings
SET auto_complete = FALSE
WHERE auto_complete = TRUE;
