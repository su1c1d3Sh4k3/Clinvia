-- Etapa "projeto e chave OpenAI por conta", item 4: rastro de saude do sync e os
-- tres alertas (falha de sincronizacao, zeragem em horario comercial, anomalia
-- diaria de custo), com os limiares em `llm_platform_settings`.
--
-- POR QUE ESTE ARQUIVO EXISTE
-- `sync-openai-usage` nao gravava NADA sobre a propria execucao: toda falha saia
-- so como HTTP 500 + console.error. E `cron.job_run_details` diz `succeeded` so
-- porque o disparo HTTP saiu — nao e sinal de saude. Com o faturamento passando a
-- vir 100% da API de custos da OpenAI, sync parado = fatura errada em silencio.
--
-- DECISOES DO USER JA TOMADAS (nao relitigar)
--   * Conta de cliente NAO tem teto de gasto. Isto aqui e ALERTA, nunca corte:
--     nenhuma linha deste arquivo interrompe atendimento.
--   * Zeragem se mede por REQUISICOES, nunca por custo. Medido em set/2026:
--     `cost_brl` tem dias com centenas de chamadas e R$0,00 (preco de modelo
--     faltando, corrigido so em `7182253`) ⇒ custo zero e sinal podre.
--   * Anomalia diaria: X = 3 vezes a media dos 7 dias anteriores, com piso
--     ABSOLUTO de US$ 3,00/dia. Sem o piso, conta pequena alertaria a cada
--     centavo (razao dia/media-7d da PELE: p90 8,37 / p95 10,45, cauda
--     distorcida por dias zerados).
--   * Horario comercial = 8h as 20h, dias uteis, fuso America/Sao_Paulo.
--
-- NADA RETROATIVO E NADA DESTRUTIVO: cria duas tabelas novas, 7 colunas de
-- configuracao com default, uma funcao de varredura, um cron e um RPC de leitura
-- para o Super Admin. Nao altera nem apaga dado de consumo.

-- 1. Rastro de saude do sync --------------------------------------------------
create table if not exists public.openai_sync_runs (
    id bigserial primary key,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    duration_ms integer,
    trigger text not null default 'manual',
    status text not null,
    accounts integer,
    usage_rows integer,
    cost_rows integer,
    window_start timestamptz,
    admin_key_source text,
    error_code text,
    error_message text,
    constraint openai_sync_runs_status_chk check (status in ('ok', 'partial', 'error'))
);

create index if not exists openai_sync_runs_started_idx
    on public.openai_sync_runs (started_at desc);
create index if not exists openai_sync_runs_status_idx
    on public.openai_sync_runs (status, started_at desc);

alter table public.openai_sync_runs enable row level security;
revoke all on table public.openai_sync_runs from anon, authenticated;
revoke all on sequence public.openai_sync_runs_id_seq from anon, authenticated;
grant select, insert, update on table public.openai_sync_runs to service_role;
grant usage on sequence public.openai_sync_runs_id_seq to service_role;

comment on table public.openai_sync_runs is
    'Uma linha por execucao de sync-openai-usage. status: ok = usage e custo gravados; partial = gravou usage e falhou no custo (ou vice-versa); error = nao gravou. Base do alerta de falha de sincronizacao. RLS sem policy = so service_role; o Super Admin le pelo RPC admin_get_openai_alerts/admin_get_openai_sync_health.';
comment on column public.openai_sync_runs.trigger is
    'hourly (cron 20 * * * *), daily (cron 40 4 * * *) ou manual (chamada a mao). "migration" = linha semente.';

-- Linha semente: sem ela a primeira varredura acharia que o sync "nunca teve
-- sucesso" e alertaria na hora, antes de o edge function novo ter chance de
-- rodar. Com a semente, a carencia conta a partir do apply.
insert into public.openai_sync_runs (trigger, status, finished_at, admin_key_source, error_message)
select 'migration', 'ok', now(), null,
       'Linha semente da migration 20260922300000: marca o inicio do rastro de saude.'
where not exists (select 1 from public.openai_sync_runs);

