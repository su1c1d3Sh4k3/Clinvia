-- Despacho de alerta: o elo que faltava entre `incidents` e o WhatsApp.
--
-- O QUE ESTAVA QUEBRADO (incidente critico dos 182 resumos, 22/09 23:33):
-- a funcao alert-notify existe e funciona — o teste manual de canal foi entregue
-- as 22:31, uma hora ANTES do incidente. O que nao existia era quem a chamasse.
-- Os unicos crons de monitoramento sao incident-scan-db-sources (*/10) e
-- openai-alerts-scan (30 * * * *): os dois ESCREVEM incidente e terminam. A acao
-- `notify` exige `incident_id` explicito no corpo da requisicao, e ninguem nunca
-- forneceu um. Resultado: incidente gravado como critico, notified_count = 0,
-- zero linhas em incident_notifications, zero mensagens.
--
-- AS QUATRO CORRECOES DESTA MIGRATION:
--
-- 1. CRITICA E ALTA NAO ESPERAM ANALISE. O portao que eu mesmo escrevi ontem
--    (`analyzed_at is not null`) manteria o silencio mesmo depois de existir um
--    despachante, porque nao ha analisador no ar. Um alerta critico sem causa
--    provavel ainda e infinitamente melhor do que nenhum alerta.
--
-- 2. CONTADOR SO SOBE DEPOIS DO ENVIO. Antes o UPDATE que escolhia a linha ja
--    marcava "avisei" — atomico, mas um envio que falhasse ficava para a proxima
--    janela de 60 min. Agora a reserva e `notify_claimed_at` e quem fecha o ciclo
--    e `incident_notification_done`. Continua imune a rajada (a reserva e feita
--    no mesmo UPDATE que devolve a linha), e falha volta para a fila com recuo.
--
-- 3. RECUO PROGRESSIVO 2/5/15/30 MIN. Enquanto os templates nao forem aprovados,
--    fora da janela de 24h da Meta os dois caminhos falham. Nao ha como saber
--    QUANDO a janela reabre (ela reabre quando o destinatario escreve), entao a
--    unica estrategia honesta e insistir: 30 min e o pior atraso possivel entre a
--    janela reabrir e o aviso sair.
--
-- 4. openai_alerts PASSA A VIRAR INCIDENTE. Ela escrevia so na propria tabela,
--    sem nenhuma ponte para `incidents` — os tres alertas de conta OpenAI nunca
--    teriam notificado, mesmo com despachante no ar.

-- ============================================================
-- 1. Estado do envio no incidente
-- ============================================================

alter table public.incidents
    add column if not exists notify_claimed_at      timestamptz,
    add column if not exists notify_failed_count    integer not null default 0,
    add column if not exists notify_next_attempt_at timestamptz,
    add column if not exists notify_last_error      text;

comment on column public.incidents.notify_claimed_at is
  'Reserva do envio, feita no mesmo UPDATE que devolve a linha ao despachante. Reserva com mais de 5 min e considerada abandonada (funcao morreu no meio).';
comment on column public.incidents.notify_failed_count is
  'Tentativas de envio seguidas que falharam. Zera no primeiro sucesso. E o numero que sustenta o aviso de "canal mudo" no painel.';
comment on column public.incidents.notify_next_attempt_at is
  'Recuo progressivo apos falha: 2, 5, 15 e depois 30 min. Nao ha como saber quando a janela de 24h da Meta reabre, entao 30 min e o atraso maximo entre reabrir e o aviso sair.';
comment on column public.incidents.notify_last_error is
  'Motivo da ultima falha de envio, ja combinando template e texto livre. Aparece no painel sem precisar abrir o incidente.';

-- Fila do despachante: o indice cobre exatamente o predicado do claim.
create index if not exists incidents_notify_pendente_idx
  on public.incidents (notify_next_attempt_at nulls first, last_seen desc)
  where status <> 'resolved';

