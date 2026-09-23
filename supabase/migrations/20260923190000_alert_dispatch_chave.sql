-- Por que esta migration existe
-- ==============================
-- O despachante `alert-dispatch` (20260923170000) rodou de minuto em minuto,
-- "succeeded" no cron, e mesmo assim NADA saiu: o `net.http_post` voltava
-- 401 {"success":false,"error":"Não autorizado"}.
--
-- Motivo medido em 23/09 09:14: o projeto migrou para as chaves novas da
-- Supabase. Dentro da edge function, `SUPABASE_SERVICE_ROLE_KEY` hoje vale a
-- chave nova (`sb_secret_...`), enquanto o cofre (`vault`) ainda guarda o JWT
-- antigo (`eyJhbGciOiJI...`, 219 caracteres). O gateway aceita os dois — por
-- isso a chamada chegava na função —, mas `alert-notify` compara o header com
-- a SUA variável de ambiente, e aí as duas não batiam.
--
-- Comprovação: a MESMA chamada com a chave nova devolveu
--   {"success":true,"despachados":1,...,"enviados":1} e gravou o wamid.
--
-- Correção: um segredo novo no cofre, `SUPABASE_EDGE_SECRET_KEY`, com a chave
-- nova. O JWT antigo continua onde está e NÃO é tocado — ele é usado por vários
-- outros crons que funcionam, e trocá-lo seria mexer em produção sem
-- necessidade. Quando o segredo novo não existir, a função cai no antigo: é o
-- comportamento de hoje, nem melhor nem pior.
--
-- O `Authorization` continua indo (o gateway exige) e o `x-service-key` carrega
-- a chave que a função confere. Os dois headers, um papel cada.
--
-- O segredo é criado FORA desta migration, à mão, porque o valor não pode
-- entrar no repositório:
--   select vault.create_secret('<sb_secret_...>', 'SUPABASE_EDGE_SECRET_KEY', '...');
-- Já criado em 23/09 no projeto swfshqvvbohnahdyndch.
--
-- DÍVIDA ANOTADA: qualquer outra função que confira a chave por conta própria e
-- seja acordada por cron tem o mesmo problema latente. Auditar as invocadoras
-- é item separado; aqui só o despachante de alertas foi corrigido.

create or replace function public.invoke_alert_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url  text;
    v_jwt  text;
    v_edge text;
begin
    -- de minuto em minuto, mas so acorda a edge function quando ha o que enviar
    if public.incident_notify_pending_count() = 0 then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform net.http_post(
        url := v_url || '/functions/v1/alert-notify',
        headers := jsonb_build_object(
            'Content-Type',   'application/json',
            -- gateway: aceita tanto o JWT antigo quanto a chave nova
            'Authorization',  'Bearer ' || coalesce(v_edge, v_jwt),
            -- a funcao: compara com o proprio SUPABASE_SERVICE_ROLE_KEY dela
            'x-service-key',  coalesce(v_edge, v_jwt)
        ),
        body := jsonb_build_object('action', 'dispatch')
    );
exception when others then
    raise warning 'invoke_alert_dispatch: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_alert_dispatch() from public, anon, authenticated;
grant execute on function public.invoke_alert_dispatch() to postgres;
