-- Falha de envio da Meta: reenvio do passageiro, silencio do bloqueio,
-- alerta so em defeito nosso / conta inteira / pico de volume.
-- Um unico SELECT (a CLI so imprime o resultado do ultimo statement).
-- `status` = ok | CONFERIR.

set lock_timeout = '5s';
set statement_timeout = '120s';

with
def as (
    select p.proname, pg_get_functiondef(p.oid) as src,
           pg_get_function_identity_arguments(p.oid) as args, p.pronargs
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('meta_send_failure_counts', 'meta_send_spike_scan',
                         'webhook_queue_stuck_scan', 'track_token_usage',
                         'apply_archived_message_status', 'invoke_meta_send_retry_worker')
),
r as (

-- 1. As tres colunas do recibo existem em messages
select 1 as ord, 'colunas de erro em messages' as item,
    coalesce(string_agg(column_name, ', ' order by column_name), 'nenhuma') as achado,
    case when count(*) = 3 then 'ok' else 'CONFERIR' end as status
from information_schema.columns
where table_schema = 'public' and table_name = 'messages'
  and column_name in ('error_code', 'error_title', 'retry_count')

union all
-- 2. A fila de reenvio existe, com RLS ligada e sem grant para o front
select 2, 'fila meta_send_retry',
    coalesce((select 'rls=' || c.relrowsecurity::text
                from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = 'meta_send_retry'), 'tabela ausente'),
    case
        when not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relname = 'meta_send_retry' and c.relrowsecurity)
            then 'CONFERIR'
        when exists (select 1 from information_schema.role_table_grants
                      where table_schema = 'public' and table_name = 'meta_send_retry'
                        and grantee in ('anon', 'authenticated'))
            then 'CONFERIR'
        else 'ok'
    end

union all
-- 3. Uma mensagem so pode estar UMA vez na fila: o indice unico por wamid e o
--    que impede reenvio duplicado quando dois recibos chegam juntos
select 3, 'indice unico por wamid',
    coalesce(string_agg(indexname, ', '), 'ausente'),
    case when count(*) = 1 then 'ok' else 'CONFERIR' end
from pg_indexes
where schemaname = 'public' and tablename = 'meta_send_retry'
  and indexdef ilike '%unique%' and indexdef ilike '%wamid%'

union all
-- 4. Quem acorda e quem nao. MUDOU EM 26/09/2026 (`20260926180000`):
--    `envio:conta-` saiu do telefone e foi para o painel. 131031/131042 e a
--    conta inteira da CLINICA barrada pela Meta — pagamento ou elegibilidade do
--    negocio dela. Nao ha o que fazer deste lado: quem resolve e ela, no
--    Business Manager. A gravidade continua CRITICA (check 5) porque no painel
--    ela tem que aparecer no topo, que e por onde o suporte a avisa. Continuam
--    fora do painel os dois que dependem de nos: `envio:defeito-` (131008/
--    131009/131021/131045, bug nosso) e `envio:pico-diario` (volume).
select 4, 'catalogo: quem acorda e quem nao',
    coalesce(string_agg(component || '=' || somente_painel::text, ', ' order by component), 'sem linhas'),
    case when count(*) = 5 and bool_and(
        case when component in ('envio:bloqueado-', 'envio:rejeitado-', 'envio:conta-')
             then somente_painel else not somente_painel end)
    then 'ok' else 'CONFERIR' end
from public.incident_component_catalog
where component in ('envio:bloqueado-', 'envio:rejeitado-', 'envio:defeito-',
                    'envio:conta-', 'envio:pico-diario')
  and is_active

union all
-- 5. Conta inteira e critica; defeito nosso e alta. O piso e PISO, nao teto:
--    a IA ainda pode subir, mas nunca descer abaixo disto.
select 5, 'piso de gravidade das familias novas',
    coalesce(string_agg(component || '=' || severidade_padrao, ', ' order by component), 'sem linhas'),
    case when (select severidade_padrao from public.incident_component_catalog
                where component = 'envio:conta-') = 'critica'
          and (select severidade_padrao from public.incident_component_catalog
                where component = 'envio:defeito-') = 'alta'
    then 'ok' else 'CONFERIR' end
