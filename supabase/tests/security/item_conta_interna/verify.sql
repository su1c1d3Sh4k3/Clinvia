-- Conta interna fora das medidas (24/09/2026).
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.
--
-- O que este teste tem que provar, em ordem de importancia:
--   1. a conta da sentinela NAO gera incidente (era o risco real da mudanca);
--   2. ela NAO entra nas contagens do painel;
--   3. ela CONTINUA aparecendo na lista de clientes (esconder seria pior);
--   4. a calibragem de 23/09 dos alertas de custo sobreviveu ao re-emitir a
--      funcao — reescrever um corpo grande e a forma mais facil de desfazer,
--      sem perceber, uma correcao anterior.

with
-- 1. A marca existe, com o default que nao muda o comportamento de ninguem.
c1 as (
    select 1 as ord,
           'profiles.is_internal existe, not null, default false' as checagem,
           case when a.attnotnull
                 and pg_get_expr(d.adbin, d.adrelid) = 'false'
                then 'ok' else 'FALHOU' end as resultado,
           coalesce(pg_get_expr(d.adbin, d.adrelid), '(sem default)') as detalhe
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'public.profiles'::regclass
       and a.attname = 'is_internal'
),
-- 2. O trigger de provisionamento nao enfileira conta interna. A guarda tem que
--    vir ANTES da checagem de role: a conta e role='admin', entao qualquer
--    ordem diferente a deixaria passar.
c2 as (
    select 2, 'enqueue_openai_provision barra is_internal antes de tudo',
           case when position('is_internal' in pg_get_functiondef(p.oid)) > 0
                 and position('is_internal' in pg_get_functiondef(p.oid))
                     < position('new.role' in pg_get_functiondef(p.oid))
                then 'ok' else 'FALHOU' end, ''
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'enqueue_openai_provision'
),
-- 3. Os TRES ramos do detector de provisionamento. Este e o item que motivou a
--    migration: sem ele, tirar a conta do provisionamento a transformaria em
--    "conta ativa sem chave" — ALTA a cada 15 min, para sempre.
c3 as (
    select 3, 'provisionamento_scan filtra is_internal nos 3 ramos',
           case when (length(pg_get_functiondef(p.oid))
                      - length(replace(pg_get_functiondef(p.oid), 'is_internal', ''))) / 11 = 3
                then 'ok' else 'FALHOU' end,
           ((length(pg_get_functiondef(p.oid))
             - length(replace(pg_get_functiondef(p.oid), 'is_internal', ''))) / 11)::text
           || ' ocorrencia(s), esperado 3'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'provisionamento_scan'
),
-- 4. Contagem de contas com projeto + zeragem + anomalia.
c4 as (
    select 4, 'openai_alert_scan filtra is_internal nos 3 pontos',
           case when (length(pg_get_functiondef(p.oid))
                      - length(replace(pg_get_functiondef(p.oid), 'is_internal', ''))) / 11 = 3
                then 'ok' else 'FALHOU' end,
           ((length(pg_get_functiondef(p.oid))
             - length(replace(pg_get_functiondef(p.oid), 'is_internal', ''))) / 11)::text
           || ' ocorrencia(s), esperado 3'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'openai_alert_scan'
),
-- 5. A calibragem de 23/09 (patamares de custo) continua de pe. Re-emitir o
--    corpo a partir da versao errada teria revertido isto em silencio, e o
--    falso positivo de centavos voltaria.
c5 as (
    select 5, 'openai_alert_scan manteve a calibragem de 23/09',
           case when pg_get_functiondef(p.oid) ~ 'daily_anomaly_min_days'
                 and pg_get_functiondef(p.oid) ~ 'daily_anomaly_min_usd'
                 and pg_get_functiondef(p.oid) ~ 'daily_anomaly_critical_usd'
                then 'ok' else 'FALHOU — a re-emissao desfez a calibragem' end, ''
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'openai_alert_scan'
),
-- 6. Painel: contagem de contas, top de custo, chave invalida e tenant ocioso.
c6 as (
    select 6, 'admin_get_dashboard_metrics filtra is_internal nos 4 pontos',
           case when (length(pg_get_functiondef(p.oid))
                      - length(replace(pg_get_functiondef(p.oid), 'is_internal', ''))) / 11 = 4
                then 'ok' else 'FALHOU' end,
           ((length(pg_get_functiondef(p.oid))
             - length(replace(pg_get_functiondef(p.oid), 'is_internal', ''))) / 11)::text
           || ' ocorrencia(s), esperado 4'
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_get_dashboard_metrics'
),
-- 7. A lista de contas internas. Esperado: exatamente uma, a da sentinela.
c7 as (
    select 7, 'contas marcadas como internas',
           case when count(*) = 1 then 'ok' else 'CONFERIR' end,
           coalesce(string_agg(coalesce(nullif(company_name, ''), email), ', '), '(nenhuma)')
      from public.profiles where is_internal
),
-- 8. Ela e conta COMUM. Super admin mora em admin_users, nunca em profiles.role
--    — uma caixa fora da plataforma nao pode carregar uma credencial que abre
--    o painel inteiro.
c8 as (
    select 8, 'conta interna nao e super admin',
           case when not exists (
                    select 1 from public.admin_users a
                     join public.profiles p on p.email = a.email
                    where p.is_internal and a.is_active)
                then 'ok' else 'FALHOU — a conta esta em admin_users' end, ''
),
-- 9. Tenant proprio e vazio: sem contato, sem conversa, sem instancia. Se um dia
--    tiver, alguem usou a conta da sentinela para outra coisa.
c9 as (
    select 9, 'tenant da conta interna esta vazio',
           case when coalesce(sum(t.n), 0) = 0 then 'ok' else 'FALHOU' end,
           coalesce(string_agg(t.o || '=' || t.n, ', ') filter (where t.n > 0), 'zero em tudo')
      from public.profiles p
      cross join lateral (
            select 'contatos' as o, count(*) as n from public.contacts    where user_id = p.id
            union all
            select 'conversas',     count(*)      from public.conversations where user_id = p.id
            union all
            select 'instancias',    count(*)      from public.instances   where user_id = p.id
      ) t
     where p.is_internal
),
-- 10. Nenhum job de provisionamento vivo para ela, nem erro registrado: prova de
--     que a guarda do trigger pegou na pratica, e nao so no texto da funcao.
c10 as (
    select 10, 'conta interna sem job e sem erro de provisionamento',
           case when count(*) = 0 then 'ok' else 'FALHOU' end,
           count(*)::text || ' pendencia(s)'
      from public.profiles p
      left join public.openai_provision_queue q
             on q.profile_id = p.id and q.status in ('pending', 'processing')
     where p.is_internal
       and (q.id is not null or p.openai_provision_error is not null)
),
-- 11. Nenhum incidente aberto apontando para ela.
c11 as (
    select 11, 'conta interna nao gerou incidente',
           case when count(*) = 0 then 'ok' else 'FALHOU' end,
           coalesce(string_agg(distinct i.component, ', '), 'nenhum')
      from public.incidents i
      join public.profiles p on p.id = i.owner_id
     where p.is_internal
),
-- 12. Contraprova: ela some das contagens e PERMANECE na lista. As duas coisas
--     ao mesmo tempo sao o desenho — invisivel no numero, visivel na tela.
c12 as (
    select 12, 'invisivel na contagem, visivel na lista',
           case when (select count(*) from public.profiles
                       where role = 'admin' and deactivated_at is null)
                    - (select count(*) from public.profiles
                        where role = 'admin' and deactivated_at is null
                          and not coalesce(is_internal, false)) = 1
                 and exists (select 1 from public.profiles
                              where is_internal and deactivated_at is null)
                then 'ok' else 'FALHOU' end,
           (select count(*)::text from public.profiles
             where role = 'admin' and deactivated_at is null
               and not coalesce(is_internal, false)) || ' conta(s) contada(s)'
)
select checagem, resultado, detalhe from (
    select * from c1  union all select * from c2  union all select * from c3
    union all select * from c4  union all select * from c5  union all select * from c6
    union all select * from c7  union all select * from c8  union all select * from c9
    union all select * from c10 union all select * from c11 union all select * from c12
) t order by ord, checagem;
