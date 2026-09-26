-- Folga de conexao do banco: medir, reduzir o desperdicio e avisar na saturacao
-- ============================================================================
-- O `item_rajada_conexoes` reprovou em 26/09/2026 dizendo "3 conexoes livres de
-- 60". A medicao mostrou duas coisas diferentes, e so uma delas era problema:
--
--   1. QUEM SEGURAVA. Em regime, 43 conexoes ocupadas, das quais 21 eram o pool
--      do PostgREST — 21 abertas, ZERO ativas, uma delas ociosa ha 8,8 dias.
--      O pooler (Supavisor) segurava UMA. O gargalo nunca esteve no pooler.
--      Corrigido FORA desta migration, pela Management API, porque `db_pool` nao
--      e ajustavel por SQL:
--          PATCH /v1/projects/{ref}/postgrest          {"db_pool": 12}
--          PATCH /v1/projects/{ref}/config/database/pooler {"default_pool_size": 10}
--      Resultado medido: 43 -> 35 ocupadas, folga 14 -> 22.
--
--   2. O TESTE MEDINDO A SI MESMO. As "3 livres" so aparecem quando a suite
--      roda: cada `supabase db query` abre uma sessao `mgmt-api` que demora a
--      sumir, e 50 verifies em sequencia deixam ~12 penduradas. Sozinho, o mesmo
--      verify media 15 livres no mesmo minuto. O numero estava certo e a
--      conclusao errada — efeito do observador, nao regressao. O verify passa a
--      descontar as sessoes `mgmt-api` e a mostrar o bruto ao lado.
--
-- Esta migration entrega o que falta: o aviso. Saturacao sustentada vira
-- incidente `alta` — e nao `somente_painel`, porque banco sem conexao livre e a
-- entrada de mensagem recusando paciente.
--
-- POR QUE UMA AMOSTRA POR MINUTO, e nao so uma leitura: "acima de 85% por 5
-- minutos" nao e pergunta que `pg_stat_activity` responda — ele so sabe o AGORA.
-- Sem serie, ou se alerta no primeiro pico de um segundo (ruido garantido), ou
-- nao se alerta nunca.
--
-- CUSTO ASSUMIDO, declarado de proposito: o varredor roda `* * * * *` e portanto
-- soma +1 em TODO minuto — o pico de partidas simultaneas passa de 12 para 13, e
-- o teto de c1/c2 do `item_rajada_conexoes` sobe junto. Isso NAO e afrouxar a
-- guarda: aquele 12 era um substituto para a folga de 14 medida em 24/09; hoje a
-- folga e 22 e quem de fato protege sao c3 e c10, que comparam o pico com a
-- folga REAL e ficaram com mais margem do que tinham (12 contra 19, antes 12
-- contra 11). Trocar um numero fixo por outro sem dizer isso seria mover a trave
-- no escuro.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ─── 1. Sessao ociosa de operacao nao fica de pe para sempre ────────────────
-- Vale para o papel `postgres`: CLI, editor SQL do painel, Management API. Sao
-- exatamente as que ficam penduradas depois de uma varredura.
--
-- NAO se aplica a `authenticator`: as conexoes do PostgREST sao um POOL, ficam
-- ociosas por desenho e reabri-las a cada 10 min trocaria folga por reconexao
-- constante no caminho quente. Tambem nao se aplica ao realtime, pela mesma razao.
alter role postgres set idle_session_timeout = '10min';

-- ─── 2. Serie curta de ocupacao ─────────────────────────────────────────────
create table if not exists public.db_conexoes_amostras (
    t        timestamptz primary key default now(),
    em_uso   integer not null,
    maximo   integer not null,
    pct      numeric(5,2) not null,
    detalhe  jsonb not null default '{}'::jsonb
);

comment on table public.db_conexoes_amostras is
    'Ocupacao de conexao do banco, uma amostra por minuto, podada em 24h. Existe porque pg_stat_activity so conhece o agora e o alerta precisa de "sustentado por 5 minutos".';

create index if not exists idx_db_conexoes_amostras_t
    on public.db_conexoes_amostras (t desc);

alter table public.db_conexoes_amostras enable row level security;
revoke all on table public.db_conexoes_amostras from anon, authenticated;
grant select on table public.db_conexoes_amostras to service_role;

