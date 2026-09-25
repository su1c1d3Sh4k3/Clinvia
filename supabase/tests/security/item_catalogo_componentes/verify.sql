-- Teste de acesso e de cobertura do catalogo de componentes
-- (20260923290000 catalogo + 20260923340000 completude e nome dos detectores).
--
-- Uma unica instrucao de proposito: o `supabase db query` devolve so o ultimo
-- result set, entao teste em varios selects perde os primeiros em silencio.
--
-- Rodar:  npx supabase db query --linked --file supabase/tests/security/item_catalogo_componentes/verify.sql
-- Esperado: todas as linhas com ok = true.

with
-- Todo literal de componente que QUALQUER funcao do banco consegue emitir.
-- E a lista contra a qual a cobertura e medida: nao adianta o catalogo estar
-- bonito se o emissor grava um nome que ele nao conhece — foi exatamente isso
-- que 'openai-alerts' fez em 23/09.
literais as (
    select distinct m[1] as componente
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
           lateral regexp_matches(p.prosrc, '''component'',\s*''([a-z0-9:_-]+)''', 'g') m
     where n.nspname = 'public'
),
checagens as (

    -- ── A. privilegio: catalogo e assunto interno ────────────────────────────
    select 'A1 catalogo ilegivel por anon' as item,
           has_table_privilege('anon', 'public.incident_component_catalog', 'SELECT') = false as ok
    union all
    select 'A2 catalogo ilegivel por authenticated',
           has_table_privilege('authenticated', 'public.incident_component_catalog', 'SELECT') = false
    union all
    select 'A3 catalogo nao gravavel por authenticated',
           has_table_privilege('authenticated', 'public.incident_component_catalog', 'INSERT') = false
    union all
    select 'A4 varredor de fontes negado a anon',
           has_function_privilege('anon', 'public.incident_scan_db_sources(interval, integer)', 'EXECUTE') = false
    union all
    select 'A5 varredor de fontes negado a authenticated',
           has_function_privilege('authenticated', 'public.incident_scan_db_sources(interval, integer)', 'EXECUTE') = false
    union all
    select 'A6 varredor de fontes liberado a service_role',
           has_function_privilege('service_role', 'public.incident_scan_db_sources(interval, integer)', 'EXECUTE') = true

    -- ── B. cobertura: nenhum nome emissivel fica sem linha ───────────────────
    union all
    -- "catalogado" e a EXISTENCIA da linha, nao uma coluna: a funcao devolve
    -- zero linhas para componente fora do catalogo. Ate 24/09 havia a coluna
    -- `catalogado`, que valia sempre `true`; a re-emissao da funcao em
    -- 20260924180000 a removeu e estas tres checagens pararam de EXECUTAR
    -- (42703), silenciosamente, porque o verify so rodava no dia em que nasceu.
    select 'B1 todo literal do banco resolve no catalogo',
           not exists (
               select 1 from literais l
               where not exists (select 1 from public.incident_component_info(l.componente))
           )
    union all
    -- os dois componentes emitidos por edge function, que o regex de SQL nao ve
    select 'B2 componente do alert-notify catalogado',
           exists (select 1 from public.incident_component_info('monitoramento:componente-nao-catalogado'))
    union all
    select 'B3 componente do incident-analyze catalogado',
           exists (select 1 from public.incident_component_info('monitoramento:analise-indisponivel'))

    -- ── C. o defeito de 23/09: nome do emissor x nome do catalogo ────────────
    -- 'openai-alerts' NAO casava com o prefixo 'openai:' por causa do hifen, e
    -- a natureza caia no default 'servico'. A IA entao tratou uma DETECCAO como
    -- falha do detector e recomendou acao contraria a regra do produto.
    union all
    select 'C1 varredor nomeia o detector, nao a tabela',
           (select p.prosrc like '%''openai:'' || coalesce(v_reg.kind%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'incident_scan_db_sources')
    union all
    select 'C2 literal openai-alerts nao existe mais no varredor',
           (select p.prosrc not like '%''component'', ''openai-alerts''%' from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'incident_scan_db_sources')
    union all
    select 'C3 os 3 kinds emitidos resolvem como detector',
           not exists (
               select 1 from unnest(array['daily_anomaly', 'zero_usage', 'sync_failure']) k
               left join lateral public.incident_component_info('openai:' || k) i on true
               where coalesce(i.natureza, '') is distinct from 'detector'
           )
    union all
    -- kind novo que ninguem cadastrou ainda nao pode voltar a mentir a natureza
    select 'C4 kind desconhecido cai no prefixo e segue detector',
           (select natureza = 'detector' from public.incident_component_info('openai:um_kind_que_nao_existe'))

    -- ── D. as quatro linhas novas, e o que elas prometem ─────────────────────
    union all
    select 'D1 os 4 servicos que faltavam estao catalogados',
           not exists (
               select 1 from unnest(array['sync-openai-usage', 'openai-provision-worker',
                                          'automation-send-queue', 'api-public-booking']) c
               left join lateral public.incident_component_info(c) i on true
               where i.component is null
                  or i.natureza is distinct from 'servico'
           )
    union all
    -- o detector que vigia o sync e o proprio sync sao linhas diferentes: se
    -- colapsarem, o alerta passa a chamar de deteccao uma falha de servico
    select 'D2 sync-openai-usage e openai:sync_failure nao se confundem',
           (select i1.natureza = 'servico' and i2.natureza = 'detector'
              from public.incident_component_info('sync-openai-usage') i1,
                   public.incident_component_info('openai:sync_failure') i2)
    union all
    select 'D3 toda linha ativa tem descricao e acao padrao nao vazias',
           not exists (select 1 from public.incident_component_catalog
                        where is_active
                          and (coalesce(trim(descricao), '') = ''
                            or coalesce(trim(acao_padrao), '') = ''))
    union all
    -- "abrir o painel e investigar" foi o texto que motivou a coluna existir
    select 'D4 nenhuma acao padrao e generica',
           not exists (select 1 from public.incident_component_catalog
                        where is_active and descricao is not null
                          and acao_padrao ilike '%investigar%' and length(acao_padrao) < 60)
)
select item, ok from checagens order by ok, item;
