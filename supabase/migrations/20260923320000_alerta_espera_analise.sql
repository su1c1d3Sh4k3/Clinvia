-- O despachante passa a ESPERAR a analise por ate 2 minutos.
--
-- COMO ESTAVA: critica e alta eram despachadas na hora, sem analise. Isso foi
-- deliberado em 23/09 — naquele momento nao existia analisador nenhum, e segurar
-- um incidente critico esperando algo que nunca vinha seria pior. O preco era o
-- alerta sair com "Causa provavel: analise ainda nao feita".
--
-- O QUE MUDOU: o analisador existe (`incident-analyze`, cron */2). Agora a
-- espera tem fim conhecido. Entao:
--
--   * critica/alta esperam a analise por ate 2 minutos. Passou disso, sai mesmo
--     assim — com o erro BRUTO do evento e a frase "analise indisponivel". Nunca
--     fica preso, nunca sai com texto de enfeite.
--   * media/baixa continuam exigindo analise: para elas um aviso sem causa e so
--     barulho, e elas tem o resumo agrupado como caminho proprio.
--
-- POR QUE 2 MINUTOS: o cron do analisador roda de 2 em 2 minutos e uma analise
-- custa ~4s. Dois minutos cobrem o pior caso de "o incidente nasceu 1 segundo
-- depois que a varredura passou". Mais do que isso seria atrasar noticia ruim
-- para ganhar pouco.
--
-- O relogio e `created_at` do incidente, nao `first_seen`: o que interessa e ha
-- quanto tempo o ANALISADOR teve a chance de pegar a linha, nao quando o erro
-- aconteceu la na origem.
--
-- `incident_notify_pending_count` muda junto e com a MESMA condicao. As duas
-- divergirem tem dois efeitos ruins e simetricos: ou o portao diz "nada
-- pendente" enquanto o claim entregaria algo (alerta que nunca sai), ou o portao
-- diz "tem coisa" de minuto em minuto para um claim que volta vazio (function
-- acordada a toa, para sempre).

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
           -- analisado sai na hora; critica/alta sem analise esperam 2 minutos e
           -- entao saem degradadas; media/baixa esperam a analise.
           and (
                i.analyzed_at is not null
                or (i.ai_severity in ('critica', 'alta')
                    and i.created_at < now() - interval '2 minutes')
           )
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
