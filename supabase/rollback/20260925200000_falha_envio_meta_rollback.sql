-- Rollback de 20260925200000_falha_envio_meta.sql
-- Catalogo volta por is_active = false / somente_painel anterior, NUNCA por delete:
-- apagar a linha PROMOVE o componente (tira piso e tira somente_painel).

set lock_timeout = '5s';
set statement_timeout = '120s';

select cron.unschedule('meta-send-spike-scan')
 where exists (select 1 from cron.job where jobname = 'meta-send-spike-scan');
select cron.unschedule('webhook-queue-stuck-scan')
 where exists (select 1 from cron.job where jobname = 'webhook-queue-stuck-scan');
select cron.unschedule('meta-send-retry-worker')
 where exists (select 1 from cron.job where jobname = 'meta-send-retry-worker');

drop function if exists public.invoke_meta_send_retry_worker();
drop function if exists public.meta_send_spike_scan();
drop function if exists public.webhook_queue_stuck_scan();
drop function if exists public.meta_send_failure_counts();
drop function if exists public.apply_archived_message_status(text, text, text, text);

-- volta ao estado anterior: alerta ligado para as duas familias de envio
update public.incident_component_catalog
   set somente_painel = false, updated_at = now()
 where component in ('envio:bloqueado-', 'envio:rejeitado-');

update public.incident_component_catalog
   set is_active = false, updated_at = now()
 where component in ('envio:defeito-', 'envio:conta-', 'envio:pico-diario', 'recebimento:fila-parada');

drop table if exists public.meta_send_retry;

drop index if exists public.idx_messages_error_code;
alter table public.messages
    drop column if exists error_code,
    drop column if exists error_title,
    drop column if exists retry_count;

-- track_token_usage volta a assinatura de 7 argumentos (sem billable explicito)
create or replace function public.track_token_usage(
    p_owner_id uuid,
    p_team_member_id uuid,
    p_function_name text,
    p_model text,
    p_prompt_tokens integer,
    p_completion_tokens integer,
    p_cost_usd numeric
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    v_total_tokens INT;
BEGIN
    v_total_tokens := p_prompt_tokens + p_completion_tokens;

    INSERT INTO token_usage_log (owner_id, team_member_id, function_name, model,
        prompt_tokens, completion_tokens, total_tokens, cost_usd)
    VALUES (p_owner_id, p_team_member_id, p_function_name, p_model,
        p_prompt_tokens, p_completion_tokens, v_total_tokens, p_cost_usd);

    UPDATE profiles
       SET tokens_total = COALESCE(tokens_total, 0) + v_total_tokens,
           tokens_monthly = COALESCE(tokens_monthly, 0) + v_total_tokens,
           approximate_cost_total = COALESCE(approximate_cost_total, 0) + p_cost_usd,
           approximate_cost_monthly = COALESCE(approximate_cost_monthly, 0) + p_cost_usd
     WHERE id = p_owner_id;

    IF p_team_member_id IS NOT NULL THEN
        UPDATE team_members
           SET tokens_total = COALESCE(tokens_total, 0) + v_total_tokens,
               approximate_cost_total = COALESCE(approximate_cost_total, 0) + p_cost_usd
         WHERE id = p_team_member_id;
    END IF;
END;
$function$;

drop function if exists public.track_token_usage(uuid, uuid, text, text, integer, integer, numeric, boolean);
