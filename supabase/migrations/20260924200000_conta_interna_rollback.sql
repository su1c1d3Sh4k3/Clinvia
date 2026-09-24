-- Rollback de 20260924200000_conta_interna.sql
--
-- Devolve as quatro funcoes ao corpo que estava em producao antes da marca e
-- derruba a coluna. A ordem importa: as funcoes primeiro, a coluna depois —
-- `drop column` com uma funcao ainda referenciando `is_internal` nao falha na
-- hora (plpgsql so resolve o nome na execucao), ela falha na PROXIMA varredura,
-- e ai o detector fica quebrado em silencio.
--
-- ATENCAO: se a conta da sentinela ainda existir quando isto rodar, ela volta a
-- ser contada como cliente ativo, volta a entrar no provisionamento da OpenAI e
-- volta a aparecer como tenant ocioso. Rodar isto sem desativar a conta antes
-- troca um problema por outro.

begin;

-- 1. Provisionamento ----------------------------------------------------------
create or replace function public.enqueue_openai_provision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- 1. So conta de CLIENTE (dono do tenant). super-admin e colaborador nao tem
  --    projeto proprio na OpenAI.
  if coalesce(new.role, '') <> 'admin' then
    return new;
  end if;

  -- 2. So conta APROVADA/ativa.
  if coalesce(new.status, '') <> 'ativo' then
    return new;
  end if;

  -- 3. No UPDATE, so na TRANSICAO para ativo. `update of status` dispara mesmo
  --    quando o valor nao muda (o upsert do approve-client reescreve o campo),
  --    e sem esta guarda cada UPDATE reenfileirava a mesma conta.
  if tg_op = 'UPDATE' and coalesce(old.status, '') = 'ativo' then
    return new;
  end if;

  -- 4. Quem ja tem chave/projeto, ou usa chave propria, fica de fora.
  if new.openai_token is not null or new.openai_project_id is not null then
    return new;
  end if;

  if new.openai_key_source = 'customer' then
    return new;
  end if;

  -- O indice unico parcial (status in pending/processing) garante 1 job vivo
  -- por conta; `on conflict do nothing` sem alvo cobre qualquer unique.
  insert into public.openai_provision_queue (profile_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$function$;

-- 2. Detectores de provisionamento --------------------------------------------
create or replace function public.provisionamento_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_ligado      boolean;
    v_carencia    integer;
    v_max_tent    integer;
    v_reg         record;
    v_res         jsonb;
    v_erros       integer := 0;
    v_travados    integer := 0;
    v_sem_chave   integer := 0;
    v_hora        text := to_char(now() at time zone 'UTC', 'YYYYMMDDHH24');
begin
    select coalesce(provisionamento_alert_enabled, true),
           greatest(coalesce(provisionamento_carencia_min, 30), 5),
           greatest(coalesce(provisionamento_max_tentativas, 3), 1)
      into v_ligado, v_carencia, v_max_tent
      from public.llm_platform_settings
     limit 1;

    if not coalesce(v_ligado, true) then
        return jsonb_build_object('ok', true, 'desligado', true);
    end if;

    -- ── A. o worker falhou e disse por que ───────────────────────────────────
    for v_reg in
        select p.id, coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               p.openai_provision_error as erro,
               (select q.attempts from public.openai_provision_queue q
                 where q.profile_id = p.id order by q.created_at desc limit 1) as tentativas
          from public.profiles p
         where p.role = 'admin'
           and p.status = 'ativo'
           and p.openai_provision_error is not null
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'provisioning',
                'component', 'provisionamento:erro',
                'route', 'criar_projeto_openai',
                'owner_id', v_reg.id,
                'error_name', 'openai_provision_error',
                'error_message', 'Provisionamento da conta "' || v_reg.empresa || '" falhou: '
                                 || left(v_reg.erro, 400),
                'error_description', 'Enquanto este erro nao for limpo, a conta fica sem projeto e sem chave propria na OpenAI — ou seja, sem IA.',
                'request_id', 'prov-erro:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'profile_id', v_reg.id,
                    'tentativas', v_reg.tentativas)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_erros := v_erros + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] erro %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    -- ── B. job vivo demais, ou tentado demais ────────────────────────────────
    for v_reg in
        select q.id, q.profile_id, q.status, q.attempts, q.created_at, q.updated_at,
               coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               left(coalesce(q.last_error, '(sem erro registrado)'), 300) as erro
          from public.openai_provision_queue q
          left join public.profiles p on p.id = q.profile_id
         where q.status in ('pending', 'processing')
           and (q.created_at < now() - make_interval(mins => v_carencia)
                or q.attempts >= v_max_tent)
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'provisioning',
                'component', 'provisionamento:fila-travada',
                'route', 'openai_provision_queue',
                'owner_id', v_reg.profile_id,
                'error_name', 'provision_queue_stuck',
                'error_message', 'Job de provisionamento da conta "' || v_reg.empresa || '" preso em "'
                                 || v_reg.status || '" ha ' || round(extract(epoch from now() - v_reg.created_at) / 60)
                                 || ' min apos ' || v_reg.attempts || ' tentativa(s). Ultimo erro: ' || v_reg.erro,
                'error_description', 'O worker roda a cada 5 minutos. Job vivo muito alem disso significa worker parado, quebrado, ou retentando algo que nunca vai passar.',
                'request_id', 'prov-fila:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'job_id', v_reg.id,
                    'profile_id', v_reg.profile_id,
                    'status', v_reg.status,
                    'tentativas', v_reg.attempts,
                    'criado_em', v_reg.created_at,
                    'atualizado_em', v_reg.updated_at)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_travados := v_travados + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] fila %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    -- ── C. o sintoma: conta de cliente ativa e sem IA ────────────────────────
    for v_reg in
        select p.id, coalesce(nullif(p.company_name, ''), '(conta sem nome)') as empresa,
               p.created_at,
               exists (select 1 from public.openai_provision_queue q
                        where q.profile_id = p.id and q.status in ('pending', 'processing')) as tem_job
          from public.profiles p
         where p.role = 'admin'
           and p.status = 'ativo'
           and p.openai_project_id is null
           and p.openai_token is null
           and coalesce(p.openai_key_source, '') <> 'customer'
           and p.created_at < now() - make_interval(mins => v_carencia)
    loop
        begin
            v_res := public.incident_record(jsonb_build_object(
                'origem', 'cron',
                'source', 'provisioning',
                'component', 'provisionamento:conta-sem-chave',
                'route', 'conta_ativa_sem_chave',
                'owner_id', v_reg.id,
                'error_name', 'conta_sem_chave_openai',
                'error_message', 'A conta "' || v_reg.empresa || '" esta ativa desde '
                                 || to_char(v_reg.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
                                 || ' e continua sem projeto e sem chave da OpenAI. A IA dessa conta nao funciona.',
                'error_description', case
                    when v_reg.tem_job then 'Existe job na fila — o defeito esta no worker, nao no enfileiramento.'
                    else 'NAO existe job na fila: o enfileiramento nao aconteceu. Reenfileirar inserindo em openai_provision_queue.'
                end,
                'request_id', 'prov-sem-chave:' || v_reg.id || ':' || v_hora,
                'context', jsonb_build_object(
                    'profile_id', v_reg.id,
                    'ativa_desde', v_reg.created_at,
                    'tem_job_na_fila', v_reg.tem_job)
            ));
            if coalesce((v_res ->> 'skipped')::boolean, false) is false then
                v_sem_chave := v_sem_chave + 1;
                perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
            end if;
        exception when others then
            raise warning '[provisionamento_scan] sem chave %: %', v_reg.id, sqlerrm;
        end;
    end loop;

    return jsonb_build_object(
        'ok', true,
        'carencia_min', v_carencia,
        'incidentes', jsonb_build_object(
            'erro', v_erros,
            'fila_travada', v_travados,
            'conta_sem_chave', v_sem_chave)
    );
end;
$function$;

-- 3. Alertas de consumo da OpenAI ---------------------------------------------
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

    -- 4.2 Zeragem em horario comercial.
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

    -- 4.3 Anomalia diaria de custo.
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

-- 4. Painel do Super Admin ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate NUMERIC := COALESCE(public.latest_usd_brl_rate(), 5.50);
  v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_today_start TIMESTAMPTZ := (v_today::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_month_start TIMESTAMPTZ := (date_trunc('month', v_today)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_super BOOLEAN := public.is_super_admin();
  v_scope_all BOOLEAN;
  v_allowed UUID[];
  v_result JSONB;
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_scope_all := v_super OR public.admin_client_scope_all();
  v_allowed := public.admin_allowed_client_ids();

  SELECT jsonb_build_object(
    'generated_at', NOW(),
    'exchange_rate', v_rate,
    'is_super_admin', v_super,

    'clients', (
      SELECT jsonb_build_object(
        'active', COUNT(*) FILTER (WHERE p.role IN ('admin','agent','supervisor') AND p.deactivated_at IS NULL),
        'new_this_month', COUNT(*) FILTER (WHERE p.role = 'admin' AND p.deactivated_at IS NULL AND p.created_at >= v_month_start),
        'deactivated', CASE WHEN v_super THEN COUNT(*) FILTER (WHERE p.deactivated_at IS NOT NULL) ELSE NULL END,
        'active_admins', COUNT(*) FILTER (WHERE p.role = 'admin' AND p.deactivated_at IS NULL)
      ) FROM public.profiles p
    ),

    'pending_signups', (
      CASE WHEN v_super
        THEN (SELECT COUNT(*) FROM public.pending_signups WHERE status = 'pending')
        ELSE NULL END
    ),

    'deactivated_list', (
      CASE WHEN v_super THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', p.id, 'company_name', p.company_name, 'full_name', p.full_name,
          'deactivated_at', p.deactivated_at,
          'days_remaining', GREATEST(0, 30 - EXTRACT(DAY FROM NOW() - p.deactivated_at)::int)
        ) ORDER BY p.deactivated_at), '[]'::jsonb)
        FROM public.profiles p WHERE p.deactivated_at IS NOT NULL
      ) ELSE '[]'::jsonb END
    ),

    'tokens', (
      SELECT jsonb_build_object(
        'today_tokens', COALESCE(SUM(t.total_tokens) FILTER (WHERE t.created_at >= v_today_start), 0),
        'today_brl', ROUND(COALESCE(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate)) FILTER (WHERE t.created_at >= v_today_start), 0)::numeric, 2),
        'month_tokens', COALESCE(SUM(t.total_tokens), 0),
        'month_brl', ROUND(COALESCE(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate)), 0)::numeric, 2)
      ) FROM public.token_usage_log t WHERE t.created_at >= v_month_start
    ),

    'templates', (
      SELECT jsonb_build_object(
        'today_count', COUNT(*) FILTER (WHERE s.created_at >= v_today_start),
        'today_brl', ROUND(COALESCE(SUM(public.meta_template_price_usd(s.user_id, s.template_name)) FILTER (WHERE s.created_at >= v_today_start), 0) * v_rate, 2),
        'month_count', COUNT(*),
        'month_brl', ROUND(COALESCE(SUM(public.meta_template_price_usd(s.user_id, s.template_name)), 0) * v_rate, 2)
      ) FROM public.template_sends s WHERE s.created_at >= v_month_start
    ),

    'instances', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'connected', COUNT(*) FILTER (WHERE i.status = 'connected'),
        'disconnected', COUNT(*) FILTER (WHERE i.status IS DISTINCT FROM 'connected'),
        'meta', COUNT(*) FILTER (WHERE i.provider = 'meta'),
        'restricted', COUNT(*) FILTER (WHERE i.restriction_active)
      ) FROM public.instances i
    ),

    'instagram', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'connected', COUNT(*) FILTER (WHERE g.status = 'connected'),
        'expiring', COUNT(*) FILTER (WHERE g.token_expires_at IS NOT NULL AND g.token_expires_at < NOW() + INTERVAL '7 days')
      ) FROM public.instagram_instances g
    ),

    'health', (
      SELECT jsonb_build_object(
        'queue_pending', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'pending'),
        'queue_processing', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'processing'),
        'queue_failed', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'),
        'alerts_open', (SELECT COUNT(*) FROM public.alert_log WHERE NOT resolved),
        'tickets_open', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved'),
        'tickets_urgent', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved' AND priority = 'urgent'),
        'tickets_waiting', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved' AND last_sender_type = 'client')
      )
    ),

    'usage', (
      SELECT jsonb_build_object(
        'messages_in', (SELECT COUNT(*) FROM public.messages WHERE created_at >= v_today_start AND direction = 'inbound'),
        'messages_out', (SELECT COUNT(*) FROM public.messages WHERE created_at >= v_today_start AND direction = 'outbound'),
        'conversations_active', (SELECT COUNT(*) FROM public.conversations WHERE status IN ('open','pending')),
        'campaigns_dispatching', (SELECT COUNT(*) FROM public.campaigns WHERE status = 'dispatching'),
        'appointments_today', (SELECT COUNT(*) FROM public.appointments WHERE created_at >= v_today_start)
      )
    ),

    'top_cost', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT p.id, COALESCE(p.company_name, p.full_name, p.email) AS company_name,
               ROUND(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate))::numeric, 2) AS cost_brl,
               SUM(t.total_tokens) AS tokens
          FROM public.token_usage_log t
          JOIN public.profiles p ON p.id = t.owner_id
         WHERE t.created_at >= NOW() - INTERVAL '30 days'
           AND (v_scope_all OR p.id = ANY (v_allowed))
           AND (v_super OR p.role IS DISTINCT FROM 'super-admin')
         GROUP BY p.id, p.company_name, p.full_name, p.email
         ORDER BY 3 DESC
         LIMIT 10
      ) x
    ),

    'risk', (
      SELECT jsonb_build_object(
        'invalid_openai', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'company_name', COALESCE(p.company_name, p.full_name))), '[]'::jsonb)
            FROM public.profiles p
           WHERE p.openai_token_invalid IS TRUE AND p.deactivated_at IS NULL
             AND (v_scope_all OR p.id = ANY (v_allowed))
             AND (v_super OR p.role IS DISTINCT FROM 'super-admin')
        ),
        'restricted_instances', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', i.id, 'name', i.name, 'type', i.restriction_type,
            'company_name', COALESCE(p.company_name, p.full_name)
          )), '[]'::jsonb)
            FROM public.instances i LEFT JOIN public.profiles p ON p.id = i.user_id
           WHERE i.restriction_active
             AND (v_scope_all OR i.user_id = ANY (v_allowed))
        ),
        'idle_tenants', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', p.id, 'company_name', COALESCE(p.company_name, p.full_name), 'last_message_at', lm.last_at
          ) ORDER BY lm.last_at NULLS FIRST), '[]'::jsonb)
            FROM public.profiles p
            LEFT JOIN LATERAL (
              SELECT MAX(c.last_message_at) AS last_at
                FROM public.conversations c WHERE c.user_id = p.id
            ) lm ON TRUE
           WHERE p.role = 'admin' AND p.deactivated_at IS NULL
             AND (v_scope_all OR p.id = ANY (v_allowed))
             AND (lm.last_at IS NULL OR lm.last_at < NOW() - INTERVAL '7 days')
        )
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 5. A coluna, por ultimo -----------------------------------------------------
alter table public.profiles drop column if exists is_internal;

commit;
