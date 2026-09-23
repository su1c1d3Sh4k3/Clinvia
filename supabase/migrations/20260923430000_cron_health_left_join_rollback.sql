-- Rollback de 20260923430000_cron_health_left_join.sql
--
-- CONSEQUENCIA DE RODAR ISTO: o varredor volta a so enxergar falhas de jobs que
-- AINDA existem em `cron.job`. Um job que falhe e depois seja removido tem o
-- historico de falha apagado do relatorio sem deixar rastro — foi assim que 41
-- das 69 falhas dos ultimos 7 dias nunca foram relatadas.
--
-- Nao ha dado a desfazer: a mudanca era so o `join` do bloco B2 e o freio de
-- severidade para orfao antigo. Incidentes ja abertos por jobs sem cadastro
-- permanecem (sao relato historico, severidade baixa, painel apenas).

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
    v_rajada_min  integer;
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
    v_rajadas     integer := 0;
    v_rajadas_jan integer := 0;
    v_alvo        text;
    v_dur_ms      integer;
    v_placar      text;
begin
    select coalesce(s.cron_health_enabled, true),
           coalesce(s.cron_health_last_response_id, 0),
           coalesce(s.cron_health_timeout_ratio, 0.30),
           greatest(2, coalesce(s.cron_health_rajada_jobs, 3))
      into v_ligado, v_marca, v_ratio, v_rajada_min
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
        -- 401/403 = a classe de defeito que ficou semanas invisivel: falha
        -- silenciosa, deterministica e total. Nunca entra abaixo de critica.
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

    -- Piso de 20 respostas para nao alarmar com amostra minuscula.
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

    -- ── B1. rajada: muitos jobs distintos caindo no mesmo minuto ─────────────
    -- Quantos minutos de rajada existem na janela. Um so = tropeco; varios =
    -- degradacao. E a unica coisa que separa 23/09 12:00 de 22/09 18:00-18:30.
    select count(*) into v_rajadas_jan
      from (
        select date_trunc('minute', d.start_time) as minuto
          from cron.job_run_details d
         where d.start_time >= now() - interval '2 hours'
           and d.status is distinct from 'succeeded'
           and d.status is distinct from 'running'
         group by 1
        having count(distinct d.jobid) >= v_rajada_min
      ) s;

    for v_reg in
        select date_trunc('minute', d.start_time)                      as minuto,
               count(distinct d.jobid)                                 as jobs,
               count(*)                                                as runs,
               mode() within group (order by left(coalesce(d.return_message, 'sem mensagem'), 80)) as msg,
               string_agg(distinct coalesce(j.jobname, 'jobid ' || d.jobid), ', ' order by coalesce(j.jobname, 'jobid ' || d.jobid)) as nomes
          from cron.job_run_details d
          left join cron.job j on j.jobid = d.jobid
         where d.start_time >= now() - interval '2 hours'
           and d.status is distinct from 'succeeded'
           and d.status is distinct from 'running'
         group by 1
        having count(distinct d.jobid) >= v_rajada_min
         order by 1
    loop
        v_sev := case when v_rajadas_jan >= 2 then 'alta' else 'media' end;

        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'cron-infra:rajada',
                -- a mensagem entra na rota: rajada de conexao e rajada de
                -- permissao sao panes diferentes, com donos diferentes.
                'route', left(v_reg.msg, 60),
                'error_message', v_reg.jobs || ' tarefas agendadas falharam no mesmo minuto ('
                                 || to_char(v_reg.minuto at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
                                 || ') com "' || left(v_reg.msg, 80) || '". Nao e defeito de nenhuma delas: '
                                 || left(v_reg.nomes, 240),
                'error_description', case
                    when v_rajadas_jan >= 2 then
                        v_rajadas_jan || ' minutos de rajada nas ultimas 2h: e degradacao, nao tropeco.'
                    else
                        'Minuto isolado nas ultimas 2h: tropeco de conexao que se curou sozinho.'
                end,
                -- uma abertura por minuto de rajada; reincidencia soma evento
                'request_id', 'cronburst:' || to_char(v_reg.minuto, 'YYYYMMDDHH24MI'),
                'started_at', v_reg.minuto,
                'context', jsonb_build_object(
                    'minuto', v_reg.minuto,
                    'jobs_distintos', v_reg.jobs,
                    'execucoes', v_reg.runs,
                    'minutos_de_rajada_na_janela', v_rajadas_jan,
                    'jobs', v_reg.nomes
                )
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_rajadas := v_rajadas + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
            end if;
            -- reincidencia escala: o incidente ja existe, o piso e que sobe
            perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, v_sev);
        exception when others then
            raise warning '[cron_health] rajada %: %', v_reg.minuto, sqlerrm;
        end;
    end loop;

    -- ── B2. o proprio cron falhou, fora de rajada ────────────────────────────
    -- Idempotente por runid, entao reler 2h a cada passada nao infla nada.
    for v_reg in
        with falhas as (
            select d.runid, d.jobid, d.status, d.return_message, d.start_time, d.end_time,
                   date_trunc('minute', d.start_time) as minuto
              from cron.job_run_details d
             where d.start_time >= now() - interval '2 hours'
               and d.status is distinct from 'succeeded'
               and d.status is distinct from 'running'
        ),
        minutos as (
            select minuto, count(distinct jobid) as jobs_no_minuto
              from falhas group by minuto
        )
        select f.runid, f.jobid, j.jobname, j.schedule, j.command, j.username, j.database,
               f.status, f.return_message, f.start_time, f.end_time,
               -- placar do job na mesma janela que o varredor le
               (select count(*) from cron.job_run_details x
                 where x.jobid = f.jobid and x.start_time >= now() - interval '2 hours'
                   and x.status is distinct from 'succeeded' and x.status is distinct from 'running') as falhas_2h,
               (select count(*) from cron.job_run_details x
                 where x.jobid = f.jobid and x.start_time >= now() - interval '2 hours'
                   and x.status = 'succeeded') as ok_2h,
               -- 24h e o que separa tropeco de pane: job horario quebrado tem
               -- no maximo 2 falhas em 2h e pareceria inofensivo.
               (select count(*) from cron.job_run_details x
                 where x.jobid = f.jobid and x.start_time >= now() - interval '24 hours'
                   and x.status is distinct from 'succeeded' and x.status is distinct from 'running') as falhas_24h,
               (select count(*) from cron.job_run_details x
                 where x.jobid = f.jobid and x.start_time >= now() - interval '24 hours'
                   and x.status = 'succeeded') as ok_24h,
               (select x.status from cron.job_run_details x
                 where x.jobid = f.jobid and x.status is distinct from 'running'
                 order by x.start_time desc limit 1) as status_mais_recente
          from falhas f
          join minutos m on m.minuto = f.minuto
          join cron.job j on j.jobid = f.jobid
         where m.jobs_no_minuto < v_rajada_min   -- rajada ja virou um incidente so
         order by f.start_time
         limit v_limite
    loop
        -- duracao em ms: "connection failed" em 2ms e pool esgotado, em 30s e
        -- banco inacessivel. A mensagem do Postgres e a mesma nos dois casos.
        v_dur_ms := case
                        when v_reg.end_time is null then null
                        else greatest(0, round(extract(epoch from (v_reg.end_time - v_reg.start_time)) * 1000))::integer
                    end;

        -- O placar deixou de ser enfeite: e ele que decide a severidade.
        v_sev := case
                     when v_reg.ok_24h = 0 and v_reg.falhas_24h >= 3 then 'alta'
                     when v_reg.falhas_2h <= 1 and v_reg.ok_2h > 0
                          and v_reg.status_mais_recente = 'succeeded'  then 'baixa'
                     else 'media'
                 end;

        v_placar := v_reg.falhas_2h || ' falha(s) e ' || v_reg.ok_2h
                    || ' execucao(oes) ok nas ultimas 2h; em 24h, '
                    || v_reg.falhas_24h || ' falha(s) e ' || v_reg.ok_24h || ' ok; ultima execucao: '
                    || coalesce(v_reg.status_mais_recente, 'desconhecida')
                    || case v_sev
                           when 'alta'  then '. Nada funcionou em 24h: isto e pane.'
                           when 'baixa' then '. Falha isolada e o job voltou a rodar: tropeco.'
                           else '. Falhando de forma intermitente.'
                       end;

        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'cron:' || v_reg.jobname,
                -- status + inicio da mensagem: 'connection failed' e
                -- 'permission denied' do mesmo job sao incidentes diferentes.
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
                    'falhas_24h', v_reg.falhas_24h,
                    'ok_24h', v_reg.ok_24h,
                    'ultima_execucao', v_reg.status_mais_recente,
                    'severidade_pelo_placar', v_sev,
                    'db_user', v_reg.username,
                    'db_name', v_reg.database
                )
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_cron_erros := v_cron_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
                -- tropeco que virou pane: o incidente ja existe, so o piso sobe
                perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, v_sev);
            end if;
        exception when others then
            raise warning '[cron_health] run %: %', v_reg.runid, sqlerrm;
        end;
    end loop;

    -- ── C. job de minuto que parou de rodar ──────────────────────────────────
    -- Sem execucao nao ha linha em lugar nenhum: este e o unico sinal possivel.
    -- So jobs sub-horarios (`*` ou `*/n` no campo de minuto) entram, senao um
    -- job diario acusaria parada 23 horas por dia.
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
           -- carencia: job recem-criado ainda nao teve chance de rodar
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
                    -- uma abertura por hora por job, senao repete a cada 5 min
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
    -- A marca avanca mesmo quando o `limit` cortou linhas: o corte so acontece
    -- acima de 300 erros numa janela de 5 min, cenario em que perder as ultimas
    -- e irrelevante — o incidente ja abriu e o event_count ja esta gritando.
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
            'cron_rajada', v_rajadas,
            'minutos_de_rajada_na_janela', v_rajadas_jan,
            'cron_parado', v_parados
        )
    );
end;
$$;

comment on function public.cron_health_scan(integer) is
    'Vigia de tarefas agendadas. Le net._http_response (o cron mente: net.http_post responde ao enfileirar), as execucoes de pg_cron e os jobs sub-horarios que pararam. A severidade de uma falha de execucao vem do placar do job, nao de um valor fixo; varios jobs caindo no mesmo minuto viram um unico incidente de infraestrutura.';

revoke all on function public.cron_health_scan(integer) from public, anon, authenticated;
grant execute on function public.cron_health_scan(integer) to service_role;
