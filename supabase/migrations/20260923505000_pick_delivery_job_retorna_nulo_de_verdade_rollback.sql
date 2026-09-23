-- Rollback: volta a versao que devolve a linha de NULLs (comportamento de
-- 20260420120000). Isto REABRE o laco de 700 mil chamadas 400 por dia — so
-- rode se a correcao tiver quebrado alguma coisa pior.

CREATE OR REPLACE FUNCTION public.pick_delivery_automation_job()
RETURNS public.delivery_automation_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claimed public.delivery_automation_jobs;
BEGIN
    WITH candidate AS (
        SELECT id
        FROM public.delivery_automation_jobs
        WHERE status = 'pending'
          AND scheduled_at <= now()
        ORDER BY scheduled_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    UPDATE public.delivery_automation_jobs j
       SET status = 'running',
           picked_at = now(),
           attempts = attempts + 1
      FROM candidate
     WHERE j.id = candidate.id
     RETURNING j.* INTO claimed;

    RETURN claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_delivery_automation_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_delivery_automation_job() TO service_role;
