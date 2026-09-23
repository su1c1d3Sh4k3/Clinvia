-- Placar para o bloco A (chamadas HTTP de job), do mesmo jeito que o B2 ja tinha.
--
-- Medido em 23/09/2026 15:45: `cron-http:delivery-automation-worker` levou
-- 'alta' e tocou o telefone por UM unico 502 de gateway, com 1 evento. Na mesma
-- janela de 2h o mesmo alvo tinha 119 chamadas bem-sucedidas. A severidade do
-- bloco A vinha so do codigo HTTP; o placar do alvo nao era consultado.
--
-- Tres mudancas:
--
--   1. `cron_http_calls` passa a guardar o DESFECHO (`status_code`, `checked_at`).
--      Sem isso nao existe placar: `net._http_response` e podada em 30 minutos e
--      cada passada veria a falha isolada, sem saber dos sucessos ao redor.
--      Retencao da tabela vai de 2h para 26h para sustentar a janela de 24h.
--
--   2. A severidade passa a sair do placar: sem nenhum sucesso em 24h e 3+ falhas
--      = alta; falha isolada com o alvo respondendo ok = baixa; o meio = media.
--      401/403 seguem criticos por regra e nenhum placar os rebaixa — foi
--      exatamente a classe que ficou semanas muda no alert-notify.
--
--   3. O piso do catalogo para o prefixo `cron-http:` cai de 'alta' para 'media'.
--      Sem isto os itens 1 e 2 seriam decorativos: `incident_severidade_efetiva`
--      pega o MAIOR entre a leitura e o piso, entao um 'baixa' do placar sairia
--      'alta' assim mesmo e tocaria o telefone do mesmo jeito. `cron:` ja e
--      'media' — o bloco A so nunca foi acertado junto.
--
-- Orcamento de ruido, 7 dias reais: 2 incidentes `cron-http%` foram para o
-- telefone (alert-notify 401 e delivery-automation-worker 502). Com esta regra,
-- o 401 continua critico e o 502 fica no painel. 2/semana -> 1/semana.
--
-- Rollback: 20260923440000_cron_http_placar_rollback.sql

alter table public.cron_http_calls
    add column if not exists status_code integer,
    add column if not exists checked_at  timestamptz;

comment on column public.cron_http_calls.status_code is
    'Desfecho da chamada, copiado de net._http_response antes da poda de 30 min. -1 = expirou sem resposta. E o que permite ao bloco A do cron_health_scan ter placar.';

-- indice do placar: as 5 subconsultas por alvo/janela sao o caminho quente
create index if not exists idx_cron_http_calls_alvo_created
    on public.cron_http_calls (alvo, created_at desc) include (status_code);

