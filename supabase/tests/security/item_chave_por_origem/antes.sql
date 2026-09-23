-- Estado ANTES das chaves por origem (item 2 / item 5).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_chave_por_origem/antes.sql
--
-- A meta dele e numerica: `origem_inferida` abaixo de 10%, e chamada do n8n
-- nunca mais aparecendo como `edge_interna`. Sem esta linha de base a meta nao
-- e verificavel depois — e a serie de incidentes tem menos de 2 dias, entao a
-- comparacao so vale se as duas medidas usarem a MESMA consulta.

select jsonb_pretty(jsonb_build_object(
    'eventos_total', (select count(*) from public.incident_events),
    'inferidos',     (select count(*) from public.incident_events where origem_inferida),
    'pct_inferido',  (select round(100.0 * count(*) filter (where origem_inferida) / nullif(count(*), 0), 1)
                        from public.incident_events),
    'janela', jsonb_build_object(
        'primeiro', (select min(received_at) from public.incident_events),
        'ultimo',   (select max(received_at) from public.incident_events)),
    'por_origem', (
        select coalesce(jsonb_object_agg(x.origem, x.j), '{}'::jsonb) from (
            select coalesce(origem, 'nulo') as origem,
                   jsonb_build_object('total', count(*),
                                      'inferidos', count(*) filter (where origem_inferida)) as j
              from public.incident_events group by 1) x),
    'incidentes_por_origem', (
        select coalesce(jsonb_object_agg(coalesce(origem, 'nulo'), n), '{}'::jsonb)
          from (select origem, count(*) as n from public.incidents group by 1) y),
    -- Componentes que so o n8n chama: e neles que `edge_interna` seria erro.
    'origem_por_componente_api', (
        select coalesce(jsonb_object_agg(component, j), '{}'::jsonb) from (
            select component, jsonb_object_agg(coalesce(origem, 'nulo'), n) as j from (
                select component, origem, count(*) as n
                  from public.incident_events
                 where component like 'api-%'
                 group by 1, 2) z group by component) w)
)) as relatorio;
