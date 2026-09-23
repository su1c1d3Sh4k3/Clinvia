-- Rollback de 20260923170000_incident_despacho.sql
--
-- DESLIGAR SEM REVERTER (preferivel em quase todo caso):
--   select cron.unschedule('alert-dispatch');
--   -- ou, sem tocar no cron, pela chave que o painel ja edita:
--   update public.llm_platform_settings set alert_notify_enabled = false;
-- O primeiro para o despacho e mantem os incidentes sendo gravados; o segundo
-- faz incident_claim_for_notification devolver vazio. Nos dois casos o painel
-- continua completo e nada de dado e perdido.
--
-- ATENCAO: reverter esta migration devolve o sistema ao estado em que NENHUM
-- alerta chegava ao WhatsApp — que e exatamente a falha do incidente dos 182
-- resumos em 22/09. So faca isso se o despacho estiver causando dano ativo.

-- 1. cron
select cron.unschedule('alert-dispatch')
 where exists (select 1 from cron.job where jobname = 'alert-dispatch');

drop function if exists public.invoke_alert_dispatch();

-- 2. ponte openai_alerts -> incidents
drop trigger if exists zz_openai_alert_to_incident on public.openai_alerts;
drop function if exists public.openai_alert_to_incident();

-- 3. simulacao
drop function if exists public.admin_simulate_incident(text);

-- 4. fila de aviso volta ao formato anterior (contador no claim)
drop function if exists public.incident_claim_for_notification(integer);
drop function if exists public.incident_notification_done(uuid, boolean, integer, text);
drop function if exists public.incident_notify_pending_count();

create function public.incident_claim_for_notification(p_limit integer default 10)
returns table (
    id uuid, source text, component text, ai_severity text, ai_summary text,
    ai_probable_cause text, ai_fix_system text, ai_fix_n8n text,
    event_count integer, first_seen timestamptz, last_seen timestamptz,
    kind text, ocorrencias_novas integer, desde timestamptz
)
language plpgsql security definer set search_path to 'public'
as $$
declare
    v_ligado boolean;
    v_cooldown integer;
begin
    select coalesce(s.alert_notify_enabled, true),
           greatest(0, coalesce(s.incident_notify_cooldown_min, 60))
      into v_ligado, v_cooldown
      from public.llm_platform_settings s limit 1;
    if v_ligado is false then return; end if;

    return query
    with alvo as (
        select i.id,
               case when i.notified_count = 0 then 'individual' else 'recorrencia' end as kind,
               (i.event_count - i.notified_at_event_count) as novas,
               i.last_notified_at as desde
          from public.incidents i
         where i.status <> 'resolved'
           and i.analyzed_at is not null
           and (i.notified_count = 0
                or (i.event_count > i.notified_at_event_count
                    and i.last_notified_at < now() - make_interval(mins => v_cooldown)))
         order by
            case i.ai_severity when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
            i.last_seen desc
         limit greatest(1, coalesce(p_limit, 10))
         for update skip locked
    )
    update public.incidents i
       set last_notified_at = now(),
           notified_count = i.notified_count + 1,
           notified_at_event_count = i.event_count,
           updated_at = now()
      from alvo a
     where i.id = a.id
    returning i.id, i.source, i.component, i.ai_severity, i.ai_summary, i.ai_probable_cause,
              i.ai_fix_system, i.ai_fix_n8n, i.event_count, i.first_seen, i.last_seen,
              a.kind, a.novas, a.desde;
end;
$$;

revoke all on function public.incident_claim_for_notification(integer) from public, anon, authenticated;
grant execute on function public.incident_claim_for_notification(integer) to service_role;

-- 5. colunas de estado do envio
--    Ficam por ultimo porque admin_list_incidents/admin_incident_counters as leem.
drop function if exists public.admin_list_incidents(text, text, text, integer);
drop index if exists public.incidents_notify_pendente_idx;

alter table public.incidents
    drop column if exists notify_claimed_at,
    drop column if exists notify_failed_count,
    drop column if exists notify_next_attempt_at,
    drop column if exists notify_last_error;

-- NAO ha recriacao de admin_list_incidents aqui de proposito: a versao correta
-- (sem as colunas de envio) esta em 20260923160000_incident_recorrencia.sql,
-- secao 7. Reaplique aquele trecho depois deste rollback.
--
-- admin_incident_counters e admin_set_incident_status tambem ficam com a versao
-- desta migration; as duas so LEEM as colunas removidas dentro de `filter`, o
-- que quebraria. Reaplique a versao de 20260923100000 (counters) e de
-- 20260923160000 secao 6 (set_incident_status).
