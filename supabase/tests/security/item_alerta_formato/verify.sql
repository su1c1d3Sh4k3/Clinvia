-- Teste de acesso e de contrato do formato de alerta de 4 blocos
-- (20260923320000 espera-analise + 20260923330000 captura rica).
--
-- Uma unica instrucao de proposito: o `supabase db query` devolve so o ultimo
-- result set, entao teste em varios selects perde os primeiros em silencio.
--
-- Rodar:  npx supabase db query --linked --file supabase/tests/security/item_alerta_formato/verify.sql
-- Esperado: todas as linhas com ok = true.

with checagens as (

    -- ── A. privilegio: nada disso e chamavel pelo front ──────────────────────
    select 'A1 cron_health_scan negado a anon' as item,
           has_function_privilege('anon', 'public.cron_health_scan(integer)', 'EXECUTE') = false as ok
    union all
    select 'A2 cron_health_scan negado a authenticated',
           has_function_privilege('authenticated', 'public.cron_health_scan(integer)', 'EXECUTE') = false
    union all
    select 'A3 cron_health_scan liberado a service_role',
           has_function_privilege('service_role', 'public.cron_health_scan(integer)', 'EXECUTE') = true
    union all
    select 'A4 incident_component_info negado a anon',
           has_function_privilege('anon', 'public.incident_component_info(text)', 'EXECUTE') = false
    union all
    select 'A5 catalogo de componentes ilegivel por authenticated',
           has_table_privilege('authenticated', 'public.incident_component_catalog', 'SELECT') = false
    union all
    select 'A6 incident_events ilegivel por anon',
           has_table_privilege('anon', 'public.incident_events', 'SELECT') = false

    -- ── B. captura rica: o evento do cron carrega o que o alerta precisa ─────
    union all
    select 'B1 captura grava o comando do job',
           (select p.prosrc like '%j.command%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'cron_health_scan')
    union all
    select 'B2 captura grava a duracao da tentativa',
           (select p.prosrc like '%duracao_ms%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'cron_health_scan')
    union all
    select 'B3 captura grava o placar de 2h do job',
           (select p.prosrc like '%falhas_2h%' and p.prosrc like '%ok_2h%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'cron_health_scan')
    union all
    -- o `route` antigo era so o status, e por isso dois defeitos diferentes do
    -- mesmo job caiam no mesmo incidente
    select 'B4 route do cron nao e mais so o status',
           (select p.prosrc not like '%''route'', v_reg.status,%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'cron_health_scan')

    -- ── C. catalogo: "o que esse servico faz" nunca vem da IA ────────────────
    union all
    select 'C1 detector exato vence prefixo',
           (select natureza = 'detector' from public.incident_component_info('openai:daily_anomaly'))
    union all
    select 'C2 prefixo cobre cron novo',
           (select catalogado from public.incident_component_info('cron:um-job-que-nao-existe'))
    union all
    select 'C3 componente desconhecido nao inventa descricao',
           not exists (select 1 from public.incident_component_info('zzz:inexistente'))
    union all
    select 'C4 todo componente catalogado tem descricao nao vazia',
           not exists (select 1 from public.incident_component_catalog
                        where is_active and coalesce(trim(descricao), '') = '')

    -- ── D. espera da analise: as duas funcoes com a MESMA condicao ───────────
    -- divergirem da ou alerta que nunca sai, ou function acordada a toa para sempre
    union all
    select 'D1 claim espera a analise por 2 minutos',
           (select p.prosrc like '%interval ''2 minutes''%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'incident_claim_for_notification')
    union all
    select 'D2 portao usa a mesma espera do claim',
           (select p.prosrc like '%interval ''2 minutes''%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'incident_notify_pending_count')
    union all
    select 'D3 claim usa created_at, nao first_seen, como relogio da espera',
           (select p.prosrc like '%i.created_at < now() - interval ''2 minutes''%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'incident_claim_for_notification')
    union all
    -- O claim NAO e chamado aqui de proposito: ele reserva por 5 minutos e
    -- atrasaria alerta de verdade. A condicao e verificada no texto da funcao.
    select 'D4 media/baixa sem analise continuam fora da fila',
           (select p.prosrc like '%i.ai_severity in (''critica'', ''alta'')%'
                   and p.prosrc like '%i.analyzed_at is not null%'
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'incident_claim_for_notification')

    -- ── E. o analisador nao abre incidente sobre si mesmo ────────────────────
    union all
    select 'E1 invoker do analisador usa timeout de 60s',
           (select p.prosrc like '%p_timeout := 60000%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'invoke_incident_analyze')
    union all
    select 'E2 cron do analisador ativo de 2 em 2 minutos',
           exists (select 1 from cron.job
                    where jobname = 'incident-analyze-scan' and schedule = '*/2 * * * *' and active)
)
select item, ok from checagens order by ok, item;
