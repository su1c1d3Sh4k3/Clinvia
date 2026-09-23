-- Rollback de 20260923360000_severidade_padrao_e_catalogo.sql
--
-- CONSEQUENCIA DE RODAR ISTO: a gravidade volta a depender SO da IA. Com o
-- analisador fora do ar todo incidente nasce com severidade nula e cai no resumo
-- de 2 em 2 horas, inclusive `alert-notify` e `openai:sem_credito`. E exatamente
-- o defeito que a migration fechou. So rode se o roteamento por catalogo estiver
-- causando dano maior do que isso.
--
-- O que NAO e desfeito, de proposito:
--   * a coluna `severidade_padrao` fica na tabela. Derrubar coluna e destrutivo e
--     inutil: sem as funcoes lendo ela, ela e inerte.
--   * as 10 linhas novas do catalogo ficam. Elas so dao NOME e descricao a
--     incidentes desses componentes; apagar troca uma mensagem descritiva por
--     "componente nao catalogado", o que e pior em qualquer cenario.
-- Para desligar uma linha nova sem apaga-la:
--     update public.incident_component_catalog set is_active = false where component = '<chave>';

-- ── 1. roteamento volta a ler ai_severity cru ────────────────────────────────

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
           and i.ai_severity in ('critica', 'alta')
           and (i.analyzed_at is not null
                or i.created_at < now() - interval '2 minutes')
           and not coalesce(
                (select ci.somente_painel from public.incident_component_info(i.component) ci),
                false)
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
            case i.ai_severity when 'critica' then 0 else 1 end,
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
       and i.ai_severity in ('critica', 'alta')
       and (i.analyzed_at is not null or i.created_at < now() - interval '2 minutes')
       and not coalesce(
            (select ci.somente_painel from public.incident_component_info(i.component) ci),
            false)
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

create or replace function public.incident_summary_pending(p_hours integer default 2)
returns table (
    id           uuid,
    component    text,
    ai_summary   text,
    ai_severity  text,
    event_count  integer,
    last_seen    timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select i.id, i.component, i.ai_summary, i.ai_severity, i.event_count, i.last_seen
      from public.incidents i
     where i.status <> 'resolved'
       and (i.ai_severity is null or i.ai_severity in ('media', 'baixa'))
       and i.last_seen >= now() - make_interval(hours => greatest(1, coalesce(p_hours, 2)))
       and not coalesce(
            (select ci.somente_painel from public.incident_component_info(i.component) ci),
            false)
     order by i.event_count desc, i.last_seen desc
     limit 20;
$$;

revoke all on function public.incident_summary_pending(integer) from public, anon, authenticated;
grant execute on function public.incident_summary_pending(integer) to service_role;

-- ── 2. resolvedor volta a 6 colunas (sem severidade_padrao) ──────────────────

drop function if exists public.incident_component_info(text);
create function public.incident_component_info(p_component text)
returns table (
    component      text,
    natureza       text,
    descricao      text,
    acao_padrao    text,
    somente_painel boolean,
    catalogado     boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.component, c.natureza, c.descricao, c.acao_padrao, c.somente_painel, true
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

drop function if exists public.incident_severidade_efetiva(text, text);
