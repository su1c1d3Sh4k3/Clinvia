-- Rollback de 20260923410000_patamares_de_custo.sql
--
-- CONSEQUENCIA DE RODAR ISTO: o alerta de anomalia volta ao `greatest`, que e
-- um OU disfarcado — qualquer conta que gaste US$ 3 num dia dispara ALTA no
-- WhatsApp, e projeto recem-criado dispara com media de um dia so. Pela
-- contagem de 30 dias, isso dobra o volume de alertas de custo (6 no lugar de
-- 3) sem acrescentar um unico caso que o criterio novo nao pegue.
--
-- Se o incomodo for so o numero, NAO rode isto: os tres patamares sao colunas
-- em `llm_platform_settings` (`daily_anomaly_min_usd`, `daily_anomaly_critical_usd`,
-- `daily_anomaly_min_days`) e um `update` resolve sem migration.
--
-- As duas colunas novas NAO sao removidas: ficam inertes e nao atrapalham.

update public.llm_platform_settings
   set daily_anomaly_min_usd = 3.00,
       updated_at            = now()
 where daily_anomaly_min_usd = 10.00;

alter table public.llm_platform_settings
    alter column daily_anomaly_min_usd set default 3.00;

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
end
$$;

revoke all on function public.openai_alert_scan() from public, anon, authenticated;
grant execute on function public.openai_alert_scan() to service_role;
