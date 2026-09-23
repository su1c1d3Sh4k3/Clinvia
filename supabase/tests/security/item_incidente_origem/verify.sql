-- Estado DEPOIS de 20260923450000 (origem do incidente).
-- Rodar: npx supabase db query --linked --file supabase/tests/security/item_incidente_origem/verify.sql
--
-- Cada linha de `itens` e uma afirmacao: `ok` false em qualquer uma reprova.
-- `distribuicao_7d` nao e afirmacao, e a medida que o plano pediu.

with rec as (
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'incident_record'
),
http as (
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'clinvia_http_post'
),
inf as (
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'incident_origem_inferir'
),
checagens(item, ok, observado) as (
    values
    ('incident_events guarda origem + se foi inferida',
     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='incident_events'
                and column_name in ('origem','origem_inferida')
              having count(*) = 2),
     'colunas origem + origem_inferida'),

    ('incidents guarda origem + se foi inferida',
     exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='incidents'
                and column_name in ('origem','origem_inferida')
              having count(*) = 2),
     'colunas origem + origem_inferida'),

    ('o conjunto de valores e fechado no evento',
     exists (select 1 from pg_constraint
              where conname = 'incident_events_origem_chk'),
     'incident_events_origem_chk'),

    ('o conjunto de valores e fechado no incidente (+ multiplas)',
     (select pg_get_constraintdef(oid) ilike '%multiplas%'
        from pg_constraint where conname = 'incidents_origem_chk'),
     'incidents_origem_chk'),

    -- O ponto do plano: palpite nao pode passar por declaracao.
    ('valor desconhecido vira nao_identificada em vez de derrubar a ingestao',
     (select prosrc from rec) ilike '%v_origem := ''nao_identificada'';%',
     'coercao no incident_record'),

    ('nao_identificada e sempre marcada como inferida',
     (select prosrc from rec) ~ 'if v_origem = ''nao_identificada'' then\s+v_origem_inf := true;',
     'origem_inferida forcada'),

    -- Recorta SO a chamada do fingerprint: procurar `origem` no prosrc inteiro
    -- dava falso negativo, porque a palavra aparece 20 linhas abaixo por motivo
    -- legitimo. A afirmacao e sobre os ARGUMENTOS, nao sobre o corpo da funcao.
    ('a origem NAO entra no fingerprint',
     (select substring(prosrc from 'v_fingerprint := public.incident_fingerprint\(([^;]*)\)')
        from rec) not ilike '%origem%',
     'agrupamento nao se parte por origem'),

    ('eventos de origens diferentes no mesmo incidente viram multiplas',
     (select prosrc from rec) ilike '%''multiplas''%',
     'on conflict do update'),

    ('declarada vence inferida no incidente',
     (select prosrc from rec) ilike '%origem_inferida = %incidents.origem_inferida and%',
     'AND das inferencias'),

    ('toda tarefa agendada declara origem numa linha so',
     (select prosrc from http) ilike '%jsonb_build_object(''x-origin'', ''cron'')%',
     'clinvia_http_post'),

    ('x-origin do chamador nao e sobrescrito',
     (select prosrc from http) ilike '%|| coalesce(p_headers%',
     'merge com o header do chamador a direita'),

    ('rotulo humano existe e marca o palpite',
     public.incident_origem_rotulo('ia_n8n', true) ilike '%(inferida)%'
     and public.incident_origem_rotulo('ia_n8n', false) not ilike '%inferida%',
     'incident_origem_rotulo(ia_n8n, true) = '
       || public.incident_origem_rotulo('ia_n8n', true)),

    ('rotulo de valor nulo nao inventa "(inferida)" em cima de "Nao identificada"',
     public.incident_origem_rotulo(null, true) = 'Nao identificada',
     'incident_origem_rotulo(null, true)'),

    ('indice da distribuicao por origem existe',
     exists (select 1 from pg_indexes where schemaname='public'
              and indexname='idx_incident_events_origem_recebido'),
     'idx_incident_events_origem_recebido'),

    ('ingestao NAO e chamavel por anon',
     not has_function_privilege('anon','public.incident_record(jsonb)','EXECUTE'),
     'has_function_privilege(anon, incident_record)'),

    ('ingestao NAO e chamavel por authenticated',
     not has_function_privilege('authenticated','public.incident_record(jsonb)','EXECUTE'),
     'has_function_privilege(authenticated, incident_record)'),

    ('rotulo NAO e chamavel por anon',
     not has_function_privilege('anon','public.incident_origem_rotulo(text, boolean)','EXECUTE'),
     'has_function_privilege(anon, incident_origem_rotulo)'),

    ('clinvia_http_post NAO e chamavel por anon',
     not has_function_privilege('anon',
         'public.clinvia_http_post(text, text, text, jsonb, jsonb, integer)','EXECUTE'),
     'has_function_privilege(anon, clinvia_http_post)'),

    ('as tres seguem security definer com search_path fixo',
     (select count(*) = 3 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and p.proname in ('incident_record','clinvia_http_post','incident_origem_rotulo')
         and 'search_path=public' = any(coalesce(p.proconfig, array[]::text[]))),
     'prosecdef/proconfig'),

    ('a regra do 42501 sobreviveu a estas migrations',
     (select prosrc from rec) ilike '%42501%',
     '20260923100000 nao foi desfeito'),

    -- Quase perdi as duas linhas abaixo redigitando incident_record de memoria.
    -- Elas ficam aqui para que a proxima reescrita reprove em vez de calar.
    ('a idempotencia por request_id sobreviveu',
     (select prosrc from rec) ilike '%request_id_ja_registrado%',
     'mesma linha de origem nao vira dois eventos'),

    ('o localizador de tabela do 42501 sobreviveu',
     (select prosrc from rec) ilike '%rls:%' and (select prosrc from rec) ilike '%for table%',
     'um incidente por tabela, nao por linha'),

    -- Inferencia (20260923460000)
    ('quem nao declarou tem a origem inferida em vez de virar nao_identificada',
     (select prosrc from rec) ilike '%public.incident_origem_inferir(v_source, v_component)%',
     'chamada da inferencia no incident_record'),

    ('a inferencia ancora no source, nao so no prefixo do componente',
     (select prosrc from inf) ilike '%p_source in (''db_job'', ''provisioning'', ''sync'')%',
     'incident_origem_inferir'),

    ('worker de resumo (db_job) agora sai como cron, nao como nao_identificada',
     public.incident_origem_inferir('db_job', 'conversation-summary-worker') = 'cron',
     'os 182 eventos que sozinhos faziam 82% do buraco'),

    ('webhook de terceiro nao e confundido com function nossa',
     public.incident_origem_inferir('edge_function', 'webhook-handle-message') = 'webhook_externo'
     and public.incident_origem_inferir('edge_function', 'api-scheduling') = 'edge_interna',
     'prefixo refina o source'),

    ('todo palpite viaja marcado como palpite',
     (select count(*) = 0 from public.incident_events
       where origem is not null and not origem_inferida),
     'nenhum evento historico se passa por declarado'),

    ('o historico nao ficou com a coluna vazia',
     (select count(*) = 0 from public.incident_events where origem is null),
     'backfill do 460000'),

    ('o registro do request_id em cron_http_calls sobreviveu',
     (select prosrc from http) ilike '%insert into public.cron_http_calls%',
     'clinvia_http_post continua nomeando o alvo')
)
select jsonb_pretty(jsonb_build_object(
    'reprovados', (select count(*) from checagens where not ok),
    'itens', (select jsonb_agg(jsonb_build_object(
                    'item', item, 'ok', ok, 'observado', observado) order by ok, item)
                from checagens),

    -- O que o plano pediu: "quero saber se meu problema e a IA, o front ou terceiro".
    -- Tudo aqui e INFERIDO a posteriori — nenhum evento dos ultimos 7 dias trazia
    -- x-origin, porque a coluna nasceu hoje. A partir de agora a coluna `origem`
    -- responde direto; ate la, a inferencia sai do proprio componente.
    'distribuicao_7d', (
        with e as (
            select coalesce(origem, 'nao_identificada') as origem, origem_inferida
              from public.incident_events
             where received_at > now() - interval '7 days'
        )
        select jsonb_build_object(
            'eventos', (select count(*) from e),
            -- O limite do item: acima de 10% vira trabalho, nao desculpa.
            'nao_identificada_pct', (select case when count(*) = 0 then 0 else
                round(100.0 * count(*) filter (where origem = 'nao_identificada')
                      / count(*), 1) end from e),
            'declarados_pct', (select case when count(*) = 0 then 0 else
                round(100.0 * count(*) filter (where not origem_inferida)
                      / count(*), 1) end from e),
            'por_origem', (select coalesce(jsonb_agg(jsonb_build_object(
                    'origem', origem, 'eventos', n,
                    'declarados', d, 'inferidos', n - d) order by n desc), '[]'::jsonb)
                from (select origem, count(*) as n,
                             count(*) filter (where not origem_inferida) as d
                        from e group by origem) x))
    )
));
