-- Rollback de 20260923350000_roteamento_por_gravidade.sql
--
-- CONSEQUENCIA DE RODAR ISTO: volta o comportamento que o user reclamou em
-- 23/09/2026 — media e baixa voltam a sair individualmente no WhatsApp, no
-- minuto em que forem analisadas, e a manutencao interna da plataforma
-- ('monitoramento:componente-nao-catalogado') volta a virar mensagem. O resumo
-- de 2 em 2 horas deixa de existir de novo, entao media/baixa NAO ficam sem
-- aviso: ficam com aviso imediato, que e o defeito.
--
-- O que NAO volta: a coluna `somente_painel` continua na tabela (drop de coluna
-- e destrutivo e nao ha motivo), so deixa de ser lida. O resolvedor volta ao
-- retorno de 5 colunas porque a edge function antiga nao a conhecia — mas a
-- versao nova da function tambem funciona com 5 colunas, ela so trata o campo
-- ausente como false.
--
-- IRREVERSIVEL: os resumos ja enviados nao sao desfeitos, e os incidentes
-- media/baixa que sairam no resumo continuam com notified_count = 0 (o resumo
-- nao contabiliza por incidente, de proposito). Ao voltar, eles serao tratados
-- como "nunca avisados" e sairao individualmente uma vez.

-- ── 1. desliga o resumo ──────────────────────────────────────────────────────
do $$
begin
    perform cron.unschedule('alert-summary');
exception when others then
    null;
end;
$$;

drop function if exists public.invoke_alert_summary();
drop function if exists public.incident_summary_pending(integer);

-- ── 2. resolvedor volta a 5 colunas ──────────────────────────────────────────
drop function if exists public.incident_component_info(text);

create function public.incident_component_info(p_component text)
returns table (
    component   text,
    natureza    text,
    descricao   text,
    acao_padrao text,
    catalogado  boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.component, c.natureza, c.descricao, c.acao_padrao, true
      from public.incident_component_catalog c
     where c.is_active
       and (
            (c.match_tipo = 'exato'   and c.component = p_component)
         or (c.match_tipo = 'prefixo' and p_component like c.component || '%')
       )
     order by case when c.match_tipo = 'exato' then 0 else 1 end,
              length(c.component) desc
     limit 1;
$$;

revoke all on function public.incident_component_info(text) from public, anon, authenticated;
grant execute on function public.incident_component_info(text) to service_role;

-- ── 3. claim e portao voltam a aceitar qualquer severidade ───────────────────
create or replace function public.incident_claim_for_notification(p_limit integer default 10)
returns table (
    id uuid, source text, component text, ai_severity text, ai_summary text,
    ai_probable_cause text, ai_origin text, ai_fix_system text, ai_fix_n8n text,
    event_count integer, first_seen timestamptz, last_seen timestamptz,
    owner_id uuid, affected_tenants uuid[], analyzed_at timestamptz,
    kind text, ocorrencias_novas integer, desde timestamptz
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
           and (
                i.analyzed_at is not null
                or (i.ai_severity in ('critica', 'alta')
                    and i.created_at < now() - interval '2 minutes')
           )
           and (i.notify_claimed_at is null
                or i.notify_claimed_at < now() - interval '5 minutes')
           and (i.notify_next_attempt_at is null
                or i.notify_next_attempt_at <= now())
           and (
                i.notified_count = 0
                or (
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

revoke all on function public.incident_claim_for_notification(integer) from public, anon, authenticated;
grant execute on function public.incident_claim_for_notification(integer) to service_role;

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
       and (
            i.analyzed_at is not null
            or (i.ai_severity in ('critica', 'alta')
                and i.created_at < now() - interval '2 minutes')
       )
       and (i.notify_claimed_at is null or i.notify_claimed_at < now() - interval '5 minutes')
       and (i.notify_next_attempt_at is null or i.notify_next_attempt_at <= now())
       and (
            i.notified_count = 0
            or (i.event_count > i.notified_at_event_count
                and i.last_notified_at < now() - make_interval(mins => greatest(0, coalesce(
                    (select s.incident_notify_cooldown_min from public.llm_platform_settings s limit 1), 60))))
       );
$$;

revoke all on function public.incident_notify_pending_count() from public, anon, authenticated;
grant execute on function public.incident_notify_pending_count() to service_role;

-- ── 4. a manutencao interna volta ao WhatsApp ────────────────────────────────
update public.incident_component_catalog
   set somente_painel = false,
       updated_at     = now()
 where component = 'monitoramento:componente-nao-catalogado';
