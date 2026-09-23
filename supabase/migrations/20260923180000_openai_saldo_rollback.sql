-- Rollback de 20260923180000_openai_saldo.sql
--
-- DESLIGAR SEM REVERTER (quase sempre o certo):
--   update public.llm_platform_settings set openai_balance_alert_enabled = false;
-- Para o alerta de saldo e mantem o campo, o historico e o painel. O sinal do
-- 429 ("no credits remaining") continua valendo, porque ele vem do catalogo e
-- nao desta chave — de proposito: sem credito a IA parou, e isso se avisa sempre.
--
-- Para tirar so o 429 do catalogo, sem reverter nada:
--   update public.incident_catalog set is_active = false
--    where pattern in ('no credits remaining','insufficient_quota','billing_hard_limit_reached');

select cron.unschedule('openai-saldo-scan')
 where exists (select 1 from cron.job where jobname = 'openai-saldo-scan');

drop function if exists public.openai_saldo_scan();
drop function if exists public.admin_set_openai_credit(numeric, boolean);

delete from public.incident_catalog
 where pattern in ('no credits remaining', 'insufficient_quota', 'billing_hard_limit_reached');

-- admin_alert_settings volta a nao ler saldo (senao quebra ao perder a funcao)
create or replace function public.admin_alert_settings()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
    v_cfg  jsonb;
    v_dest jsonb;
begin
    if not public.admin_can('alertas', 'view') then
        raise exception 'Acesso negado ao painel de alertas' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'alert_notify_enabled',  s.alert_notify_enabled,
        'alert_summary_enabled', s.alert_summary_enabled,
        'alert_max_per_hour',    s.alert_max_per_hour,
        'alert_analyze_enabled', s.alert_analyze_enabled,
        'alert_analyze_model',   s.alert_analyze_model,
        'incident_db_scan_enabled',      s.incident_db_scan_enabled,
        'incident_analyze_cooldown_min', s.incident_analyze_cooldown_min,
        'incident_notify_cooldown_min',  s.incident_notify_cooldown_min
    )
    into v_cfg from public.llm_platform_settings s limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'nome', r.nome,
        'telefone', '****' || right(r.telefone, 4),
        'min_severity', r.min_severity, 'is_active', r.is_active,
        'janela', to_char(r.window_start, 'HH24:MI') || '–' || to_char(r.window_end, 'HH24:MI'),
        'instancia', i.instance_name,
        'ultimo_envio', (select max(n.sent_at) from public.incident_notifications n
                          where n.recipient_id = r.id and n.status = 'sent')
    ) order by r.nome), '[]'::jsonb)
    into v_dest
    from public.alert_recipients r
    left join public.instances i on i.id = r.instance_id;

    return jsonb_build_object('config', coalesce(v_cfg, '{}'::jsonb), 'destinatarios', v_dest);
end;
$$;

revoke all on function public.admin_alert_settings() from public, anon;
grant execute on function public.admin_alert_settings() to authenticated;

drop function if exists public.openai_saldo_estimado();

-- As colunas ficam POR ULTIMO e sao as unicas que carregam dado do user
-- (o saldo que ele digitou). Se a intencao for so desfazer o codigo, pare aqui.
alter table public.llm_platform_settings
    drop column if exists openai_credit_usd,
    drop column if exists openai_credit_recorded_at,
    drop column if exists openai_auto_recharge_enabled,
    drop column if exists openai_credit_stale_days,
    drop column if exists openai_balance_warn_usd,
    drop column if exists openai_balance_critical_usd,
    drop column if exists openai_balance_alert_enabled;

-- admin_set_alert_setting ficou com as chaves novas apontando para colunas que
-- acabaram de sumir: reaplique a versao de 20260923160000 secao 8.
