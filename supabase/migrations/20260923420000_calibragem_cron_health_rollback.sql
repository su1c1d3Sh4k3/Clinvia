-- Rollback de 20260923420000_calibragem_cron_health.sql
--
-- CONSEQUENCIA DE RODAR ISTO: toda falha de execucao de tarefa agendada volta a
-- nascer ALTA, sem olhar o placar do job, e cada linha de cron.job_run_details
-- volta a virar um incidente proprio. Pelos ultimos 7 dias isso significa 28
-- incidentes ALTA no lugar de 5 — o mesmo ruido que fez oito tarefas saudaveis
-- abrirem oito alertas por um unico tropeco de conexao de um minuto.
--
-- Se o incomodo for so o limiar de rajada, NAO rode isto: e a coluna
-- `llm_platform_settings.cron_health_rajada_jobs` e um `update` resolve.
-- Se o incomodo for o piso, tambem nao: e uma linha em
-- `incident_component_catalog` (component = 'cron:').
--
-- A coluna `cron_health_rajada_jobs` NAO e removida (fica inerte) e os 9
-- incidentes fechados NAO sao reabertos: eram falsos positivos antes e depois.

update public.incident_component_catalog
   set severidade_padrao = 'alta',
       acao_padrao = 'Veja a ultima execucao em cron.job_run_details e a resposta HTTP correlacionada em cron_http_calls. Status "succeeded" nao prova nada: net.http_post responde no momento em que ENFILEIRA, entao a falha real so aparece no codigo HTTP.',
       updated_at = now()
 where component = 'cron:' and match_tipo = 'prefixo';

update public.incident_component_catalog
   set is_active = false, updated_at = now()
 where component = 'cron-infra:';

create or replace function public.cron_health_scan(p_max integer default 300)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado      boolean;
    v_marca       bigint;
    v_ratio       numeric;
    v_limite      integer := greatest(1, coalesce(p_max, 300));
    v_nova_marca  bigint;
    v_reg         record;
    v_res         jsonb;
    v_sev         text;
    v_http_erros  integer := 0;
    v_timeouts    integer := 0;
    v_total       integer := 0;
    v_cron_erros  integer := 0;
    v_parados     integer := 0;
    v_alvo        text;
    v_dur_ms      integer;
    v_placar      text;
