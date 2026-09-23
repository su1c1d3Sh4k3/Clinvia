-- Estado ANTES de 20260923440000 (placar do bloco A / cron-http).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_cron_http_placar/antes.sql
--
-- O defeito a provar: uma falha isolada de chamada HTTP de job sobe para o
-- telefone sem ninguem olhar o placar do alvo. Duas causas somadas — a
-- severidade do bloco A sai so do codigo HTTP, e o piso do catalogo para o
-- prefixo `cron-http:` e 'alta', entao mesmo um 'baixa' viraria 'alta'.

with src as (
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cron_health_scan'
)
select jsonb_pretty(jsonb_build_object(
    'piso_do_catalogo_cron_http', (
        select jsonb_build_object('severidade_padrao', severidade_padrao,
                                  'somente_painel', somente_painel)
          from public.incident_component_catalog
         where component = 'cron-http:' and match_tipo = 'prefixo'),

    -- com o piso em alta, ate a leitura mais branda toca o telefone
    'efetiva_com_leitura_baixa',
        public.incident_severidade_efetiva('cron-http:delivery-automation-worker', 'baixa'),
    'efetiva_com_leitura_media',
        public.incident_severidade_efetiva('cron-http:delivery-automation-worker', 'media'),

    'bloco_A_tem_placar', (select prosrc from src) ilike '%v_http_sev%',
    'severidade_fixa_pelo_codigo', (select prosrc from src) ilike '%when v_reg.status_code >= 500        then ''alta''%',

    'cron_http_calls_guarda_desfecho', exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'cron_http_calls'
           and column_name = 'status_code'),

    'retencao_da_tabela', case when (select prosrc from src)
        ilike '%cron_http_calls where created_at < now() - interval ''2 hours''%'
        then '2 hours' else 'outra' end,

    -- o caso medido: 1 unico 502 virou alta com o alvo respondendo ok o tempo todo
    'incidentes_cron_http_7d', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'component', component, 'eventos', event_count,
                 'severidade', ai_severity,
                 'efetiva', public.incident_severidade_efetiva(component, ai_severity),
                 'primeiro', first_seen, 'status', status) order by first_seen desc), '[]'::jsonb)
          from public.incidents
         where component like 'cron-http:%' and first_seen > now() - interval '7 days'),

    'foram_ao_telefone_7d', (
        select count(*) from public.incidents
         where component like 'cron-http:%' and first_seen > now() - interval '7 days'
           and public.incident_severidade_efetiva(component, ai_severity) in ('critica','alta'))
));
