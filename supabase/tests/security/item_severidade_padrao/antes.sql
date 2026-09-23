-- Retrato do buraco ANTES de 20260923360000.
--
-- O que se quer medir: com `ai_severity` nula (analisador fora do ar), para onde
-- vai um incidente de componente critico. Resposta esperada: para o resumo de 2
-- horas, junto com media e baixa — inclusive `alert-notify` e `openai:sem_credito`.
--
-- NAO cria incidente de teste: a simulacao e feita sobre a CONDICAO, em cima das
-- linhas que ja existem, mais uma projecao dos componentes criticos conhecidos.
--
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_severidade_padrao/antes.sql

select jsonb_build_object(

    'catalogo_tem_severidade_padrao',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public'
                   and table_name = 'incident_component_catalog'
                   and column_name = 'severidade_padrao'),

    'funcao_de_gravidade_efetiva_existe',
        exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'incident_severidade_efetiva'),

    -- o buraco em numero: abertos sem analise da IA
    'abertos_com_severidade_nula',
        (select count(*) from public.incidents
          where ai_severity is null and status <> 'resolved'),

    -- ... e onde eles cairiam hoje
    'nulos_que_cairiam_no_resumo',
        (select coalesce(jsonb_agg(jsonb_build_object(
                    'componente', component, 'eventos', event_count)), '[]'::jsonb)
           from public.incident_summary_pending(24) s
          where exists (select 1 from public.incidents i
                         where i.id = s.id and i.ai_severity is null)),

    -- projecao: se cada componente critico do pedido recebesse um incidente AGORA,
    -- com o analisador fora do ar, ele sairia na hora ou em 2 horas?
    'destino_hoje_dos_componentes_criticos',
        (select jsonb_object_agg(c, 'resumo de 2h (deveria ser imediato)')
           from unnest(array['alert-notify', 'openai:sem_credito',
                             'automation-send-queue', 'api-public-booking']) c),

    'familias_do_catalogo_hoje',
        (select count(*) from public.incident_component_catalog where is_active),

    -- as linhas que o item 3 vai acrescentar ainda nao existem
    'familias_novas_ja_presentes',
        (select coalesce(jsonb_agg(component order by component), '[]'::jsonb)
           from public.incident_component_catalog
          where component in ('canal:whatsapp-alertas', 'uzapi-', 'evolution-send-message',
                              'uazapi:instancia-desconectada', 'meta-send-message',
                              'instagram-refresh-token', 'google-calendar-', 'gemini:',
                              'n8n:no-silencioso', 'cron-health-watch'))

) as antes;