begin
    select coalesce(s.cron_health_enabled, true),
           coalesce(s.cron_health_last_response_id, 0),
           coalesce(s.cron_health_timeout_ratio, 0.30)
      into v_ligado, v_marca, v_ratio
      from public.llm_platform_settings s
     limit 1;

    if v_ligado is false then
        return jsonb_build_object('skipped', true, 'reason', 'cron_health_enabled=false');
    end if;

    -- ── A. respostas HTTP com erro, que o cron reportou como sucesso ─────────
    select count(*),
           count(*) filter (where r.status_code is null and r.error_msg is not null),
           max(r.id)
      into v_total, v_timeouts, v_nova_marca
      from net._http_response r
     where r.id > v_marca;

    for v_reg in
        select r.id, r.status_code, r.content, r.error_msg, r.created,
               c.alvo, c.origem
          from net._http_response r
          left join public.cron_http_calls c on c.request_id = r.id
         where r.id > v_marca
           and r.status_code is not null
           and r.status_code >= 400
         order by r.id
         limit v_limite
    loop
        v_sev := case
                     when v_reg.status_code in (401, 403) then 'critica'
                     when v_reg.status_code >= 500        then 'alta'
                     else 'media'
                 end;

        v_alvo := coalesce(v_reg.alvo, 'http-desconhecido');

        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'cron-http:' || v_alvo,
                'route', 'HTTP ' || v_reg.status_code,
                'error_message', 'Chamada HTTP de job respondeu ' || v_reg.status_code
                                 || ': ' || left(coalesce(v_reg.content, v_reg.error_msg, '(sem corpo)'), 300),
                'error_description', case
                    when v_reg.alvo is null then
                        'Alvo desconhecido: net._http_response nao guarda a URL e esta requisicao nao passou por clinvia_http_post.'
                    else 'Disparado por ' || v_reg.origem || '.'
                end,
                'request_id', 'nethttp:' || v_reg.id,
                'http_code', v_reg.status_code,
                'started_at', v_reg.created,
                'context', jsonb_build_object('response_id', v_reg.id, 'origem', v_reg.origem)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_http_erros := v_http_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
            end if;
        exception when others then
            raise warning '[cron_health] resposta %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    if v_total >= 20 and v_timeouts::numeric / v_total >= v_ratio then
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'cron-http:timeouts',
                'route', 'timeout_em_massa',
                'error_message', v_timeouts || ' de ' || v_total || ' chamadas HTTP de jobs expiraram nesta passada ('
                                 || round(100.0 * v_timeouts / v_total) || '%).',
                'error_description', 'Timeout isolado e normal no padrao fire-and-forget de 5s. Em massa significa edge function fora do ar ou banco travado.',
                'request_id', 'nethttp-timeout:' || v_nova_marca,
                'context', jsonb_build_object('timeouts', v_timeouts, 'total', v_total)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[cron_health] timeouts: %', sqlerrm;
        end;
    end if;

    -- ── B. o proprio cron falhou ─────────────────────────────────────────────
    for v_reg in
        select d.runid, d.jobid, j.jobname, j.schedule, j.command, j.username, j.database,
               d.status, d.return_message, d.start_time, d.end_time,
               (select count(*) from cron.job_run_details x
                 where x.jobid = d.jobid and x.start_time >= now() - interval '2 hours'
                   and x.status is distinct from 'succeeded' and x.status is distinct from 'running') as falhas_2h,
               (select count(*) from cron.job_run_details x
                 where x.jobid = d.jobid and x.start_time >= now() - interval '2 hours'
                   and x.status = 'succeeded') as ok_2h,
               (select x.status from cron.job_run_details x
                 where x.jobid = d.jobid and x.status is distinct from 'running'
                 order by x.start_time desc limit 1) as status_mais_recente
          from cron.job_run_details d
          join cron.job j on j.jobid = d.jobid
         where d.start_time >= now() - interval '2 hours'
           and d.status is distinct from 'succeeded'
           and d.status is distinct from 'running'
         order by d.start_time
         limit v_limite
    loop
        v_dur_ms := case
                        when v_reg.end_time is null then null
                        else greatest(0, round(extract(epoch from (v_reg.end_time - v_reg.start_time)) * 1000))::integer
                    end;

        v_placar := v_reg.falhas_2h || ' falha(s) e ' || v_reg.ok_2h
                    || ' execucao(oes) ok nas ultimas 2h; ultima execucao: '
                    || coalesce(v_reg.status_mais_recente, 'desconhecida');

        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'cron:' || v_reg.jobname,
                'route', v_reg.status || ':' || left(coalesce(v_reg.return_message, 'sem mensagem'), 60),
                'error_message', left(coalesce(v_reg.return_message, 'job terminou com status ' || v_reg.status), 400)
                                 || case when v_dur_ms is null then '' else ' (tentativa durou ' || v_dur_ms || 'ms)' end
                                 || '. Comando: ' || left(coalesce(v_reg.command, '(sem comando)'), 240),
                'error_description', v_placar,
                'request_id', 'cronrun:' || v_reg.runid,
                'started_at', v_reg.start_time,
                'context', jsonb_build_object(
                    'jobid', v_reg.jobid,
                    'schedule', v_reg.schedule,
                    'duracao_ms', v_dur_ms,
                    'falhas_2h', v_reg.falhas_2h,
                    'ok_2h', v_reg.ok_2h,
                    'ultima_execucao', v_reg.status_mais_recente,
                    'db_user', v_reg.username,
                    'db_name', v_reg.database
                )
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_cron_erros := v_cron_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[cron_health] run %: %', v_reg.runid, sqlerrm;
        end;
    end loop;

    -- ── C. job de minuto que parou de rodar ──────────────────────────────────
    insert into public.cron_health_seen (jobid, jobname)
    select j.jobid, j.jobname from cron.job j
    on conflict (jobid) do nothing;

    delete from public.cron_health_seen s
     where not exists (select 1 from cron.job j where j.jobid = s.jobid);

    for v_reg in
        select j.jobid, j.jobname, j.schedule,
               (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as ultima,
               s.first_seen
          from cron.job j
          join public.cron_health_seen s on s.jobid = j.jobid
         where j.active
           and j.schedule ~ '^\*(/[0-9]+)? '
           and s.first_seen < now() - interval '2 hours'
    loop
        if v_reg.ultima is null or v_reg.ultima < now() - interval '2 hours' then
            begin
                v_res := public.incident_record(jsonb_build_object(
                    'source', 'db_job',
                    'component', 'cron:' || v_reg.jobname,
                    'route', 'parado',
                    'error_message', 'Job ativo de schedule "' || v_reg.schedule
                                     || '" nao executa desde ' || coalesce(v_reg.ultima::text, 'nunca') || '.',
                    'request_id', 'cronstop:' || v_reg.jobid || ':' || to_char(now(), 'YYYYMMDDHH24'),
                    'context', jsonb_build_object('jobid', v_reg.jobid, 'schedule', v_reg.schedule)
                ));
                if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                    v_parados := v_parados + 1;
                    perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'critica');
                end if;
            exception when others then
                raise warning '[cron_health] parado %: %', v_reg.jobname, sqlerrm;
            end;
        end if;
    end loop;

    -- ── D. avanca a marca e poda o registro de chamadas ──────────────────────
    update public.llm_platform_settings
       set cron_health_last_response_id = greatest(coalesce(cron_health_last_response_id, 0), coalesce(v_nova_marca, 0)),
           cron_health_last_run_at = now();

    delete from public.cron_http_calls where created_at < now() - interval '2 hours';

    return jsonb_build_object(
        'ok', true,
        'respostas_lidas', v_total,
        'marca', greatest(v_marca, coalesce(v_nova_marca, 0)),
        'incidentes', jsonb_build_object(
            'http_erro', v_http_erros,
            'timeouts_na_passada', v_timeouts,
            'cron_falhou', v_cron_erros,
            'cron_parado', v_parados
        )
    );
end;
$$;

revoke all on function public.cron_health_scan(integer) from public, anon, authenticated;
grant execute on function public.cron_health_scan(integer) to service_role;