update public.incident_component_catalog
   set severidade_padrao = 'media',
       descricao = 'Chamada HTTP disparada por tarefa agendada respondeu com erro. A severidade vem do placar do alvo (bloco A do cron_health_scan); 401/403 sao criticos por regra.',
       updated_at = now()
 where component = 'cron-http:' and match_tipo = 'prefixo';

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
    v_orfao_morto boolean;
    v_orfaos      integer := 0;
    v_http_sev    text;
    v_http_placar text;
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

    -- net._http_response e podada em 30 min. Sem carimbar o desfecho em
    -- cron_http_calls nao ha placar possivel: cada passada veria uma unica
    -- resposta solta e nao saberia dizer se aquele alvo respondeu ok 40 vezes
    -- antes. -1 = expirou (status_code nulo com erro de transporte).
    update public.cron_http_calls c
       set status_code = coalesce(r.status_code, -1),
           checked_at  = now()
      from net._http_response r
     where r.id = c.request_id
       and c.checked_at is null;

    for v_reg in
        select r.id, r.status_code, r.content, r.error_msg, r.created,
               c.alvo, c.origem,
               -- placar do MESMO alvo, lido de cron_http_calls (que guarda 26h)
               (select count(*) from public.cron_http_calls x
                 where x.alvo = c.alvo and x.created_at >= now() - interval '2 hours'
                   and (x.status_code >= 400 or x.status_code = -1)) as falhas_2h,
               (select count(*) from public.cron_http_calls x
                 where x.alvo = c.alvo and x.created_at >= now() - interval '2 hours'
                   and x.status_code between 200 and 399) as ok_2h,
               (select count(*) from public.cron_http_calls x
                 where x.alvo = c.alvo and x.created_at >= now() - interval '24 hours'
                   and (x.status_code >= 400 or x.status_code = -1)) as falhas_24h,
               (select count(*) from public.cron_http_calls x
                 where x.alvo = c.alvo and x.created_at >= now() - interval '24 hours'
                   and x.status_code between 200 and 399) as ok_24h,
               -- ordena por request_id, nao por created_at: `created_at` e o
               -- now() da TRANSACAO, entao duas chamadas do mesmo bloco empatam
               -- e o desempate vira arbitrario — foi assim que o teste inverso
               -- leu "ultima resposta: 404" depois de duas respostas ok. O id de
               -- net._http_response vem de sequence e e monotonico de verdade.
               (select x.status_code from public.cron_http_calls x
                 where x.alvo = c.alvo and x.status_code is not null
                 order by x.request_id desc limit 1) as ultimo_code
          from net._http_response r
          left join public.cron_http_calls c on c.request_id = r.id
         where r.id > v_marca
           and r.status_code is not null
           and r.status_code >= 400
         order by r.id
         limit v_limite
    loop
        -- 401/403 = a classe de defeito que ficou semanas invisivel: falha
        -- silenciosa, deterministica e total. Nunca entra abaixo de critica, e
        -- placar nenhum a rebaixa: chave errada nao melhora sozinha.
        --
        -- O RESTO passou a ser decidido pelo placar do alvo, nao pelo codigo
        -- HTTP. Motivo medido: 23/09 15:45, UM unico 502 de gateway em
        -- delivery-automation-worker virou 'alta' e foi ao telefone, enquanto o
        -- mesmo alvo tinha 119 chamadas ok na mesma janela. 502 isolado e
        -- tropeco de gateway; 502 sem nenhum sucesso em 24h e pane.
        v_http_sev := case
                          when v_reg.status_code in (401, 403)              then 'critica'
                          when v_reg.ok_24h = 0 and v_reg.falhas_24h >= 3   then 'alta'
                          when v_reg.falhas_2h <= 1 and v_reg.ok_2h > 0
                               and v_reg.ultimo_code between 200 and 399    then 'baixa'
                          else 'media'
                      end;
        v_sev := v_http_sev;

        v_http_placar := v_reg.falhas_2h || ' falha(s) e ' || v_reg.ok_2h
                         || ' resposta(s) ok nas ultimas 2h; em 24h, '
                         || v_reg.falhas_24h || ' falha(s) e ' || v_reg.ok_24h
                         || ' ok; ultima resposta: ' || coalesce(v_reg.ultimo_code::text, 'desconhecida')
                         || case
                                when v_reg.status_code in (401, 403)
                                    then '. Autenticacao recusada: nao e tropeco e nao melhora sozinho.'
                                when v_http_sev = 'alta'  then '. Nada respondeu ok em 24h: isto e pane.'
                                when v_http_sev = 'baixa' then '. Falha isolada com o alvo respondendo ok: tropeco de gateway.'
                                else '. Falhando de forma intermitente.'
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
                    else 'Disparado por ' || v_reg.origem || '. ' || v_http_placar
                end,
                'request_id', 'nethttp:' || v_reg.id,
                'http_code', v_reg.status_code,
                'started_at', v_reg.created,
                'context', jsonb_build_object(
                    'response_id', v_reg.id, 'origem', v_reg.origem,
                    'falhas_2h', v_reg.falhas_2h, 'ok_2h', v_reg.ok_2h,
                    'falhas_24h', v_reg.falhas_24h, 'ok_24h', v_reg.ok_24h,
                    'ultima_resposta', v_reg.ultimo_code,
                    'severidade_pelo_placar', v_http_sev)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_http_erros := v_http_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
            end if;
            -- tropeco que virou pane: o incidente ja existe, so o piso sobe
            perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, v_sev);
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
                   d.command, d.username, d.database,
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
        select f.runid, f.jobid,
               -- sem cadastro o incidente ainda precisa de um nome estavel, senao
               -- cada passada abriria um componente novo
               coalesce(j.jobname, 'jobid-' || f.jobid) as jobname,
               (j.jobid is null)                        as sem_cadastro,
               j.schedule,
               -- `cron.job` some junto com o job, mas a EXECUCAO guarda comando,
               -- usuario e banco. Sem este coalesce o incidente que o left join
               -- resgata chegaria com '(sem comando)' — resgatado e mudo.
               coalesce(j.command,  f.command)  as command,
               coalesce(j.username, f.username) as username,
               coalesce(j.database, f.database) as database,
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
          -- left: `cron.job` perde a linha quando o job e removido, e o join
          -- interno apagava junto todo o historico de falha dele.
          left join cron.job j on j.jobid = f.jobid
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

        -- Job sem cadastro cuja falha e de mais de 30 min atras ja foi embora:
        -- relatar e util (fica o rastro), acordar alguem nao.
        v_orfao_morto := v_reg.sem_cadastro
                         and v_reg.start_time < now() - interval '30 minutes';

        -- O placar deixou de ser enfeite: e ele que decide a severidade.
        v_sev := case
                     when v_orfao_morto                              then 'baixa'
                     when v_reg.ok_24h = 0 and v_reg.falhas_24h >= 3 then 'alta'
                     when v_reg.falhas_2h <= 1 and v_reg.ok_2h > 0
                          and v_reg.status_mais_recente = 'succeeded'  then 'baixa'
                     else 'media'
                 end;

        v_placar := v_reg.falhas_2h || ' falha(s) e ' || v_reg.ok_2h
                    || ' execucao(oes) ok nas ultimas 2h; em 24h, '
                    || v_reg.falhas_24h || ' falha(s) e ' || v_reg.ok_24h || ' ok; ultima execucao: '
                    || coalesce(v_reg.status_mais_recente, 'desconhecida')
                    || case
                           when v_orfao_morto   then '. Este job NAO existe mais em cron.job e a falha e de mais de 30 min atras: relato historico, sem acao.'
                           when v_sev = 'alta'  then '. Nada funcionou em 24h: isto e pane.'
                           when v_sev = 'baixa' then '. Falha isolada e o job voltou a rodar: tropeco.'
                           else '. Falhando de forma intermitente.'
                       end
                    || case
                           when v_reg.sem_cadastro and not v_orfao_morto
                               then ' ATENCAO: executou agora ha pouco mas NAO aparece em cron.job — ou foi removido no meio da pane, ou pertence a outro dono e o RLS o esconde.'
                           else ''
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
                    'sem_cadastro_em_cron_job', v_reg.sem_cadastro,
                    'orfao_ja_morto', v_orfao_morto,
                    'db_user', v_reg.username,
                    'db_name', v_reg.database
                )
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_cron_erros := v_cron_erros + 1;
                if v_reg.sem_cadastro then
                    v_orfaos := v_orfaos + 1;
                end if;
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

    -- 26h, nao 2h: o placar de 24h do bloco A le desta tabela.
    delete from public.cron_http_calls where created_at < now() - interval '26 hours';

    return jsonb_build_object(
        'ok', true,
        'respostas_lidas', v_total,
        'marca', greatest(v_marca, coalesce(v_nova_marca, 0)),
        'incidentes', jsonb_build_object(
            'http_erro', v_http_erros,
            'timeouts_na_passada', v_timeouts,
            'cron_falhou', v_cron_erros,
            'cron_sem_cadastro', v_orfaos,
            'cron_rajada', v_rajadas,
            'minutos_de_rajada_na_janela', v_rajadas_jan,
            'cron_parado', v_parados
        )
    );
end;
$$;

comment on function public.cron_health_scan(integer) is
    'Vigia de tarefas agendadas. Le net._http_response (o cron mente: net.http_post responde ao enfileirar), as execucoes de pg_cron e os jobs sub-horarios que pararam. A severidade vem do PLACAR — do alvo, no bloco A; do job, no bloco B2 — e nao de um valor fixo; 401/403 sao a excecao e seguem criticos. Varios jobs caindo no mesmo minuto viram um unico incidente de infraestrutura. Falha de job que nao esta mais em cron.job tambem e relatada (left join), como baixa quando a falha ja e antiga.';

revoke all on function public.cron_health_scan(integer) from public, anon, authenticated;
grant execute on function public.cron_health_scan(integer) to service_role;