from public.incident_component_catalog
where component in ('envio:defeito-', 'envio:conta-')

union all
-- 6. A contagem do dia le os DOIS lugares: ticket encerrado apaga de `messages`
--    e arquiva em `conversations.messages_history`. Ler so um subestima ~26x.
select 6, 'contagem varre messages E messages_history',
    coalesce(max(case when src ilike '%messages_history%' and src ilike '%from public.messages%'
                      then 'as duas fontes' else 'fonte faltando' end), 'funcao ausente'),
    case when bool_or(src ilike '%messages_history%' and src ilike '%from public.messages%')
         then 'ok' else 'CONFERIR' end
from def where proname = 'meta_send_failure_counts'

union all
-- 7. O detector de pico tem PISO: sem ele, 1 falha contra media 0 vira alerta
select 7, 'piso de 10 no detector de pico',
    coalesce(max(case when src ~ 'v_hoje\s*<\s*10' then 'piso presente' else 'sem piso' end), 'funcao ausente'),
    case when bool_or(src ~ 'v_hoje\s*<\s*10') then 'ok' else 'CONFERIR' end
from def where proname = 'meta_send_spike_scan'

union all
-- 8. Payload bruto parado: corte de 10 min e gravidade critica
select 8, 'fila de recebimento: corte de 10 min',
    coalesce(max(case when src ilike '%10 minutes%' then '10 min' else 'corte diferente' end), 'funcao ausente'),
    case when bool_or(src ilike '%10 minutes%' and src ilike '%critica%') then 'ok' else 'CONFERIR' end
from def where proname = 'webhook_queue_stuck_scan'

union all
-- 9. Os tres crons estao agendados
select 9, 'crons agendados',
    coalesce(string_agg(jobname || ' [' || schedule || ']', ', ' order by jobname), 'nenhum'),
    case when count(*) = 3 then 'ok' else 'CONFERIR' end
from cron.job
where jobname in ('meta-send-retry-worker', 'meta-send-spike-scan', 'webhook-queue-stuck-scan')

union all
-- 10. track_token_usage aceita billable explicito SEM perder o que a versao
--     viva ja fazia (profiles + team_members) — reemissao apaga em silencio
select 10, 'track_token_usage com billable',
    coalesce(max(args), 'funcao ausente'),
    case when bool_or(args ilike '%boolean%' and src ilike '%UPDATE team_members%'
                      and src ilike '%UPDATE profiles%' and src ilike '%billable%')
         then 'ok' else 'CONFERIR' end
from def where proname = 'track_token_usage'

union all
-- 11. O espelho no arquivo ganhou a sobrecarga de 4 argumentos e a de 2
--     continua VIVA (recibo sem erro ainda usa a antiga)
select 11, 'apply_archived_message_status: 2 e 4 argumentos',
    coalesce(string_agg(args, ' | ' order by pronargs), 'ausente'),
    case when count(*) = 2 then 'ok' else 'CONFERIR' end
from def where proname = 'apply_archived_message_status'

union all
-- 12. O invocador le SUPABASE_EDGE_SECRET_KEY do vault: o nome antigo guarda o
--     JWT legado e o 401 fica invisivel (o cron diz `succeeded` mesmo assim)
select 12, 'invocador usa a chave nova',
    coalesce(max(case when src ilike '%SUPABASE_EDGE_SECRET_KEY%' then 'chave nova' else 'chave legada' end), 'funcao ausente'),
    case when bool_or(src ilike '%SUPABASE_EDGE_SECRET_KEY%' and src ilike '%x-service-key%')
         then 'ok' else 'CONFERIR' end
from def where proname = 'invoke_meta_send_retry_worker'

)
select item, achado, status from r order by ord;
