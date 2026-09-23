-- Calibragem do cron-health-watch apos a primeira hora rodando sozinho.
--
-- ACHADO (23/09, ~10:20 BRT): a falha de 140 dias do instagram-enrich-profiles
-- foi classificada como "Tempo esgotado chamando servico externo" e rebaixada a
-- `media`. Ela nao e timeout nenhum — e uma violacao de NOT NULL. O que aconteceu:
--
--   O Postgres devolve o erro do job com o bloco DETAIL junto, e o DETAIL de uma
--   violacao em `net.http_request_queue` despeja a LINHA INTEIRA que falhou,
--   incluindo o nome da coluna `timeout_milliseconds`. O catalogo casa por
--   SUBSTRING, entao o padrao 'timeout' casou dentro de um nome de coluna, na
--   posicao 318 de um texto que nada tem a ver com timeout.
--
-- Por que isso e grave e nao cosmetico: `incident_claim_for_notification` so
-- reserva incidente `critica` ou `alta`. Rebaixar para `media` nao deixa o
-- alerta feio — deixa o alerta MUDO. A falha real de 140 dias jamais teria
-- chegado no WhatsApp. E um falso NEGATIVO gerado pelo classificador.
--
-- Duas correcoes, nesta ordem de importancia:
--
--   1. ESTRUTURAL — parar de alimentar o classificador com despejo de linha.
--      So a primeira linha do erro (a mensagem de verdade) vai para
--      `error_message`; DETAIL/HINT/CONTEXT/QUERY/LINE inteiros continuam
--      guardados em `error_description`, entao nada de diagnostico se perde.
--      Sem isso, qualquer padrao do catalogo ('42501', 'template', 'decrypt')
--      pode casar por acidente dentro de um despejo de linha amanha.
--
--   2. PISO — cron que falhou nunca desce de `alta`. O catalogo continua com a
--      palavra sobre a CAUSA; o que ele deixa de poder fazer e emudecer um job
--      quebrado. A analise por IA, quando existir, segue livre para reclassificar.
--
-- Nao mexe em mais nada do varredor: mesmas fontes, mesma marca d'agua, mesma
-- idempotencia por request_id.

-- ─── 1. So a mensagem, sem o despejo de linha ────────────────────────────────
create or replace function public.clinvia_erro_resumo(p_msg text)
returns text
language sql
immutable
set search_path to 'public'
as $$
    select nullif(btrim(
        split_part(split_part(split_part(split_part(split_part(
            coalesce(p_msg, ''),
            E'\nDETAIL:',  1),
            E'\nHINT:',    1),
            E'\nCONTEXT:', 1),
            E'\nQUERY:',   1),
            E'\nLINE ',    1)
    ), '');
$$;

comment on function public.clinvia_erro_resumo(text) is
  'Primeira linha de um erro do Postgres, sem DETAIL/HINT/CONTEXT/QUERY/LINE. Existe porque o DETAIL despeja a linha que falhou e nomes de coluna casavam por engano com padroes do incident_catalog.';

revoke all on function public.clinvia_erro_resumo(text) from public, anon, authenticated;
grant execute on function public.clinvia_erro_resumo(text) to service_role;

-- ─── 2. Piso de severidade ───────────────────────────────────────────────────
-- Gemeo de incident_set_severidade_inicial, com uma diferenca: aquele so
-- escreve quando esta nulo (palpite), este ELEVA quando o valor atual e mais
-- brando. Nunca rebaixa.
create or replace function public.incident_piso_severidade(p_incident_id uuid, p_min text)
returns void
language sql
security definer
set search_path to 'public'
as $$
    update public.incidents
       set ai_severity = p_min, updated_at = now()
     where id = p_incident_id
       and p_min in ('critica', 'alta', 'media', 'baixa')
       and analyzed_at is null
       and case coalesce(ai_severity, 'baixa')
               when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end
         > case p_min
               when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end;
$$;

comment on function public.incident_piso_severidade(uuid, text) is
  'Eleva a severidade ate um piso, nunca rebaixa, e nunca passa por cima de uma analise ja feita (analyzed_at). Usado pelo cron-health-watch: job de cron quebrado nao pode ficar abaixo de alta, senao nao entra na fila de aviso.';

revoke all on function public.incident_piso_severidade(uuid, text) from public, anon, authenticated;
grant execute on function public.incident_piso_severidade(uuid, text) to service_role;

-- ─── 3. Varredor recriado com as duas correcoes ──────────────────────────────
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
                -- 401/403 nao pode ser rebaixado por casamento de catalogo
                if v_sev = 'critica' then
                    perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, 'critica');
                end if;
            end if;
        exception when others then
            raise warning '[cron_health] resposta %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    -- ── A2. timeout so vira incidente quando deixa de ser o padrao ───────────
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
                perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[cron_health] timeouts: %', sqlerrm;
        end;
    end if;

    -- ── B. o proprio cron falhou ─────────────────────────────────────────────
    -- Idempotente por runid, entao reler 2h a cada passada nao infla nada.
    for v_reg in
        select d.runid, d.jobid, j.jobname, j.schedule, d.status, d.return_message, d.start_time
          from cron.job_run_details d
          join cron.job j on j.jobid = d.jobid
         where d.start_time >= now() - interval '2 hours'
           and d.status is distinct from 'succeeded'
           and d.status is distinct from 'running'
         order by d.start_time
         limit v_limite
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'source', 'db_job',
                'component', 'cron:' || v_reg.jobname,
                'route', v_reg.status,
                -- CALIBRAGEM: so a mensagem. O DETAIL despeja a linha que falhou
                -- e nomes de coluna casavam com padroes do catalogo por acidente.
                'error_message', left(coalesce(
                                     public.clinvia_erro_resumo(v_reg.return_message),
                                     'job terminou com status ' || v_reg.status), 400),
                -- o texto integral do Postgres continua aqui, nada se perde
                'error_description', left(coalesce(v_reg.return_message, ''), 2000),
                'request_id', 'cronrun:' || v_reg.runid,
                'started_at', v_reg.start_time,
                'context', jsonb_build_object('jobid', v_reg.jobid, 'schedule', v_reg.schedule)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_cron_erros := v_cron_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
                -- job de cron quebrado nao pode ficar abaixo de alta: media nao
                -- entra em incident_claim_for_notification, ou seja, nao avisa.
                perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, 'alta');
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
                    perform public.incident_piso_severidade((v_res ->> 'incident_id')::uuid, 'critica');
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
            'cron_parado', v_parados
        )
    );
end;
$$;

comment on function public.cron_health_scan(integer) is
  'cron-health-watch: le net._http_response (nao so o status do cron), cron.job_run_details e jobs parados, e abre incidente. Existe porque net.http_post e fire-and-forget e o cron reporta succeeded mesmo quando o servidor respondeu 401. Calibrado em 23/09: erro do Postgres entra sem o bloco DETAIL (nome de coluna casava com padrao do catalogo) e falha de cron tem piso alta (media nao entra na fila de aviso).';

revoke all on function public.cron_health_scan(integer) from public, anon, authenticated;
grant execute on function public.cron_health_scan(integer) to service_role;
