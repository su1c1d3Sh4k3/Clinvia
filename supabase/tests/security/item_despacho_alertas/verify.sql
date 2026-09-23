-- Conferência de acesso das migrations 20260923170000 (despacho),
-- 20260923180000 (saldo da OpenAI) e 20260923190000 (chave do despachante).
--
-- Roda sozinho, não escreve nada. Espera-se `true` em toda a coluna `ok`.
--
-- Por que conferir privilégio em vez de ler a migration: `create function`
-- concede EXECUTE a PUBLIC, e `revoke ... from anon` NÃO remove esse grant.
-- A única prova é `has_function_privilege`.
--
-- `openai_saldo_estimado`, `admin_simulate_incident` e `admin_set_openai_credit`
-- ficam com EXECUTE para `authenticated` DE PROPÓSITO (o painel as chama com o
-- JWT do super admin) e se defendem NO CORPO, com `admin_can(...)`. Por isso a
-- linha delas espera `true` aqui — o teste de verdade dessas três é no
-- navegador, com sessão de tenant, esperando 42501.
--
-- É UM ÚNICO SELECT de propósito: o `supabase db query` só devolve o resultado
-- do ÚLTIMO comando do arquivo, então checagens separadas ficariam invisíveis.

with esperado(fn, papel, deve) as (
    values
      -- ninguém de fora executa nada do despacho
      ('public.incident_claim_for_notification(integer)',              'anon',          false),
      ('public.incident_claim_for_notification(integer)',              'authenticated', false),
      ('public.incident_notification_done(uuid,boolean,integer,text)', 'anon',          false),
      ('public.incident_notification_done(uuid,boolean,integer,text)', 'authenticated', false),
      ('public.incident_notify_pending_count()',                       'anon',          false),
      ('public.invoke_alert_dispatch()',                               'anon',          false),
      ('public.invoke_alert_dispatch()',                               'authenticated', false),
      -- painel: authenticated chega, e o corpo é que decide
      ('public.admin_simulate_incident(text)',                         'anon',          false),
      ('public.admin_simulate_incident(text)',                         'authenticated', true),
      ('public.admin_set_openai_credit(numeric,boolean)',              'anon',          false),
      ('public.admin_set_openai_credit(numeric,boolean)',              'authenticated', true),
      ('public.openai_saldo_estimado()',                               'anon',          false),
      ('public.openai_saldo_estimado()',                               'authenticated', true),
      ('public.openai_saldo_scan()',                                   'anon',          false),
      ('public.openai_saldo_scan()',                                   'authenticated', false)
),
privilegios as (
    select
        'EXECUTE ' || e.papel || ' -> ' || e.fn as item,
        has_function_privilege(e.papel, e.fn, 'EXECUTE') = e.deve as ok,
        jsonb_build_object('esperado', e.deve,
                           'real', has_function_privilege(e.papel, e.fn, 'EXECUTE')) as detalhe
    from esperado e
),
estrutura as (
    -- o que a página lê precisa existir
    select 'colunas de envio em incidents' as item,
           count(*) = 4 as ok,
           jsonb_build_object('achou', count(*), 'esperado', 4) as detalhe
    from information_schema.columns
    where table_schema = 'public' and table_name = 'incidents'
      and column_name in ('notify_claimed_at','notify_failed_count',
                          'notify_next_attempt_at','notify_last_error')

    union all
    select 'colunas de saldo em llm_platform_settings',
           count(*) = 7,
           jsonb_build_object('achou', count(*), 'esperado', 7)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'llm_platform_settings'
      and column_name in ('openai_credit_usd','openai_credit_recorded_at',
                          'openai_auto_recharge_enabled','openai_credit_stale_days',
                          'openai_balance_warn_usd','openai_balance_critical_usd',
                          'openai_balance_alert_enabled')

    union all
    -- sem esta ponte os 3 alertas da conta OpenAI ficam mudos por construção
    select 'ponte openai_alerts -> incidents',
           exists (select 1 from pg_trigger
                    where tgname = 'zz_openai_alert_to_incident' and not tgisinternal),
           '{}'::jsonb

    union all
    select 'crons de alerta (alert-dispatch + openai-saldo-scan) ativos',
           count(*) filter (where active) = 2,
           coalesce(jsonb_object_agg(jobname,
               jsonb_build_object('sched', schedule, 'ativo', active)), '{}'::jsonb)
    from cron.job
    where jobname in ('alert-dispatch', 'openai-saldo-scan')

    union all
    -- o 429 sem crédito é o sinal principal: tem que entrar como crítico
    select '429 sem crédito no catálogo, como crítica',
           count(*) = 3,
           jsonb_build_object('achou', count(*), 'esperado', 3)
    from public.incident_catalog
    where pattern in ('no credits remaining','insufficient_quota','billing_hard_limit_reached')
      and severidade_sugerida = 'critica' and is_active
),
comportamento as (
    -- sem auth.uid() o saldo responde: é o caminho interno das security definer
    select 'saldo responde no caminho interno' as item,
           (public.openai_saldo_estimado() ? 'tem_ancora') as ok,
           '{}'::jsonb as detalhe
)
select * from privilegios
union all select * from estrutura
union all select * from comportamento
order by ok, item;
