-- ============================================================
-- ROLLBACK de 20260923470000_incidente_origem_no_alerta.sql
--
-- Devolve `incident_claim_for_notification` ao corpo de 20260923360000, sem
-- origem/origem_inferida — com a espera de analise, a exclusao de
-- `somente_painel` e a gravidade efetiva preservadas. As colunas em `incidents`
-- continuam existindo: quem as remove e o rollback da 450000.
--
-- Rodar ANTES de desfazer a 450000: uma funcao que devolve `i.origem` quebra se
-- a coluna sumir primeiro.
-- ============================================================

drop function if exists public.incident_claim_for_notification(integer);

create function public.incident_claim_for_notification(p_limit integer default 10)
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
           -- AVISO IMEDIATO E SO PARA CRITICA E ALTA. Gravidade EFETIVA: sem
           -- analise da IA vale a do catalogo, entao analisador fora do ar nao
           -- atrasa critico por 2 horas.
           and public.incident_severidade_efetiva(i.component, i.ai_severity)
               in ('critica', 'alta')
           -- analisado sai na hora; sem analise espera 2 minutos e entao sai
           -- degradada, com o erro bruto. Nunca fica presa.
           and (i.analyzed_at is not null
                or i.created_at < now() - interval '2 minutes')
           -- manutencao interna da plataforma fica no painel e nao vira mensagem
           and not coalesce(
                (select ci.somente_painel from public.incident_component_info(i.component) ci),
                false)
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
            case public.incident_severidade_efetiva(i.component, i.ai_severity)
                 when 'critica' then 0 else 1 end,
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
  'Fila de aviso. Reserva a linha (notify_claimed_at) e devolve; quem fecha o ciclo e incident_notification_done. Critica/alta efetivas, sem somente_painel.';

revoke all on function public.incident_claim_for_notification(integer) from public, anon, authenticated;
grant execute on function public.incident_claim_for_notification(integer) to service_role;
