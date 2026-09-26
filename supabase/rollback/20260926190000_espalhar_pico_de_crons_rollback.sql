-- Rollback de 20260926190000: devolve `incident-scan-db-sources` a fase 6.
-- Volta a colidir com `appointment-reminders` em :06/:16/:26/:36/:46/:56.

do $$
begin
    if exists (select 1 from cron.job where jobname = 'incident-scan-db-sources') then
        perform cron.schedule(
            'incident-scan-db-sources',
            '6-59/10 * * * *',
            (select command from cron.job where jobname = 'incident-scan-db-sources')
        );
    end if;
end
$$;