-- 2. Alertas ------------------------------------------------------------------
create table if not exists public.openai_alerts (
    id bigserial primary key,
    created_at timestamptz not null default now(),
    kind text not null,
    severity text not null default 'warning',
    profile_id uuid references public.profiles(id) on delete cascade,
    project_id text,
    day date,
    dedupe_key text not null unique,
    message text not null,
    detail jsonb not null default '{}'::jsonb,
    constraint openai_alerts_kind_chk
        check (kind in ('sync_failure', 'zero_usage', 'daily_anomaly')),
    constraint openai_alerts_severity_chk
        check (severity in ('warning', 'critical'))
);

create index if not exists openai_alerts_created_idx
    on public.openai_alerts (created_at desc);
create index if not exists openai_alerts_kind_idx
    on public.openai_alerts (kind, created_at desc);

alter table public.openai_alerts enable row level security;
revoke all on table public.openai_alerts from anon, authenticated;
revoke all on sequence public.openai_alerts_id_seq from anon, authenticated;
grant select, insert on table public.openai_alerts to service_role;
grant usage on sequence public.openai_alerts_id_seq to service_role;

comment on table public.openai_alerts is
    'Alertas de saude/custo do consumo real da OpenAI. `dedupe_key` e UNIQUE e o insert usa on conflict do nothing: por isso o mesmo aviso nao repete (1 por hora no caso de sync, 1 por conta/dia nos outros). RLS sem policy = so service_role.';
comment on column public.openai_alerts.kind is
    'sync_failure = sincronizacao parada; zero_usage = conta com movimento habitual zerada em horario comercial; daily_anomaly = custo do dia acima de X vezes a media dos 7 dias anteriores.';

-- 3. Limiares configuraveis ---------------------------------------------------
alter table public.llm_platform_settings
    add column if not exists sync_alert_enabled boolean not null default true,
    add column if not exists sync_stale_hours numeric not null default 3,
    add column if not exists zero_usage_alert_enabled boolean not null default true,
    add column if not exists zero_usage_baseline_requests integer not null default 50,
    add column if not exists daily_anomaly_alert_enabled boolean not null default true,
    add column if not exists daily_anomaly_factor numeric not null default 3,
    add column if not exists daily_anomaly_min_usd numeric not null default 3.00;

comment on column public.llm_platform_settings.sync_stale_hours is
    'Horas sem uma execucao "ok" de sync-openai-usage para considerar a sincronizacao parada. 3 = duas janelas do cron de hora em hora mais folga.';
comment on column public.llm_platform_settings.zero_usage_baseline_requests is
    'Media minima de requisicoes/dia nos 7 dias anteriores para a conta ser considerada "com movimento habitual". Abaixo disso, dia zerado nao alerta (conta parada de verdade nao vira ruido).';
comment on column public.llm_platform_settings.daily_anomaly_factor is
    'X da anomalia diaria: custo do dia >= X vezes a media dos 7 dias anteriores. Decisao do user: X = 3.';
comment on column public.llm_platform_settings.daily_anomaly_min_usd is
    'Piso absoluto da anomalia diaria em USD. Mesmo 100x a media nao alerta abaixo disto. Decisao do user: US$ 3,00/dia.';

-- 4. Varredura ----------------------------------------------------------------
create or replace function public.openai_alert_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_cfg           record;
    v_now_sp        timestamp;
    v_hoje          date;
    v_dow           integer;
    v_hora          integer;
    v_contas        integer;
    v_last_ok       timestamptz;
    v_last          record;
    v_rows          integer;
    v_sync          integer := 0;
    v_zero          integer := 0;
    v_anom          integer := 0;
    v_horario_util  boolean;
    r               record;
