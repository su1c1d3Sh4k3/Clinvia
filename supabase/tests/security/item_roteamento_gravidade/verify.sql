-- Teste do roteamento por gravidade (20260923350000).
--
-- Uma unica instrucao de proposito: o `supabase db query` devolve so o ultimo
-- result set, entao teste em varios selects perde os primeiros em silencio.
--
-- NAO chama incident_claim_for_notification em lugar nenhum: ela RESERVA o
-- incidente por 5 minutos e o teste atrasaria alerta de verdade. As condicoes
-- dela sao conferidas no texto da funcao (pg_proc.prosrc).
--
-- Rodar:  npx supabase db query --linked --file supabase/tests/security/item_roteamento_gravidade/verify.sql
-- Esperado: todas as linhas com ok = true.

with
src as (
    select p.proname, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('incident_claim_for_notification', 'incident_notify_pending_count',
                         'incident_summary_pending', 'invoke_alert_summary')
),
checagens as (

    -- ── A. privilegio ────────────────────────────────────────────────────────
    select 'A1 resumo negado a anon' as item,
           has_function_privilege('anon', 'public.incident_summary_pending(integer)', 'EXECUTE') = false as ok
    union all
    select 'A2 resumo negado a authenticated',
           has_function_privilege('authenticated', 'public.incident_summary_pending(integer)', 'EXECUTE') = false
    union all
    select 'A3 resumo liberado a service_role',
           has_function_privilege('service_role', 'public.incident_summary_pending(integer)', 'EXECUTE') = true
    union all
    select 'A4 invocador do resumo negado a anon',
           has_function_privilege('anon', 'public.invoke_alert_summary()', 'EXECUTE') = false
    union all
    select 'A5 invocador do resumo negado a authenticated',
           has_function_privilege('authenticated', 'public.invoke_alert_summary()', 'EXECUTE') = false
    union all
    select 'A6 resolvedor de catalogo segue negado a anon',
           has_function_privilege('anon', 'public.incident_component_info(text)', 'EXECUTE') = false

    -- ── B. o defeito: media/baixa saiam na hora ──────────────────────────────
    union all
    select 'B1 claim exige critica ou alta',
           (select prosrc like '%and i.ai_severity in (''critica'', ''alta'')%' from src
             where proname = 'incident_claim_for_notification')
    union all
    -- a condicao velha era uma DISJUNCAO: "analisado OU (critica/alta e 2 min)".
    -- Era o "ou" que deixava qualquer media analisada passar.
    select 'B2 disjuncao antiga sumiu do claim',
           (select prosrc not like '%or (i.ai_severity in (''critica'', ''alta'')%' from src
             where proname = 'incident_claim_for_notification')
    union all
    select 'B3 portao exige critica ou alta',
           (select prosrc like '%and i.ai_severity in (''critica'', ''alta'')%' from src
             where proname = 'incident_notify_pending_count')
    union all
    select 'B4 disjuncao antiga sumiu do portao',
           (select prosrc not like '%or (i.ai_severity in (''critica'', ''alta'')%' from src
             where proname = 'incident_notify_pending_count')
    union all
    -- portao e claim divergirem produz alerta que nunca sai (portao mudo) ou
    -- function acordada de minuto em minuto para nada (portao barulhento)
    select 'B5 claim e portao filtram por somente_painel os dois',
           (select bool_and(prosrc like '%somente_painel%') from src
             where proname in ('incident_claim_for_notification', 'incident_notify_pending_count'))

    -- ── C. o caminho agrupado, que nao existia ───────────────────────────────
    union all
    select 'C1 cron alert-summary agendado e ativo',
           exists (select 1 from cron.job
                    where jobname = 'alert-summary' and active and schedule = '0 */2 * * *')
    union all
    select 'C2 invocador do resumo tem portao de fila vazia',
           (select prosrc like '%incident_summary_pending(2)%' and prosrc like '%return;%' from src
             where proname = 'invoke_alert_summary')
    union all
    select 'C3 invocador do resumo le a chave nova do vault',
           (select prosrc like '%SUPABASE_EDGE_SECRET_KEY%' and prosrc like '%x-service-key%' from src
             where proname = 'invoke_alert_summary')
    union all
    select 'C4 invocador do resumo dispara rastreado',
           (select prosrc like '%clinvia_http_post%' and prosrc like '%cron:alert-summary%' from src
             where proname = 'invoke_alert_summary')
    union all
    select 'C5 severidade nula tem caminho (cai no resumo)',
           (select prosrc like '%i.ai_severity is null%' from src
             where proname = 'incident_summary_pending')

    -- ── D. os dois caminhos nao se cruzam nem deixam buraco ──────────────────
    union all
    -- se um critica aparecesse no resumo, ele seria avisado duas vezes
    select 'D1 nenhum critica/alta entra no resumo',
           not exists (select 1 from public.incident_summary_pending(24) s
                        join public.incidents i on i.id = s.id
                       where i.ai_severity in ('critica', 'alta'))
    union all
    select 'D2 nenhum resolvido entra no resumo',
           not exists (select 1 from public.incident_summary_pending(24) s
                        join public.incidents i on i.id = s.id
                       where i.status = 'resolved')

    -- ── E. manutencao interna nao vira mensagem ──────────────────────────────
    union all
    select 'E1 componente-nao-catalogado marcado somente_painel',
           (select somente_painel from public.incident_component_info('monitoramento:componente-nao-catalogado'))
    union all
    select 'E2 ele nao entra no resumo',
           not exists (select 1 from public.incident_summary_pending(24)
                        where component = 'monitoramento:componente-nao-catalogado')
    union all
    -- a marca e excecao, nao regra: se ela vazar para um componente de operacao,
    -- o alerta dele fica mudo para sempre e ninguem percebe
    select 'E3 so um componente do catalogo e somente_painel',
           (select count(*) = 1 from public.incident_component_catalog
             where is_active and somente_painel)
    union all
    select 'E4 analise-indisponivel continua indo ao WhatsApp',
           (select somente_painel = false from public.incident_component_info('monitoramento:analise-indisponivel'))
    union all
    -- defeito 4: recado de desenvolvedor fora da mensagem de operacao
    select 'E5 catalogo sem instrucao de cadastro na descricao',
           not exists (select 1 from public.incident_component_catalog
                        where is_active and descricao ilike '%cadastre%')

    -- ── F. o catalogo nao regrediu com o drop/create do resolvedor ───────────
    union all
    select 'F1 resolvedor ainda resolve exato e prefixo',
           (select i1.natureza = 'detector' and i2.natureza = 'detector'
              from public.incident_component_info('openai:sync_failure') i1,
                   public.incident_component_info('openai:um_kind_que_nao_existe') i2)
    union all
    select 'F2 componente fora do catalogo segue devolvendo zero linhas',
           not exists (select 1 from public.incident_component_info('componente-que-nao-existe'))
)
select item, ok from checagens order by ok, item;
