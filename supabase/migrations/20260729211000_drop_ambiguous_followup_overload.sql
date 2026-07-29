-- api-followup-pending sem follow_number falhava com "Could not choose the best
-- candidate function": a chamada {p_user_id, p_minutes} casa tanto com o overload
-- de 2 args quanto com o de 3 (p_follow_number DEFAULT NULL). O de 3 args subsume
-- o de 2 (NULL = sem filtro + coluna follow_number extra) — remove o de 2 args.
DROP FUNCTION IF EXISTS public.get_followup_pending_contacts(uuid, integer);
