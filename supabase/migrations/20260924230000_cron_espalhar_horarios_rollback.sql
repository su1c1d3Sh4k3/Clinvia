-- Rollback de 20260924230000_cron_espalhar_horarios.sql
--
-- Devolve os 28 jobs ao offset zero em que estavam. Nenhuma frequencia muda:
-- este rollback so reempilha todo mundo no mesmo minuto de novo.
--
-- ATENCAO: este e o estado que PRODUZ as rajadas de "connection failed". Com
-- 42 jobs ativos e folga de 14 conexoes, o minuto 0 volta a 25-26 partidas
-- simultaneas e as falhas voltam junto — 16,7% dos minutos com 25 jobs
-- falharam na serie de 8 dias. Nao e um estado neutro.
--
-- So rode isto se o espalhamento tiver quebrado uma ordem de execucao que a
-- gente nao mapeou, e nesse caso o certo e corrigir AQUELE offset, nao voltar
-- os 28.

begin;

do $$
declare
    v_alvo   record;
    v_jobid  bigint;
begin
    for v_alvo in
        select * from (values
            ('incident-analyze-scan',        '*/2 * * * *'),
            ('process-auto-follow-up',       '*/2 * * * *'),
            ('auto-close-worker',            '*/5 * * * *'),
            ('cron-health-watch',            '*/5 * * * *'),
            ('openai-provision-worker',      '*/5 * * * *'),
            ('appointment-reminders',        '*/10 * * * *'),
            ('appointment-confirmation-cron','*/10 * * * *'),
            ('mark-waiting-appointments',    '*/10 * * * *'),
            ('process-auto-messages',        '*/10 * * * *'),
            ('uzapi-health-check',           '*/10 * * * *'),
            ('incident-scan-db-sources',     '*/10 * * * *'),
            ('entrada-invalida-scan',        '*/10 * * * *'),
            ('cleanup-pg-net-responses',     '*/15 * * * *'),
            ('alert-channel-watch',          '*/15 * * * *'),
            ('provisionamento-scan',         '*/15 * * * *'),
            ('reset-stuck-webhook-jobs',     '*/30 * * * *'),
            ('instagram-window-expired-check','*/30 * * * *'),
            ('delivery-automation-dispatcher','0,30 * * * *'),
            ('campaign-expiry',              '0 * * * *'),
            ('openai-saldo-scan',            '15 * * * *'),
            ('openai-usage-sync-hourly',     '20 * * * *'),
            ('openai-alerts-scan',           '30 * * * *'),
            ('alert-summary',                '0 */2 * * *'),
            ('cleanup-cron-history',         '0 */6 * * *'),
            ('account-emails-cron',          '0 8 * * *'),
            ('generate-opportunities-daily', '0 8 * * *'),
            ('recurrence-campaign-generator','0 8 * * *'),
            ('cleanup-tickets-daily',        '0 3 * * *'),
            ('cleanup-webhook-queue-daily',  '0 3 * * *')
        ) as t(jobname, schedule)
    loop
        select j.jobid into v_jobid from cron.job j where j.jobname = v_alvo.jobname;
        if v_jobid is not null then
            perform cron.alter_job(v_jobid, schedule => v_alvo.schedule);
        end if;
    end loop;
end;
$$;

commit;
