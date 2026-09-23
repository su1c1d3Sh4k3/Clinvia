-- Patamares de custo: o alerta de anomalia diaria passa a exigir DUAS coisas
-- ao mesmo tempo, e ganha um patamar critico.
--
-- COMO ERA
--     usd_hoje >= greatest(3.00, 3 * media_7d)
-- `greatest` e um OU disfarcado: basta a conta gastar US$ 3 num dia para o
-- alerta sair, mesmo sem anomalia nenhuma — e basta nao haver historico para a
-- media ser 0 e o piso decidir sozinho. Foi assim que "PELE gastou US$ 3,34,
-- 12,9x a media" virou ALTA no WhatsApp: a media era de UM dia, o primeiro dia
-- de vida do projeto.
--
-- COMO FICA (numeros decididos pelo user)
--   * US$ 10 em 24h  E  3x a media dos 7 dias anteriores — as duas ao mesmo tempo;
--   * US$ 60 em 24h  = CRITICA (patamar proprio, nao depende da media);
--   * minimo de 5 dias com dado na janela de 7; abaixo disso o detector se cala,
--     porque comparar com uma media de um dia nao e comparar com nada.
--
-- CONTAGEM RETROATIVA DE 30 DIAS (24/08 a 22/09, 3 contas, 37 dias-conta)
--   criterio atual ... 6 alertas
--   criterio novo .... 3 alertas   (os 3 cortados, todos por ficarem abaixo de
--                                   US$ 10; nenhum cortado por falta de historico
--                                   ou por nao chegar a 3x)
--   criticos ......... 0 (o pico do periodo foi US$ 24,60)
--   so no criterio novo ... 0 (o criterio novo nao perde nada que o atual pega)
-- Ressalva honesta: a contagem foi feita sobre `token_usage_log` porque
-- `openai_project_costs_daily` so tem 2 dias (os projetos por conta nasceram em
-- 22/09). `cost_usd` embute a margem, entao a contagem SUPERESTIMA — na pratica
-- o criterio novo disparara igual ou menos que estes 3.
--
-- DEDUPE: a chave passa a incluir a severidade. Antes era um alerta por
-- (projeto, dia): uma conta que disparasse ALTA as 10h e cruzasse US$ 60 as 16h
-- ficaria em silencio, porque o `on conflict do nothing` engoliria o critico.
-- Agora cabem dois no mesmo dia — um por patamar, nunca mais que isso.

alter table public.llm_platform_settings
    add column if not exists daily_anomaly_critical_usd numeric not null default 60.00,
    add column if not exists daily_anomaly_min_days     integer not null default 5;

comment on column public.llm_platform_settings.daily_anomaly_critical_usd is
    'Gasto diario de uma conta que vale CRITICA sozinho, sem depender da media.';
comment on column public.llm_platform_settings.daily_anomaly_min_days is
    'Minimo de dias com dado na janela de 7 para o detector ter direito de opinar.';

-- O piso sobe de US$ 3 para US$ 10. So mexe em quem ainda esta no valor antigo:
-- se alguem tiver ajustado a mao, o ajuste fica.
alter table public.llm_platform_settings
    alter column daily_anomaly_min_usd set default 10.00;

update public.llm_platform_settings
   set daily_anomaly_min_usd = 10.00,
       updated_at            = now()
 where daily_anomaly_min_usd = 3.00;


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
    v_sev           text;
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

    -- 4.3 Anomalia diaria de custo. DUAS condicoes ao mesmo tempo: valor
    -- absoluto E razao contra a media. Uma sozinha nao serve — valor sem razao
    -- e conta grande num dia normal; razao sem valor e o ruido de centavos que
    -- deu o falso positivo de 23/09.
    -- O dia corrente e parcial de proposito: comparar um dia incompleto com a
    -- media so produz FALSO NEGATIVO (o custo ainda vai subir), nunca falso
    -- positivo, e avisa no mesmo dia em que o gasto disparou.
    if coalesce(v_cfg.daily_anomaly_alert_enabled, true) then
        for r in
            select p.id,
                   coalesce(p.company_name, p.full_name, p.id::text) as nome,
                   p.openai_project_id                               as projeto,
                   coalesce(hoje.usd, 0)                             as usd_hoje,
                   coalesce(base.media, 0)                           as media_7d,
                   coalesce(base.dias, 0)                            as dias_base
            from public.profiles p
            left join (
                select project_id, sum(cost_usd) as usd
                from public.openai_project_costs_daily
                where day = v_hoje
                group by project_id
            ) hoje on hoje.project_id = p.openai_project_id
            left join (
                select project_id, avg(usd) as media, count(*) as dias
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
            -- Sem historico suficiente o detector NAO opina. Preferir o silencio
            -- e deliberado: um alerta errado custa mais do que um alerta tardio,
            -- porque o proximo ele ja nao le.
            continue when r.dias_base < coalesce(v_cfg.daily_anomaly_min_days, 5);

            if r.usd_hoje >= coalesce(v_cfg.daily_anomaly_min_usd, 10.00)
               and r.usd_hoje >= coalesce(v_cfg.daily_anomaly_factor, 3) * r.media_7d
            then
                v_sev := case
                    when r.usd_hoje >= coalesce(v_cfg.daily_anomaly_critical_usd, 60.00)
                    then 'critical' else 'warning' end;

                insert into public.openai_alerts
                    (kind, severity, profile_id, project_id, day, dedupe_key, message, detail)
                values (
                    'daily_anomaly',
                    v_sev,
                    r.id,
                    r.projeto,
                    v_hoje,
                    -- a severidade entra na chave para que o critico consiga
                    -- passar depois de um aviso no mesmo dia
                    'daily_anomaly|' || r.id::text || '|' || v_hoje::text || '|' || v_sev,
                    r.nome || ' gastou US$ ' || round(r.usd_hoje, 2)::text || ' na OpenAI hoje'
                    || case when r.media_7d > 0
                            then ', ' || round(r.usd_hoje / r.media_7d, 1)::text
                                 || 'x a media dos ' || r.dias_base::text
                                 || ' dias com consumo na semana (US$ '
                                 || round(r.media_7d, 2)::text || '/dia).'
                            else ' (a semana anterior nao teve custo nenhum).' end
                    || case when v_sev = 'critical'
                            then ' Passou do patamar critico de US$ '
                                 || round(coalesce(v_cfg.daily_anomaly_critical_usd, 60.00), 2)::text
                                 || ' em 24h.'
                            else '' end,
                    jsonb_build_object(
                        'usd_hoje', round(r.usd_hoje, 4),
                        'media_7d', round(r.media_7d, 4),
                        'dias_base', r.dias_base,
                        'fator', coalesce(v_cfg.daily_anomaly_factor, 3),
                        'piso_usd', coalesce(v_cfg.daily_anomaly_min_usd, 10.00),
                        'piso_critico_usd', coalesce(v_cfg.daily_anomaly_critical_usd, 60.00),
                        'min_dias', coalesce(v_cfg.daily_anomaly_min_days, 5)
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
end
$$;

revoke all on function public.openai_alert_scan() from public, anon, authenticated;
grant execute on function public.openai_alert_scan() to service_role;