-- ─── 3. Catalogo ────────────────────────────────────────────────────────────
insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, severidade_padrao, somente_painel, is_active)
values
    ('banco:conexoes-saturadas', 'exato', 'detector',
     'acusa ocupacao de conexao do banco acima de 85% do maximo sustentada por 5 minutos',
     'Banco sem conexao livre recusa a ENTRADA de mensagem, entao isto nao espera. '
     'Primeiro ver quem segura: select usename, application_name, state, count(*) from pg_stat_activity group by 1,2,3 order by 4 desc. '
     'Tres suspeitos, nesta ordem: (a) pool do PostgREST — e ajustavel sem deploy pela Management API, PATCH /v1/projects/{ref}/postgrest com db_pool; '
     '(b) sessoes ociosas de operacao (usename postgres) — o papel ja tem idle_session_timeout de 10 min, se aparecerem muitas alguem passou por fora; '
     '(c) rajada de cron no mesmo minuto — conferir o item_rajada_conexoes, que recalcula o pico a partir de cron.job. '
     'NAO resolver subindo max_connections: o teto do plano e 60 e o verify reprova se alguem subir.',
     'alta', false, true)
on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       severidade_padrao = excluded.severidade_padrao,
       somente_painel    = excluded.somente_painel,
       is_active         = true,
       updated_at        = now();

-- ─── 4. Varredor ────────────────────────────────────────────────────────────
create or replace function public.db_conexoes_scan()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    v_max     integer;
    v_uso     integer;
    v_pct     numeric(5,2);
    v_quem    jsonb;
    v_n       integer;
    v_min_pct numeric;
    v_res     jsonb;
begin
    select setting::int into v_max from pg_settings where name = 'max_connections';
    select count(*) into v_uso from pg_stat_activity;
    v_pct := round(100.0 * v_uso / nullif(v_max, 0), 2);

    -- Quem segura vai junto da amostra: quando o alerta chegar, a resposta ja
    -- esta gravada no minuto do fato, e nao no minuto em que alguem foi olhar.
    select coalesce(jsonb_object_agg(quem, n), '{}'::jsonb) into v_quem
      from (
        select coalesce(nullif(application_name, ''), usename, 'interno') as quem,
               count(*) as n
          from pg_stat_activity
         group by 1
         order by 2 desc
         limit 5
      ) t;

    insert into public.db_conexoes_amostras (t, em_uso, maximo, pct, detalhe)
    values (date_trunc('second', now()), v_uso, v_max, v_pct, v_quem)
    on conflict (t) do nothing;

    delete from public.db_conexoes_amostras where t < now() - interval '24 hours';

    -- Sustentado: 5 amostras na janela de 6 min e NENHUMA abaixo de 85%. Exigir
    -- as cinco evita que uma pane do proprio varredor (que deixaria buracos na
    -- serie) seja lida como saturacao.
    select count(*), min(pct) into v_n, v_min_pct
      from public.db_conexoes_amostras
     where t > now() - interval '6 minutes';

    if v_n < 5 or coalesce(v_min_pct, 0) < 85 then
        return jsonb_build_object('estado', 'ok', 'pct', v_pct, 'amostras', v_n);
    end if;

    v_res := public.incident_record(jsonb_build_object(
        'source', 'db_job',
        'component', 'banco:conexoes-saturadas',
        'error_message', format(
            'Conexoes do banco em %s%% do maximo (%s de %s) ha pelo menos 5 minutos. Maiores consumidores: %s.',
            v_pct, v_uso, v_max, v_quem::text),
        -- Bucket por hora: saturacao que dura reincide no mesmo incidente em vez
        -- de abrir uma linha nova a cada minuto.
        'request_id', 'conexoes-saturadas:' || to_char(now(), 'YYYYMMDDHH24'),
        'context', jsonb_build_object(
            'em_uso', v_uso,
            'maximo', v_max,
            'pct', v_pct,
            'amostras_na_janela', v_n,
            'menor_pct_na_janela', v_min_pct,
            'maiores_consumidores', v_quem)));

    if coalesce((v_res ->> 'skipped')::boolean, false) is false then
        perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'alta');
    end if;

    return jsonb_build_object('estado', 'saturado', 'pct', v_pct, 'incidente', v_res);
end;
$$;

comment on function public.db_conexoes_scan() is
    'Amostra a ocupacao de conexao do banco a cada minuto e abre banco:conexoes-saturadas (alta) quando passa de 85% do maximo por 5 minutos seguidos.';

revoke all on function public.db_conexoes_scan() from public, anon, authenticated;
grant execute on function public.db_conexoes_scan() to service_role;

-- ─── 5. Cron ────────────────────────────────────────────────────────────────
select cron.unschedule('db-conexoes-watch')
 where exists (select 1 from cron.job where jobname = 'db-conexoes-watch');

select cron.schedule(
    'db-conexoes-watch',
    '* * * * *',
    $cron$select public.db_conexoes_scan();$cron$);
