-- Passo 4 do teste inverso: roda o varredor e le o veredito.
-- Rodar ~20s depois de teste_inverso_3_voltar.sql.

select public.cron_health_scan(300) as varredura;

select jsonb_pretty(jsonb_build_object(
    'placar_gravado', (
        select coalesce(jsonb_object_agg(alvo, j), '{}'::jsonb) from (
            select alvo, jsonb_build_object(
                     'chamadas', count(*),
                     'ok', count(*) filter (where status_code between 200 and 399),
                     'falhas', count(*) filter (where status_code >= 400 or status_code = -1),
                     'codigos', jsonb_agg(distinct status_code)) as j
              from public.cron_http_calls
             where alvo like 'zz-teste-%'
             group by alvo) s),

    'incidentes', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'component', i.component,
                 'eventos', i.event_count,
                 'severidade_lida', i.ai_severity,
                 'severidade_efetiva', public.incident_severidade_efetiva(i.component, i.ai_severity),
                 'vai_ao_telefone',
                     public.incident_severidade_efetiva(i.component, i.ai_severity) in ('critica','alta')
                     and not coalesce((select somente_painel from public.incident_component_info(i.component)), false),
                 'descricao', (select e.error_description from public.incident_events e
                                where e.incident_id = i.id order by e.received_at desc limit 1)
               ) order by i.component), '[]'::jsonb)
          from public.incidents i
         where i.component like 'cron-http:zz-teste%'),

    'esperado', jsonb_build_object(
        'cron-http:zz-teste-tropeco', 'media  (1 falha depois de 4 ok, e a queda e a ultima noticia)',
        'cron-http:zz-teste-pane',    'alta   (3 falhas, 0 ok em 24h) — e ainda assim somente_painel',
        'cron-http:zz-teste-volta',   'baixa  (1 falha e o alvo ja voltou a responder ok)',
        'vai_ao_telefone',            'false nos tres')
));