begin
    select * into v_cfg from public.llm_platform_settings where id limit 1;
    if v_cfg is null then
        return jsonb_build_object('skipped', 'sem_configuracao');
    end if;

    v_now_sp := (now() at time zone 'America/Sao_Paulo');
    v_hoje := v_now_sp::date;
    v_dow := extract(isodow from v_now_sp);
    v_hora := extract(hour from v_now_sp);
    v_horario_util := v_dow between 1 and 5 and v_hora >= 8 and v_hora < 20;

    select count(*) into v_contas
    from public.profiles
    where openai_project_id is not null;

    if v_contas = 0 then
        return jsonb_build_object('skipped', 'nenhuma_conta_com_projeto');
    end if;

    -- 4.1 Sincronizacao parada.
    -- Nao olha cron.job_run_details de proposito: ali "succeeded" significa so
    -- que o http_post saiu. A unica prova de saude e uma execucao com status ok.
    if coalesce(v_cfg.sync_alert_enabled, true) then
        select max(started_at) into v_last_ok
        from public.openai_sync_runs
        where status = 'ok';

        select status, error_code, error_message, started_at
          into v_last
        from public.openai_sync_runs
        order by started_at desc
        limit 1;

        if v_last_ok is null
           or v_last_ok < now() - make_interval(mins => (coalesce(v_cfg.sync_stale_hours, 3) * 60)::int)
        then
            insert into public.openai_alerts (kind, severity, dedupe_key, message, detail)
            values (
                'sync_failure',
                'critical',
                'sync_failure|' || to_char(v_now_sp, 'YYYY-MM-DD"T"HH24'),
                case
                    when v_last_ok is null
                        then 'A sincronizacao de consumo da OpenAI nunca terminou com sucesso.'
                    else 'A sincronizacao de consumo da OpenAI nao conclui desde '
                         || to_char(v_last_ok at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
                         || ' (limite: ' || coalesce(v_cfg.sync_stale_hours, 3)::text || 'h).'
                end,
                jsonb_build_object(
                    'last_ok', v_last_ok,
                    'stale_hours', coalesce(v_cfg.sync_stale_hours, 3),
                    'last_status', v_last.status,
                    'last_error_code', v_last.error_code,
                    'last_error_message', v_last.error_message
                )
            )
            on conflict (dedupe_key) do nothing;
            get diagnostics v_rows = row_count;
            v_sync := v_sync + v_rows;
        end if;
    end if;

    -- 4.2 Zeragem em horario comercial (8h-20h, dias uteis, fuso SP).
    -- Base = REQUISICOES (decisao do user). A media dos 7 dias anteriores conta
    -- so os dias com linha; dia sem linha e dia sem consumo e nao entra na media.
    if coalesce(v_cfg.zero_usage_alert_enabled, true) and v_horario_util then
        for r in
            select p.id,
                   coalesce(p.company_name, p.full_name, p.id::text) as nome,
                   p.openai_project_id                               as projeto,
                   coalesce(hoje.reqs, 0)                            as reqs_hoje,
                   coalesce(base.media, 0)                           as media_7d
            from public.profiles p
            left join (
                select project_id, sum(num_model_requests) as reqs
                from public.openai_project_usage_daily
                where day = v_hoje
                group by project_id
            ) hoje on hoje.project_id = p.openai_project_id
            left join (
                select project_id, avg(reqs) as media
                from (
                    select project_id, day, sum(num_model_requests) as reqs
                    from public.openai_project_usage_daily
                    where day between v_hoje - 7 and v_hoje - 1
                    group by project_id, day
                ) d
                group by project_id
            ) base on base.project_id = p.openai_project_id
            where p.openai_project_id is not null
              -- conta provisionada hoje/ontem nao tem base de comparacao
              and p.openai_provisioned_at is not null
              and p.openai_provisioned_at < (v_hoje - 1)::timestamptz
        loop
            if r.reqs_hoje = 0
               and r.media_7d >= coalesce(v_cfg.zero_usage_baseline_requests, 50)
            then
                insert into public.openai_alerts
                    (kind, severity, profile_id, project_id, day, dedupe_key, message, detail)
                values (
                    'zero_usage',
                    'critical',
                    r.id,
                    r.projeto,
                    v_hoje,
                    'zero_usage|' || r.id::text || '|' || v_hoje::text,
                    r.nome || ' esta sem nenhuma requisicao na OpenAI hoje, em horario comercial '
                    || '(media dos 7 dias anteriores: ' || round(r.media_7d)::text || ' requisicoes/dia).',
                    jsonb_build_object(
                        'reqs_hoje', r.reqs_hoje,
                        'media_7d', round(r.media_7d, 2),
                        'hora_sp', v_hora
                    )
                )
                on conflict (dedupe_key) do nothing;
                get diagnostics v_rows = row_count;
                v_zero := v_zero + v_rows;
            end if;
        end loop;
    end if;

    -- 4.3 Anomalia diaria de custo: X vezes a media dos 7 dias anteriores, com
    -- piso absoluto em USD. O dia corrente e parcial de proposito — comparar um
    -- dia incompleto com a media so produz FALSO NEGATIVO (o custo ainda vai
    -- subir), nunca falso positivo, e avisa no mesmo dia em que o gasto disparou.
    if coalesce(v_cfg.daily_anomaly_alert_enabled, true) then
        for r in
            select p.id,
                   coalesce(p.company_name, p.full_name, p.id::text) as nome,
                   p.openai_project_id                               as projeto,
                   coalesce(hoje.usd, 0)                             as usd_hoje,
                   coalesce(base.media, 0)                           as media_7d
            from public.profiles p
            left join (
                select project_id, sum(cost_usd) as usd
                from public.openai_project_costs_daily
                where day = v_hoje
                group by project_id
            ) hoje on hoje.project_id = p.openai_project_id
            left join (
                select project_id, avg(usd) as media
                from (
                    select project_id, day, sum(cost_usd) as usd
                    from public.openai_project_costs_daily
                    where day between v_hoje - 7 and v_hoje - 1
                    group by project_id, day
                ) d
                group by project_id
            ) base on base.project_id = p.openai_project_id
            where p.openai_project_id is not null
        loop
            if r.usd_hoje >= greatest(
                   coalesce(v_cfg.daily_anomaly_min_usd, 3.00),
                   coalesce(v_cfg.daily_anomaly_factor, 3) * r.media_7d
               )
            then
                insert into public.openai_alerts
                    (kind, severity, profile_id, project_id, day, dedupe_key, message, detail)
                values (
                    'daily_anomaly',
                    'warning',
                    r.id,
                    r.projeto,
                    v_hoje,
                    'daily_anomaly|' || r.id::text || '|' || v_hoje::text,
                    r.nome || ' gastou US$ ' || round(r.usd_hoje, 2)::text || ' na OpenAI hoje'
                    || case when r.media_7d > 0
                            then ', ' || round(r.usd_hoje / r.media_7d, 1)::text
                                 || 'x a media dos 7 dias anteriores (US$ '
                                 || round(r.media_7d, 2)::text || '/dia).'
                            else ' (sem historico dos 7 dias anteriores para comparar).' end,
                    jsonb_build_object(
                        'usd_hoje', round(r.usd_hoje, 4),
                        'media_7d', round(r.media_7d, 4),
                        'fator', coalesce(v_cfg.daily_anomaly_factor, 3),
                        'piso_usd', coalesce(v_cfg.daily_anomaly_min_usd, 3.00)
                    )
                )
                on conflict (dedupe_key) do nothing;
                get diagnostics v_rows = row_count;
                v_anom := v_anom + v_rows;
            end if;
        end loop;
    end if;

    return jsonb_build_object(
        'contas', v_contas,
        'horario_comercial', v_horario_util,
        'novos_sync_failure', v_sync,
        'novos_zero_usage', v_zero,
        'novos_daily_anomaly', v_anom
    );
end $$;

comment on function public.openai_alert_scan() is
    'Varredura horaria dos tres alertas de consumo real da OpenAI. Le os limiares de llm_platform_settings, grava em openai_alerts com dedupe e NAO interrompe nada (alerta, nunca corte).';

-- PITFALL: `create function` ja concede EXECUTE a PUBLIC, e `revoke ... from anon`
-- NAO tira o grant de PUBLIC (mesma armadilha do grant por coluna). Tem que
-- revogar de PUBLIC e so depois conceder a quem deve.
revoke all on function public.openai_alert_scan() from public, anon, authenticated;
grant execute on function public.openai_alert_scan() to service_role;

-- 5. Cron: 10 minutos depois do sync de hora em hora (:20) --------------------
select cron.unschedule('openai-alerts-scan')
where exists (select 1 from cron.job where jobname = 'openai-alerts-scan');

select cron.schedule(
    'openai-alerts-scan',
    '30 * * * *',
    $$select public.openai_alert_scan()$$
);

-- 6. Leitura pelo Super Admin -------------------------------------------------
-- As duas tabelas tem RLS sem policy e nenhum grant de front: sem RPC, o painel
-- nao alcanca o dado. Mesmo guard das outras leituras do painel.
create or replace function public.admin_get_openai_alerts(p_limit integer default 50)
returns table (
    id bigint,
    created_at timestamptz,
    kind text,
    severity text,
    profile_id uuid,
    company_name text,
    project_id text,
    day date,
    message text,
    detail jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if not public.admin_can('clientes', 'view') then
        raise exception 'forbidden' using errcode = 'P0001';
    end if;

    return query
    select a.id, a.created_at, a.kind, a.severity, a.profile_id,
           coalesce(p.company_name, p.full_name) as company_name,
           a.project_id, a.day, a.message, a.detail
    from public.openai_alerts a
    left join public.profiles p on p.id = a.profile_id
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

comment on function public.admin_get_openai_alerts(integer) is
    'Alertas de consumo da OpenAI para o painel do Super Admin. Guard admin_can(clientes, view).';

create or replace function public.admin_get_openai_sync_health()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_last_ok timestamptz;
    v_last    record;
begin
    if not public.admin_can('clientes', 'view') then
        raise exception 'forbidden' using errcode = 'P0001';
    end if;

    select max(started_at) into v_last_ok
    from public.openai_sync_runs where status = 'ok';

    select status, trigger, started_at, finished_at, duration_ms,
           accounts, usage_rows, cost_rows, error_code, error_message
      into v_last
    from public.openai_sync_runs
    order by started_at desc
    limit 1;

    return jsonb_build_object(
        'last_ok_at', v_last_ok,
        'stale', v_last_ok is null or v_last_ok < now() - interval '3 hours',
        'last_run', case when v_last is null then null else jsonb_build_object(
            'status', v_last.status,
            'trigger', v_last.trigger,
            'started_at', v_last.started_at,
            'finished_at', v_last.finished_at,
            'duration_ms', v_last.duration_ms,
            'accounts', v_last.accounts,
            'usage_rows', v_last.usage_rows,
            'cost_rows', v_last.cost_rows,
            'error_code', v_last.error_code,
            'error_message', v_last.error_message
        ) end
    );
end $$;

comment on function public.admin_get_openai_sync_health() is
    'Saude da sincronizacao de consumo da OpenAI (ultima execucao ok, ultima execucao qualquer). Guard admin_can(clientes, view).';

revoke all on function public.admin_get_openai_alerts(integer) from public, anon;
revoke all on function public.admin_get_openai_sync_health() from public, anon;
grant execute on function public.admin_get_openai_alerts(integer) to authenticated, service_role;
grant execute on function public.admin_get_openai_sync_health() to authenticated, service_role;

-- 7. Quem disparou o sync ------------------------------------------------------
-- Unica mudanca em objeto existente: o corpo do POST passa a levar `trigger`,
-- para `openai_sync_runs.trigger` separar cron de hora em hora, cron diario e
-- chamada a mao. Os dois crons continuam chamando `invoke_openai_usage_sync(2)`
-- e `(null)` — nao foi preciso reagendar nada.
create or replace function public.invoke_openai_usage_sync(p_since_days integer default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url text;
    v_key text;
    v_projetos integer;
begin
    -- Sem projeto na OpenAI nao existe consumo real para puxar: o painel mostra
    -- "estimado" e a Costs API nao tem o que devolver.
    select count(*) into v_projetos
    from public.profiles
    where openai_project_id is not null;

    if v_projetos = 0 then
        return;
    end if;

    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url := v_url || '/functions/v1/sync-openai-usage',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := case
            when p_since_days is null then jsonb_build_object('trigger', 'daily')
            else jsonb_build_object('sinceDays', p_since_days, 'trigger', 'hourly')
        end
    );
exception when others then
    raise notice 'sync-openai-usage invoke error: %', sqlerrm;
end $$;

comment on function public.invoke_openai_usage_sync(integer) is
    'Cron: chama a edge function sync-openai-usage. p_since_days = janela curta (hora a hora, trigger hourly); null = mes corrente inteiro (trigger daily).';

revoke all on function public.invoke_openai_usage_sync(integer) from public, anon, authenticated;
grant execute on function public.invoke_openai_usage_sync(integer) to service_role;
