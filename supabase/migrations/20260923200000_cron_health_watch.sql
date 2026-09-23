-- §3.2 do plano — cron-health-watch.
--
-- POR QUE ISTO EXISTE
-- ===================
-- Em 23/09 o despachante de alertas ficou 401 por semanas e o pg_cron reportou
-- `succeeded` em TODAS as execucoes. Nao havia mentira: `net.http_post` e
-- fire-and-forget, entao o job termina com sucesso no instante em que ENFILEIRA
-- a requisicao. O que o servidor respondeu depois nao volta para o cron.
--
-- Consequencia pratica: `cron.job_run_details.status` NAO e um sinal de saude.
-- Quem sabe se a chamada deu certo e `net._http_response`, e ninguem olhava.
--
-- TRES LIMITACOES ESTRUTURAIS QUE O DESENHO PRECISA ABSORVER
-- ==========================================================
-- 1. `net._http_response` NAO TEM A URL. So existe `id`, `status_code`,
--    `content` e `error_msg`. Foi por isso que o 401 ficou anonimo: da para
--    saber que ALGUMA chamada falhou, nao QUAL. Por isso a tabela
--    `cron_http_calls` guarda `request_id -> alvo` no momento do disparo.
--    Sem registro, o incidente ainda abre, so que com component
--    'http-desconhecido' — ruim de ler, mas infinitamente melhor que silencio.
--
-- 2. `net._http_response` E PODADO AOS 30 MINUTOS (cron cleanup-pg-net-responses,
--    de 15 em 15 min). Por isso este varredor roda a cada 5 min: precisa passar
--    varias vezes dentro da janela de retencao. Se ele parar por meia hora, a
--    evidencia daquele periodo se perde para sempre — nao ha como recuperar.
--
-- 3. `id` de resposta e monotonico, entao a marca d'agua e por id, nao por
--    tempo. Isso torna a passada barata e imune a relogio.
--
-- O QUE E INCIDENTE E O QUE NAO E
-- ===============================
-- - `status_code >= 400`  -> SEMPRE incidente. 401/403 entram como CRITICA,
--   porque autenticacao quebrada e o defeito que acabou de nos morder e ele
--   falha 100% das vezes, em silencio, para sempre.
-- - `status_code is null` com "Timeout of 5000 ms reached" -> NAO e incidente
--   individual. O padrao de todo invocador aqui e fire-and-forget com timeout
--   de 5s; o worker demora mais que isso de proposito e o timeout e o desfecho
--   ESPERADO (medido: ~4% das respostas). Virar incidente por linha inundaria o
--   painel e treinaria todo mundo a ignorar alerta. Mas se a taxa passar de 30%
--   numa passada, ai sim abre UM incidente agregado: isso nao e o padrao, e uma
--   edge function que caiu inteira.
-- - Job com `status <> 'succeeded'` no proprio cron -> incidente. Obvio, e
--   mesmo assim ninguem olhava: `instagram-enrich-profiles` esta em 50 falhas de
--   50 execucoes por 140 dias (GUC `app.settings.supabase_url` nunca foi
--   definido, a URL sai nula) e nunca gerou um sinal.
-- - Job de minuto que parou de executar -> incidente. Cobre o caso "o cron
--   sumiu", que nenhum dos dois sinais acima pega, porque sem execucao nao ha
--   linha nem em job_run_details nem em _http_response.
--
-- A MARCA D'AGUA NASCE NO TOPO DE PROPOSITO
-- =========================================
-- No fim deste arquivo a marca e inicializada com o `max(id)` atual. O varredor
-- comeca olhando para frente, nao para tras. Nao e para esconder historico: e
-- porque a prova de que ele funciona vem do teste de injecao de falha (derrubar
-- a chave do alert-notify de proposito), nao de reprocessar as 1.400 linhas que
-- ja estavam na janela quando a migration rodou.

-- ─── 1. Chaves de desligar e marca d'agua ────────────────────────────────────
-- Moram em llm_platform_settings, a mesma casa de incident_db_scan_enabled.
alter table public.llm_platform_settings
    add column if not exists cron_health_enabled boolean not null default true,
    add column if not exists cron_health_last_response_id bigint not null default 0,
    add column if not exists cron_health_last_run_at timestamptz,
    add column if not exists cron_health_timeout_ratio numeric not null default 0.30;

comment on column public.llm_platform_settings.cron_health_enabled is
  'Desliga o cron-health-watch. Nao apaga nada: so para de abrir incidente novo.';
comment on column public.llm_platform_settings.cron_health_last_response_id is
  'Marca dagua em net._http_response.id. Monotonica; imune a relogio e a poda.';
comment on column public.llm_platform_settings.cron_health_timeout_ratio is
  'Fracao de timeouts numa passada acima da qual abre incidente agregado. 0.30 = 30%.';

-- ─── 2. Quem chamou o que ────────────────────────────────────────────────────
-- net._http_response nao guarda a URL. Esta tabela e a unica forma de dar nome
-- ao incidente. Linha orfa (post sem registro) nao quebra nada, so perde o nome.
create table if not exists public.cron_http_calls (
    request_id  bigint primary key,
    alvo        text        not null,
    origem      text        not null,
    created_at  timestamptz not null default now()
);

