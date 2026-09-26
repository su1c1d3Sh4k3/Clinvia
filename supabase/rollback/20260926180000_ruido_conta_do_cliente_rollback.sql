-- Rollback de 20260926180000_ruido_conta_do_cliente.sql
--
-- Devolve o catalogo ao estado medido em 26/09/2026 ANTES da migration e
-- reemite `instagram_refresh_tokens_run()` exatamente como estava viva
-- (lida com pg_get_functiondef, incluindo o `'origem','cron'` que so existia
-- no banco).
--
-- As tres linhas CRIADAS pela migration saem por `is_active = false`, NUNCA por
-- delete: apagar a linha PROMOVE o componente — tira o piso e tira o
-- `somente_painel`, e `instagram:renovacao-falhou` voltaria a casar em nada e
-- `uzapi-instancias-orfas` voltaria a casar no prefixo `uzapi-` (alta, telefone).

set lock_timeout = '5s';
set statement_timeout = '120s';

update public.incident_component_catalog
   set severidade_padrao = 'alta',
       severidade_teto   = null,
       somente_painel    = false,
       acao_padrao       = 'Reconecte a conta em Conexoes > Instagram. Renovar so funciona com token ainda valido, '
                           'entao token ja vencido nao tem conserto automatico.',
       updated_at        = now()
 where component = 'instagram:token-vencido';

update public.incident_component_catalog
   set somente_painel = false,
       updated_at     = now()
 where component in ('uazapi:instancia-desconectada', 'meta:instancia-desconectada', 'envio:conta-');

update public.incident_component_catalog
   set severidade_padrao = 'media',
       severidade_teto   = null,
       somente_painel    = false,
       updated_at        = now()
 where component in ('uazapi:varredura-cega', 'uazapi:remocao-pendente');

update public.incident_component_catalog
   set is_active  = false,
       updated_at = now()
 where component in ('uzapi-instancias-orfas', 'meta:fora_do_ar', 'instagram:renovacao-falhou');

create or replace function public.instagram_refresh_tokens_run()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url       text;
    v_jwt       text;
    v_edge      text;
    v_reg       record;
    v_res       jsonb;
    v_enviados  integer := 0;
    v_expirados integer := 0;
    v_mentindo  integer := 0;
    v_saudaveis integer := 0;
begin
    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    if v_url is null then
        raise exception 'SUPABASE_URL ausente no vault — nao da para chamar a edge function';
    end if;

    for v_reg in
        select i.id, i.account_name, i.token_expires_at
          from public.instagram_instances i
         where i.access_token is not null
           and i.token_expires_at is not null
           and i.token_expires_at > now()
           and i.token_expires_at < now() + interval '15 days'
         order by i.token_expires_at
    loop
        perform public.clinvia_http_post(
            p_alvo    := 'instagram-refresh-token',
            p_origem  := 'cron:instagram-refresh-tokens',
            p_url     := v_url || '/functions/v1/instagram-refresh-token',
            p_headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
                'x-service-key', coalesce(v_edge, v_jwt)
            ),
            p_body    := jsonb_build_object('instance_id', v_reg.id)
        );
        v_enviados := v_enviados + 1;
    end loop;

    for v_reg in
        select i.id, i.account_name, i.status, i.token_expires_at
          from public.instagram_instances i
         where i.token_expires_at is not null
           and i.token_expires_at < now()
    loop
        v_expirados := v_expirados + 1;

        if v_reg.status is distinct from 'expired' then
            v_mentindo := v_mentindo + 1;
            update public.instagram_instances
               set status = 'expired', updated_at = now()
             where id = v_reg.id;
        end if;

        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'db_job',
                'component', 'instagram:token-vencido',
                'route', v_reg.account_name,
                'error_message', 'Token do Instagram da conta @' || coalesce(v_reg.account_name, '(sem nome)')
                              || ' venceu e nao pode mais ser renovado. So reconectando por OAuth.',
                'error_description', 'Venceu em ' || to_char(v_reg.token_expires_at at time zone 'America/Sao_Paulo',
                                                             'DD/MM/YYYY HH24:MI') || ' (horario de Brasilia). '
                                  || 'A API do Instagram so renova token que ainda vale.',
                'context', jsonb_build_object('instance_id', v_reg.id,
                                              'status_antes', v_reg.status,
                                              'expirou_em', v_reg.token_expires_at)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                -- Ver "REGRA DE RUIDO" no cabecalho.
                if v_reg.status is distinct from 'expired' then
                    perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
                    perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, 'alta');
                else
                    perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'media');
                end if;
            end if;
        exception when others then
            raise warning '[ig-refresh] incidente da conta %: %', v_reg.account_name, sqlerrm;
        end;
    end loop;

    select count(*) into v_saudaveis
      from public.instagram_instances i
     where i.token_expires_at is not null
       and i.token_expires_at >= now() + interval '15 days';

    return jsonb_build_object(
        'enviados_para_renovar', v_enviados,
        'ja_vencidos', v_expirados,
        'estavam_mentindo_connected', v_mentindo,
        'fora_da_janela_ok', v_saudaveis,
        'quando', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    );
end;
$$;

revoke all on function public.instagram_refresh_tokens_run() from public, anon, authenticated;
grant execute on function public.instagram_refresh_tokens_run() to service_role;
