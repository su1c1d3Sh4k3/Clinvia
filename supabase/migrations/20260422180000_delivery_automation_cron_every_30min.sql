-- Change dispatcher cron from daily 10h BRT to every 30 min. The dispatcher
-- itself filters by delivery_config.send_hour/send_minute matching the
-- current BRT 30-min slot.
DO $$ BEGIN PERFORM cron.unschedule('delivery-automation-dispatcher'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
    'delivery-automation-dispatcher',
    '0,30 * * * *',
    $CRON$SELECT public.invoke_delivery_automation_dispatcher()$CRON$
);
