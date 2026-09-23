-- Rollback de 20260923260000 (conserto do instagram-refresh-tokens).
--
-- AVISO: voltar atras reinstala um cron que NAO FUNCIONA. O comando original
-- monta a URL com `current_setting('app.settings.supabase_url', true)`, GUC que
-- nunca existiu neste projeto — e o `true` devolve NULL calado. Se algum dia ele
-- casar uma instancia dentro da janela, vai falhar com "null value in column url".
-- Hoje ele nem chega la: o `token_expires_at > NOW()` nao casa nada e o job grava
-- `succeeded` sem fazer coisa alguma. Este arquivo existe por disciplina, nao
-- porque exista motivo bom para usa-lo.

do $$
begin
    if exists (select 1 from cron.job where jobname = 'instagram-refresh-tokens') then
        perform cron.unschedule('instagram-refresh-tokens');
    end if;
end $$;

select cron.schedule(
    'instagram-refresh-tokens',
    '15 4 * * *',
    $cmd$
    select net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/instagram-refresh-token',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('instance_id', i.id)
    )
    from instagram_instances i
    where i.status = 'connected'
      and i.access_token is not null
      and i.token_expires_at is not null
      and i.token_expires_at > now()
      and i.token_expires_at < now() + interval '15 days';
    $cmd$
);

drop function if exists public.instagram_refresh_tokens_run();