-- ============================================================
-- 2. Fila de aviso — reserva agora, contabiliza depois
-- ============================================================

drop function if exists public.incident_claim_for_notification(integer);

create function public.incident_claim_for_notification(p_limit integer default 10)
returns table (
    id uuid,
    source text,
    component text,
    ai_severity text,
    ai_summary text,
    ai_probable_cause text,
    ai_origin text,
    ai_fix_system text,
    ai_fix_n8n text,
    event_count integer,
    first_seen timestamptz,
    last_seen timestamptz,
    owner_id uuid,
    affected_tenants uuid[],
    analyzed_at timestamptz,
    kind text,
    ocorrencias_novas integer,
    desde timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado   boolean;
    v_cooldown integer;
begin
    select coalesce(s.alert_notify_enabled, true),
           greatest(0, coalesce(s.incident_notify_cooldown_min, 60))
      into v_ligado, v_cooldown
      from public.llm_platform_settings s limit 1;

    if v_ligado is false then
        return;
    end if;

    return query
    with alvo as (
        select i.id,
               case when i.notified_count = 0 then 'individual' else 'recorrencia' end as kind,
               greatest(0, i.event_count - i.notified_at_event_count)                  as novas,
               i.last_notified_at                                                      as desde
          from public.incidents i
         where i.status <> 'resolved'
           -- CRITICA e ALTA saem sem analise. Media/baixa continuam esperando:
           -- para elas, um aviso sem causa nem acao e so barulho — e elas tem o
           -- resumo agrupado como caminho proprio.
           and (i.ai_severity in ('critica', 'alta') or i.analyzed_at is not null)
           -- nao pisa em despacho que ja esta em andamento
           and (i.notify_claimed_at is null
                or i.notify_claimed_at < now() - interval '5 minutes')
           -- respeita o recuo de quem acabou de falhar
           and (i.notify_next_attempt_at is null
                or i.notify_next_attempt_at <= now())
           and (
                i.notified_count = 0
                or (
                    -- so volta a falar se continuou acontecendo DEPOIS do ultimo aviso
                    i.event_count > i.notified_at_event_count
                    and i.last_notified_at < now() - make_interval(mins => v_cooldown)
                )
           )
         order by
            case i.ai_severity when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
            i.last_seen desc
         limit greatest(1, coalesce(p_limit, 10))
         for update skip locked
    )
    update public.incidents i
       set notify_claimed_at = now(),
           updated_at        = now()
      from alvo a
     where i.id = a.id
    returning i.id, i.source, i.component, i.ai_severity, i.ai_summary, i.ai_probable_cause,
              i.ai_origin, i.ai_fix_system, i.ai_fix_n8n, i.event_count, i.first_seen,
              i.last_seen, i.owner_id, i.affected_tenants, i.analyzed_at,
              a.kind, a.novas, a.desde;
end;
$$;

comment on function public.incident_claim_for_notification(integer) is
  'Fila de aviso. Reserva a linha (notify_claimed_at) e devolve; quem fecha o ciclo e incident_notification_done. Critica/alta nao esperam analise.';

-- ============================================================
-- 3. Fechar o ciclo do envio
-- ============================================================

create or replace function public.incident_notification_done(
    p_incident_id uuid,
    p_ok boolean,
    p_event_count integer default null,
    p_error text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if p_ok then
        update public.incidents
           set notified_count          = notified_count + 1,
               last_notified_at        = now(),
               -- o despachante devolve a contagem que ele LEU: um evento que
               -- chegou durante o envio precisa contar como "novo desde o aviso".
               notified_at_event_count = coalesce(p_event_count, event_count),
               notify_claimed_at       = null,
               notify_failed_count     = 0,
               notify_next_attempt_at  = null,
               notify_last_error       = null,
               updated_at              = now()
         where id = p_incident_id;
    else
        update public.incidents
           set notify_claimed_at   = null,
               notify_failed_count = notify_failed_count + 1,
               notify_next_attempt_at = now() + make_interval(mins =>
                   case least(notify_failed_count + 1, 4)
                        when 1 then 2 when 2 then 5 when 3 then 15 else 30 end),
               notify_last_error   = left(coalesce(p_error, 'falha sem motivo informado'), 500),
               updated_at          = now()
         where id = p_incident_id;
    end if;
end;
$$;

comment on function public.incident_notification_done(uuid, boolean, integer, text) is
  'Fecha o ciclo do envio. Sucesso contabiliza e limpa o recuo; falha devolve a linha para a fila com recuo de 2/5/15/30 min e guarda o motivo.';

-- ============================================================
-- 4. Contagem barata para o cron nao acordar a edge function a toa
-- ============================================================

create or replace function public.incident_notify_pending_count()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
    select count(*)::integer
      from public.incidents i
     where i.status <> 'resolved'
       and (i.ai_severity in ('critica', 'alta') or i.analyzed_at is not null)
       and (i.notify_claimed_at is null or i.notify_claimed_at < now() - interval '5 minutes')
       and (i.notify_next_attempt_at is null or i.notify_next_attempt_at <= now())
       and (
            i.notified_count = 0
            or (i.event_count > i.notified_at_event_count
                and i.last_notified_at < now() - make_interval(mins => greatest(0, coalesce(
                    (select s.incident_notify_cooldown_min from public.llm_platform_settings s limit 1), 60))))
       );
$$;

-- ============================================================
-- 5. openai_alerts -> incidents
-- ============================================================
--
-- A tabela openai_alerts era uma ilha: o varredor de conta OpenAI escrevia nela
-- e parava ali. Nenhum dos tres alertas (sync parado, zeragem, anomalia de
-- custo) chegaria ao WhatsApp nem apareceria no painel de incidentes.
-- A ponte e um trigger, e nao uma reescrita do varredor, porque assim qualquer
-- caminho novo que insira em openai_alerts ja nasce coberto.

create or replace function public.openai_alert_to_incident()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_res jsonb;
    v_sev text := case new.severity when 'critical' then 'critica'
                                    when 'warning'  then 'alta'
                                    else 'media' end;
begin
    v_res := public.incident_record(jsonb_build_object(
        'source',        'db_job',
        'component',     'openai:' || new.kind,
        -- dedupe_key ja e o agrupador natural do varredor; reusa-lo como locator
        -- faz o fingerprint do incidente seguir exatamente a mesma regra.
        'route',         new.dedupe_key,
        'request_id',    'openai_alert:' || new.id::text,
        'error_name',    new.kind,
        'error_message', new.message,
        'owner_id',      new.profile_id,
        'context',       coalesce(new.detail, '{}'::jsonb)
    ));

    if coalesce((v_res ->> 'skipped')::boolean, false) is false then
        perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
    end if;

    return null;
exception when others then
    -- alerta de conta nunca pode derrubar o varredor que o gerou
    raise warning 'openai_alert_to_incident falhou para %: %', new.id, sqlerrm;
    return null;
end;
$$;

drop trigger if exists zz_openai_alert_to_incident on public.openai_alerts;
create trigger zz_openai_alert_to_incident
    after insert on public.openai_alerts
    for each row execute function public.openai_alert_to_incident();

-- ============================================================
-- 6. Simular um incidente critico de ponta a ponta
-- ============================================================
--
-- Deliberadamente NAO existe um caminho especial de envio aqui. A RPC so grava
-- um incidente de verdade, pelo mesmo `incident_record` que o varredor usa; o
-- despachante o encontra no minuto seguinte e tenta a Meta pelo caminho real.
-- Um botao que chamasse a Meta direto provaria um caminho que nao e o que
-- falhou — provaria exatamente nada.

create or replace function public.admin_simulate_incident(p_severity text default 'critica')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_sev text := coalesce(nullif(trim(p_severity), ''), 'critica');
    v_res jsonb;
    v_id  uuid;
begin
    if not public.admin_can('alertas', 'edit') then
        raise exception 'Sem permissão para simular incidentes' using errcode = '42501';
    end if;
    if v_sev not in ('critica', 'alta', 'media', 'baixa') then
        raise exception 'Severidade inválida: %', v_sev using errcode = '22023';
    end if;

    v_res := public.incident_record(jsonb_build_object(
        'source',    'db_job',
        'component', 'simulacao-de-alerta',
        -- carimbo no locator: cada simulacao e um incidente novo, e nao mais um
        -- evento colado no anterior.
        'route',     'simulacao/' || to_char(now(), 'YYYYMMDD"T"HH24MISS'),
        'error_name', 'simulacao_manual',
        'error_message',
            'Incidente de teste disparado pelo painel em '
            || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
            || '. Se esta mensagem chegou no WhatsApp, a corrente inteira está de pé: '
            || 'gravação do incidente, fila de aviso, despachante e Meta.',
        'context',   jsonb_build_object('simulacao', true, 'por', auth.uid())
    ));

    v_id := (v_res ->> 'incident_id')::uuid;
    perform public.incident_set_severidade_inicial(v_id, v_sev);

    -- a causa/acao existiriam so depois da analise; aqui elas sao escritas na mao
    -- para que a mensagem de teste tenha a MESMA forma de um alerta de verdade.
    update public.incidents
       set ai_probable_cause = 'nenhuma — incidente criado à mão pelo painel de alertas',
           ai_fix_system     = 'nada a fazer: se esta mensagem chegou, o canal está funcionando',
           notes             = coalesce(notes, 'simulação')
     where id = v_id;

    return jsonb_build_object(
        'incident_id', v_id,
        'severidade', v_sev,
        'aviso', 'O despachante roda a cada minuto. O resultado do envio aparece neste incidente.'
    );
end;
$$;

-- ============================================================
-- 7. Painel: o canal mudo precisa gritar
-- ============================================================

create or replace function public.admin_incident_counters()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v jsonb;
begin
    if not public.admin_can('alertas', 'view') then
        raise exception 'Acesso negado ao painel de alertas' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'abertos',        count(*) filter (where status = 'open'),
        'criticos',       count(*) filter (where status = 'open' and ai_severity = 'critica'),
        'altos',          count(*) filter (where status = 'open' and ai_severity = 'alta'),
        'sem_analise',    count(*) filter (where status = 'open' and analyzed_at is null),
        'resolvidos_24h', count(*) filter (where status = 'resolved' and resolved_at >= now() - interval '24 hours'),
        'eventos_24h',    coalesce(sum(event_count) filter (where last_seen >= now() - interval '24 hours'), 0),
        -- O numero que responde "o canal esta mudo?": incidente grave, aberto,
        -- que JA tentou avisar e nao conseguiu nenhuma vez.
        'criticos_sem_aviso', count(*) filter (
            where status <> 'resolved'
              and ai_severity in ('critica', 'alta')
              and notified_count = 0
              and notify_failed_count > 0
        ),
        -- Grave, aberto e ainda nem tentado: se isto nao zerar em poucos minutos,
        -- o despachante e que parou.
        'aguardando_despacho', count(*) filter (
            where status <> 'resolved'
              and ai_severity in ('critica', 'alta')
              and notified_count = 0
              and notify_failed_count = 0
        ),
        'ultima_falha_envio', max(notify_last_error) filter (
            where notify_failed_count > 0 and status <> 'resolved'
        )
    )
    into v
    from public.incidents;

    return v || jsonb_build_object(
        'envios_falhos_24h', (
            select count(*)
            from public.incident_notifications
            where status = 'failed' and sent_at >= now() - interval '24 hours'
        ),
        'envios_ok_1h', (
            select count(*)
            from public.incident_notifications
            where status = 'sent' and sent_at >= now() - interval '1 hour'
        ),
        'ultimo_envio_ok', (
            select max(sent_at) from public.incident_notifications where status = 'sent'
        ),
        'proxima_tentativa', (
            select min(notify_next_attempt_at)
            from public.incidents
            where status <> 'resolved' and notify_next_attempt_at is not null
        )
    );
end;
$$;

drop function if exists public.admin_list_incidents(text, text, text, integer);

create function public.admin_list_incidents(
    p_status text default 'open',
    p_severity text default null,
    p_search text default null,
    p_limit integer default 100
)
returns table (
    id uuid,
    fingerprint text,
    source text,
    component text,
    status text,
    first_seen timestamptz,
    last_seen timestamptz,
    event_count integer,
    conta text,
    contas_afetadas integer,
    ai_summary text,
    ai_probable_cause text,
    ai_origin text,
    ai_severity text,
    ai_impact text,
    ai_fix_n8n text,
    ai_fix_system text,
    ai_confidence numeric,
    analyzed_at timestamptz,
    analise_reaproveitada boolean,
    last_notified_at timestamptz,
    notified_count integer,
    ocorrencias_desde_ultimo_aviso integer,
    envios_falhos integer,
    notify_failed_count integer,
    notify_last_error text,
    notify_next_attempt_at timestamptz,
    canal_mudo boolean,
    resolved_at timestamptz,
    notes text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
    if not public.admin_can('alertas', 'view') then
        raise exception 'Acesso negado ao painel de alertas' using errcode = '42501';
    end if;

    return query
    select
        i.id,
        i.fingerprint,
        i.source,
        i.component,
        i.status,
        i.first_seen,
        i.last_seen,
        i.event_count,
        coalesce(p.company_name, p.full_name, 'nenhuma identificada') as conta,
        coalesce(array_length(i.affected_tenants, 1), 0) as contas_afetadas,
        i.ai_summary,
        i.ai_probable_cause,
        i.ai_origin,
        i.ai_severity,
        i.ai_impact,
        i.ai_fix_n8n,
        i.ai_fix_system,
        i.ai_confidence,
        i.analyzed_at,
        (i.analysis_reused_from is not null) as analise_reaproveitada,
        i.last_notified_at,
        i.notified_count,
        greatest(0, i.event_count - i.notified_at_event_count) as ocorrencias_desde_ultimo_aviso,
        (
            select count(*)::integer
            from public.incident_notifications n
            where n.incident_id = i.id and n.status = 'failed'
        ) as envios_falhos,
        i.notify_failed_count,
        i.notify_last_error,
        i.notify_next_attempt_at,
        (i.status <> 'resolved'
         and i.ai_severity in ('critica', 'alta')
         and i.notified_count = 0
         and i.notify_failed_count > 0) as canal_mudo,
        i.resolved_at,
        i.notes
    from public.incidents i
    left join public.profiles p on p.id = i.owner_id
    where (p_status is null or p_status = 'todos' or i.status = p_status)
      and (p_severity is null or p_severity = 'todas' or i.ai_severity = p_severity)
      and (
        p_search is null or p_search = ''
        or i.component ilike '%' || p_search || '%'
        or coalesce(i.ai_summary, '') ilike '%' || p_search || '%'
      )
    order by
        -- canal mudo primeiro: e o unico estado em que o painel e a UNICA via
        (i.notified_count = 0 and i.notify_failed_count > 0
         and i.ai_severity in ('critica', 'alta') and i.status <> 'resolved') desc,
        case i.status when 'open' then 0 when 'acknowledged' then 1 else 2 end,
        case i.ai_severity when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
        i.last_seen desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- Reabrir tambem zera o estado de envio, senao o recuo de um incidente
-- resolvido-e-reaberto continuaria valendo.
create or replace function public.admin_set_incident_status(
    p_incident_id uuid,
    p_status text,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_antes  text;
    v_row    public.incidents;
    v_reabre boolean;
begin
    if not public.admin_can('alertas', 'edit') then
        raise exception 'Sem permissão para alterar incidentes' using errcode = '42501';
    end if;

    if p_status not in ('open', 'acknowledged', 'resolved') then
        raise exception 'Estado inválido: %', p_status using errcode = '22023';
    end if;

    select status into v_antes from public.incidents where id = p_incident_id;
    if v_antes is null then
        raise exception 'Incidente não encontrado' using errcode = 'P0002';
    end if;

    v_reabre := (v_antes = 'resolved' and p_status <> 'resolved');

    update public.incidents
       set status      = p_status,
           notes       = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
           resolved_at = case when p_status = 'resolved' then now() else null end,
           resolved_by = case when p_status = 'resolved' then auth.uid() else null end,
           analyzed_at             = case when v_reabre then null else analyzed_at end,
           analysis_claimed_at     = case when v_reabre then null else analysis_claimed_at end,
           analysis_reused_from    = case when v_reabre then null else analysis_reused_from end,
           notified_count          = case when v_reabre then 0 else notified_count end,
           notified_at_event_count = case when v_reabre then 0 else notified_at_event_count end,
           last_notified_at        = case when v_reabre then null else last_notified_at end,
           notify_claimed_at       = case when v_reabre then null else notify_claimed_at end,
           notify_failed_count     = case when v_reabre then 0 else notify_failed_count end,
           notify_next_attempt_at  = case when v_reabre then null else notify_next_attempt_at end,
           notify_last_error       = case when v_reabre then null else notify_last_error end,
           updated_at  = now()
     where id = p_incident_id
    returning * into v_row;

    return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'reaberto', v_reabre);
end;
$$;

-- ============================================================
-- 8. O cron que faltava
-- ============================================================

create or replace function public.invoke_alert_dispatch()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url text;
    v_key text;
begin
    -- de minuto em minuto, mas so acorda a edge function quando ha o que enviar
    if public.incident_notify_pending_count() = 0 then
        return;
    end if;

    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;

    perform net.http_post(
        url := v_url || '/functions/v1/alert-notify',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object('action', 'dispatch')
    );
exception when others then
    raise warning 'invoke_alert_dispatch: %', sqlerrm;
end;
$$;

select cron.unschedule('alert-dispatch')
 where exists (select 1 from cron.job where jobname = 'alert-dispatch');

select cron.schedule('alert-dispatch', '* * * * *', 'select public.invoke_alert_dispatch()');

-- ============================================================
-- 9. Privilegios
-- ============================================================
-- `create function` concede EXECUTE a PUBLIC e `revoke from anon` NAO tira esse
-- grant — os dois comandos, nesta ordem, sao obrigatorios.

revoke all on function public.incident_claim_for_notification(integer) from public, anon, authenticated;
revoke all on function public.incident_notification_done(uuid, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.incident_notify_pending_count() from public, anon, authenticated;
revoke all on function public.invoke_alert_dispatch() from public, anon, authenticated;
revoke all on function public.openai_alert_to_incident() from public, anon, authenticated;
grant execute on function public.incident_claim_for_notification(integer) to service_role;
grant execute on function public.incident_notification_done(uuid, boolean, integer, text) to service_role;
grant execute on function public.incident_notify_pending_count() to service_role;

revoke all on function public.admin_simulate_incident(text) from public, anon;
revoke all on function public.admin_incident_counters() from public, anon;
revoke all on function public.admin_list_incidents(text, text, text, integer) from public, anon;
revoke all on function public.admin_set_incident_status(uuid, text, text) from public, anon;
grant execute on function public.admin_simulate_incident(text) to authenticated;
grant execute on function public.admin_incident_counters() to authenticated;
grant execute on function public.admin_list_incidents(text, text, text, integer) to authenticated;
grant execute on function public.admin_set_incident_status(uuid, text, text) to authenticated;
