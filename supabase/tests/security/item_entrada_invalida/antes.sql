-- Estado ANTES de 20260923540000 (erro de entrada: contar sem alertar).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_entrada_invalida/antes.sql
--
-- Duas coisas aqui, e a segunda e a que importa.
--
-- 1. Nada existe: sem coluna, sem catalogo, sem funcao, sem cron, zero evento na
--    familia `entrada:`. O `depois` compara contra isto.
--
-- 2. REPLAY dos dois detectores contra o trafego REAL do bug do `appointment_id`
--    — os eventos que o 22P02 gerou entre 16/09 e 23/09/2026, que hoje moram
--    como falha do componente `api-scheduling` porque `dbErrorResponse` os
--    tratava como defeito nosso. E o unico jeito honesto de saber se a regra
--    proposta acharia o caso que motivou a regra. Expectativa medida:
--    a regra por HORA nao acha nada, a regra por DIAS acha.

with historico as (
    -- Os eventos que, com o codigo novo, teriam nascido como `entrada:api-scheduling`.
    select e.id,
           coalesce(e.failed_node, 'rota_nao_informada') as rota,
           e.received_at
      from public.incident_events e
     where e.received_at >= now() - interval '30 days'
       and (e.error_message ilike '%22P02%'
         or e.error_message ilike '%invalid input syntax%')
),
por_hora as (
    select rota, date_trunc('hour', received_at) as hora, count(*) as n
      from historico group by 1, 2
),
por_dia as (
    select rota,
           count(*) as n,
           count(distinct (received_at at time zone 'America/Sao_Paulo')::date) as dias
      from historico
     where received_at >= now() - interval '7 days'
     group by 1
)

select jsonb_pretty(jsonb_build_object(

    'nada_existe_ainda', jsonb_build_object(
        'coluna_alert_input_rate_enabled', exists (
            select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'llm_platform_settings'
               and column_name = 'alert_input_rate_enabled'),
        'linhas_de_catalogo', (
            select count(*) from public.incident_component_catalog
             where component in ('entrada:', 'entrada-invalida:surto', 'entrada-invalida:persistente')),
        'funcao_existe', exists (
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'entrada_invalida_scan'),
        'cron_existe', exists (select 1 from cron.job where jobname = 'entrada-invalida-scan'),
        'eventos_familia_entrada', (
            select count(*) from public.incident_events where component like 'entrada:%')),

    -- Hoje o erro de entrada entra como falha NOSSA: 500 + incidente do componente.
    -- (`incidents` nao guarda a mensagem; ela mora no evento.)
    'hoje_entra_como_defeito_nosso', (
        select coalesce(jsonb_agg(jsonb_build_object(
                'component', i.component,
                'sev_efetiva', public.incident_severidade_efetiva(i.component, i.ai_severity),
                'eventos', i.event_count,
                'status', i.status) order by i.first_seen desc), '[]'::jsonb)
          from public.incidents i
         where exists (
            select 1 from public.incident_events e
             where e.incident_id = i.id
               and (e.error_message ilike '%22P02%'
                 or e.error_message ilike '%invalid input syntax%'))),

    'replay_dos_detectores', jsonb_build_object(
        'eventos_de_entrada_em_30d', (select count(*) from historico),
        'primeiro',                  (select min(received_at) from historico),
        'ultimo',                    (select max(received_at) from historico),

        -- Regra A, a que o pedido original descrevia.
        'regra_A_surto_pico_por_hora',   (select coalesce(max(n), 0) from por_hora),
        'regra_A_dispararia_com_10',     (select coalesce(max(n), 0) >= 10 from por_hora),

        -- Regra B, a lenta.
        'regra_B_por_alvo_em_7d', (
            select coalesce(jsonb_agg(jsonb_build_object(
                    'rota', rota, 'ocorrencias', n, 'dias_distintos', dias)), '[]'::jsonb)
              from por_dia),
        'regra_B_dispararia', (
            select exists (select 1 from por_dia where n >= 2 and dias >= 2)))

)) as relatorio;