comment on table public.cron_http_calls is
  'request_id do net.http_post -> qual edge function foi chamada. Existe so porque net._http_response nao tem coluna de URL. Podada em 2h pelo proprio varredor.';

create index if not exists idx_cron_http_calls_created
    on public.cron_http_calls (created_at);

alter table public.cron_http_calls enable row level security;
-- Sem policy: ninguem alem de service_role (que ignora RLS) le ou escreve.
revoke all on table public.cron_http_calls from anon, authenticated;

-- ─── 2b. Desde quando conhecemos cada job ────────────────────────────────────
-- `cron.job` nao guarda data de criacao, entao "job ativo que nunca executou"
-- e ambiguo: pode ser um job morto ou um job criado ha 30 segundos. Sem isto o
-- varredor acusa a si mesmo de estar parado na primeira passada — aconteceu.
create table if not exists public.cron_health_seen (
    jobid       bigint primary key,
    jobname     text        not null,
    first_seen  timestamptz not null default now()
);

comment on table public.cron_health_seen is
  'Primeira vez que o cron-health-watch viu cada job. Existe so para dar carencia a job recem-criado antes de acusa-lo de parado.';

alter table public.cron_health_seen enable row level security;
revoke all on table public.cron_health_seen from anon, authenticated;

-- ─── 3. Disparo com registro ─────────────────────────────────────────────────
-- Substituto de net.http_post para quem e acordado por cron. O insert e
-- best-effort: se ele falhar, a CHAMADA AINDA SAI. Um monitor jamais pode ser
-- a causa da falha daquilo que monitora.
create or replace function public.clinvia_http_post(
    p_alvo    text,
    p_origem  text,
    p_url     text,
    p_headers jsonb,
    p_body    jsonb default '{}'::jsonb,
    p_timeout integer default 5000
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_id bigint;
begin
    select net.http_post(
        url             := p_url,
        headers         := p_headers,
        body            := coalesce(p_body, '{}'::jsonb),
        timeout_milliseconds := p_timeout
    ) into v_id;

    begin
        insert into public.cron_http_calls (request_id, alvo, origem)
        values (v_id, p_alvo, p_origem)
        on conflict (request_id) do nothing;
    exception when others then
        raise warning '[clinvia_http_post] nao registrou % (%): %', v_id, p_alvo, sqlerrm;
    end;

    return v_id;
end;
$$;

comment on function public.clinvia_http_post(text, text, text, jsonb, jsonb, integer) is
  'net.http_post que registra request_id -> alvo em cron_http_calls, para o cron-health-watch conseguir nomear a falha. O registro e best-effort: nunca impede o envio.';

revoke all on function public.clinvia_http_post(text, text, text, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.clinvia_http_post(text, text, text, jsonb, jsonb, integer) to service_role;

-- ─── 4. O varredor ───────────────────────────────────────────────────────────
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
                'error_message', left(coalesce(v_reg.return_message, 'job terminou com status ' || v_reg.status), 400),
                'request_id', 'cronrun:' || v_reg.runid,
                'started_at', v_reg.start_time,
                'context', jsonb_build_object('jobid', v_reg.jobid, 'schedule', v_reg.schedule)
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
            'cron_parado', v_parados
        )
    );
end;
$$;

comment on function public.cron_health_scan(integer) is
  'cron-health-watch: le net._http_response (nao so o status do cron), cron.job_run_details e jobs parados, e abre incidente. Existe porque net.http_post e fire-and-forget e o cron reporta succeeded mesmo quando o servidor respondeu 401.';

revoke all on function public.cron_health_scan(integer) from public, anon, authenticated;
grant execute on function public.cron_health_scan(integer) to service_role;

-- ─── 5. Catalogo: a classe de defeito ganha nome ─────────────────────────────
insert into public.incident_catalog (pattern, match_type, source, severidade_sugerida, causa, acao, is_active)
values (
    'respondeu 401',
    'substring',
    'db_job',
    'critica',
    'Chamada de job autenticada recusada. Causa tipica: o ambiente da edge function ja usa a chave nova sb_secret_ enquanto quem chama manda o JWT legado guardado no vault. O gateway do Supabase aceita os dois, entao a requisicao CHEGA — quem recusa e a propria funcao, ao comparar a chave apresentada com o proprio env.',
    'Conferir de onde o invocador tira a chave (vault SUPABASE_SERVICE_ROLE_KEY = JWT legado; SUPABASE_EDGE_SECRET_KEY = chave nova) e passar a chave nova no header x-service-key.',
    true
)
on conflict do nothing;

-- ─── 6. Marca d'agua no topo ─────────────────────────────────────────────────
update public.llm_platform_settings
   set cron_health_last_response_id = coalesce((select max(id) from net._http_response), 0);

-- ─── 7. Agenda ───────────────────────────────────────────────────────────────
-- 5 minutos: net._http_response e podado aos 30, entao precisa de varias
-- passadas dentro da janela. SQL puro, sem rede — o monitor nao depende do
-- mecanismo que ele monitora.
select cron.unschedule('cron-health-watch')
 where exists (select 1 from cron.job where jobname = 'cron-health-watch');

select cron.schedule(
    'cron-health-watch',
    '*/5 * * * *',
    $cron$ select public.cron_health_scan(); $cron$
);
