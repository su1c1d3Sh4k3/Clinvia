-- REGRA GERAL de 26/09/2026 (migration 20260926180000).
-- Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.
--
-- O QUE ESTE TESTE PROTEGE, em uma frase: que o telefone dele so toque por
-- problema que alguem DESTE LADO possa resolver.
--
-- Problema de conta ou conexao do CLIENTE (Instagram vencido, WhatsApp
-- desconectado, conta barrada pela Meta) vira aviso no front DELE, com a acao
-- que ele precisa tomar; aqui fica no painel. O criterio nao e a gravidade do
-- fato — token vencido derruba o Direct inteiro de uma clinica — e sim QUEM
-- PODE AGIR. Alerta que chega para quem nao pode agir e ruido, e ruido ensina
-- que vermelho da para ignorar, que e o custo cobrado no dia em que importa.
--
-- O contrapeso e c9 e ele e a razao de o resto poder ficar mudo: a renovacao
-- automatica falhando com o token AINDA VALIDO e defeito NOSSO, com estopim de
-- ~15 dias. Se c9 reprovar, o silencio dos outros deixa de ser calibragem e
-- passa a ser cegueira.

with
c1 as (
    select 1 as ord,
           'instagram:token-vencido = baixa/teto baixa/painel' as checagem,
           case when exists (
                    select 1 from public.incident_component_catalog
                     where component = 'instagram:token-vencido' and is_active
                       and severidade_padrao = 'baixa' and severidade_teto = 'baixa'
                       and somente_painel)
                then 'ok' else 'CONFERIR' end as status,
           coalesce((select severidade_padrao || '/' || coalesce(severidade_teto,'(sem teto)')
                            || case when somente_painel then '/painel' else '/TELEFONE' end
                       from public.incident_component_catalog
                      where component = 'instagram:token-vencido'), 'sem linha') as detalhe
),
-- O teto e o que impede a IA de promover: sem ele bastaria o analisador achar
-- grave uma conta parada para a classe inteira voltar a tocar.
c2 as (
    select 2, 'a IA nao consegue promover token-vencido (efetiva com critica = baixa)',
           case when public.incident_severidade_efetiva('instagram:token-vencido', 'critica') = 'baixa'
                then 'ok' else 'CONFERIR' end,
           public.incident_severidade_efetiva('instagram:token-vencido', 'critica')
),
c3 as (
    select 3, 'os dois pares de instancia desconectada estao so no painel',
           case when (select count(*) from public.incident_component_catalog
                       where component in ('uazapi:instancia-desconectada', 'meta:instancia-desconectada')
                         and is_active and somente_painel and severidade_teto = 'baixa') = 2
                then 'ok' else 'CONFERIR' end,
           coalesce((select string_agg(component || '=' || somente_painel::text, ', ' order by component)
                       from public.incident_component_catalog
                      where component in ('uazapi:instancia-desconectada', 'meta:instancia-desconectada')),
                    'sem linhas')
),
-- Os dois varredores da UAZAPI. NAO estao desligados: `is_active` continua true
-- e o incidente continua sendo gravado — a protecao de que lista vazia do
-- provedor com linhas vivas no banco NAO fecha orfa vive no codigo da function
-- e e coberta por item_instancias_uazapi_removidas.
c4 as (
    select 4, 'varredores da UAZAPI ativos, baixa e so-painel',
           case when (select count(*) from public.incident_component_catalog
                       where component in ('uazapi:varredura-cega', 'uazapi:remocao-pendente',
                                           'uzapi-instancias-orfas')
                         and is_active and somente_painel
                         and severidade_padrao = 'baixa' and severidade_teto = 'baixa') = 3
                then 'ok' else 'CONFERIR' end,
           coalesce((select string_agg(component || '=' || severidade_padrao
                                       || case when somente_painel then '/painel' else '/TELEFONE' end,
                                       ', ' order by component)
                       from public.incident_component_catalog
                      where component in ('uazapi:varredura-cega', 'uazapi:remocao-pendente',
                                          'uzapi-instancias-orfas')), 'sem linhas')
),
-- Sem linha propria, `uzapi-instancias-orfas` casa no prefixo `uzapi-`, que e
-- alta e vai para o WhatsApp — prefixo pensado para as functions de CONEXAO,
-- nao para um relatorio diario de divida de cadastro.
c5 as (
    select 5, 'resolvedor devolve a linha exata do varredor, nao o prefixo uzapi-',
           case when (select component from public.incident_component_info('uzapi-instancias-orfas'))
                     = 'uzapi-instancias-orfas'
                then 'ok' else 'CONFERIR' end,
           coalesce((select component || ' (' || severidade_padrao || ')'
                       from public.incident_component_info('uzapi-instancias-orfas')), 'sem resolucao')
),
c6 as (
    select 6, 'meta:fora_do_ar catalogado como media/painel',
           case when exists (
                    select 1 from public.incident_component_catalog
                     where component = 'meta:fora_do_ar' and is_active
                       and severidade_padrao = 'media' and severidade_teto = 'media'
                       and somente_painel)
                then 'ok' else 'CONFERIR' end,
           coalesce((select severidade_padrao || '/' || coalesce(severidade_teto,'(sem teto)')
                       from public.incident_component_catalog
                      where component = 'meta:fora_do_ar'), 'sem linha')
),
-- A conta inteira da clinica barrada pela Meta sai do telefone MAS continua
-- critica: no painel ela tem que aparecer no topo, que e por onde o suporte
-- avisa o cliente. Baixar a gravidade junto teria escondido o caso mais grave
-- da lista dentro da propria supressao.
c7 as (
    select 7, 'envio:conta- segue critica e foi para o painel',
           case when exists (
                    select 1 from public.incident_component_catalog
                     where component = 'envio:conta-' and is_active
                       and severidade_padrao = 'critica' and somente_painel)
                then 'ok' else 'CONFERIR' end,
           coalesce((select severidade_padrao
                            || case when somente_painel then '/painel' else '/TELEFONE' end
                       from public.incident_component_catalog
                      where component = 'envio:conta-'), 'sem linha')
),
-- Nada foi desarmado: detector calado ainda e detector. Se algum destes sair do
-- ar, o painel para de ter a informacao e o suporte fica sem saber desde quando
-- a clinica esta parada.
c8 as (
    select 8, 'nenhum dos componentes silenciados foi desativado',
           case when (select count(*) from public.incident_component_catalog
                       where component in ('instagram:token-vencido', 'uazapi:instancia-desconectada',
                                           'meta:instancia-desconectada', 'uazapi:varredura-cega',
                                           'uazapi:remocao-pendente', 'uzapi-instancias-orfas',
                                           'meta:fora_do_ar', 'envio:conta-')
                         and is_active) = 8
                then 'ok' else 'CONFERIR' end,
           (select count(*)::text || ' de 8 ativos' from public.incident_component_catalog
             where component in ('instagram:token-vencido', 'uazapi:instancia-desconectada',
                                 'meta:instancia-desconectada', 'uazapi:varredura-cega',
                                 'uazapi:remocao-pendente', 'uzapi-instancias-orfas',
                                 'meta:fora_do_ar', 'envio:conta-'))
),
-- O CONTRAPESO. Se este reprovar, o silencio de c1-c8 vira cegueira.
c9 as (
    select 9, 'instagram:renovacao-falhou toca o telefone (alta, sem teto, fora do painel)',
           case when exists (
                    select 1 from public.incident_component_catalog
                     where component = 'instagram:renovacao-falhou' and is_active
                       and severidade_padrao = 'alta' and severidade_teto is null
                       and not somente_painel)
                then 'ok' else 'CONFERIR' end,
           coalesce((select severidade_padrao || '/' || coalesce(severidade_teto,'sem teto')
                            || case when somente_painel then '/PAINEL' else '/telefone' end
                       from public.incident_component_catalog
                      where component = 'instagram:renovacao-falhou'), 'sem linha')
),
-- O incidente do token vencido so serve para o suporte saber DE QUEM e a conta
-- parada; sem owner_id o campo Cliente do painel cai em "Conta nao identificada"
-- e o registro perde a unica utilidade que lhe restou.
c10 as (
    select 10, 'cron do Instagram carimba owner_id no incidente',
           case when exists (
                    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'instagram_refresh_tokens_run'
                       and pg_get_functiondef(p.oid) ilike '%owner_id%'
                       and pg_get_functiondef(p.oid) ilike '%i.user_id%')
                then 'ok' else 'CONFERIR' end,
           ''
),
-- A escalada existia pela REGRA DE RUIDO de 23/09 ("status mentindo na tela =
-- alta"). A premissa caiu: o banner do cliente passou a ler `token_expires_at`,
-- nao `status`, entao a tela nao mente mais nem por um minuto. Deixar a
-- escalada seria furar por dentro o teto baixa posto em c1.
c11 as (
    select 11, 'cron nao escala mais a gravidade por conta (piso/inicial removidos)',
           case when exists (
                    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'instagram_refresh_tokens_run'
                       and pg_get_functiondef(p.oid) not ilike '%incident_piso_severidade%'
                       and pg_get_functiondef(p.oid) not ilike '%incident_set_severidade_inicial%')
                then 'ok' else 'CONFERIR' end,
           ''
),
-- UM registro por conta, nao um por varredura: o fingerprint e
-- (source, component, locator, mensagem), `locator` e a conta e a mensagem
-- carrega o @. A passada do dia seguinte cai no MESMO incidente e soma evento,
-- em vez de abrir linha nova. `incidents` nao guarda a rota (ela vive em
-- `incident_events`), entao o teto e medido pelo que importa: incidente aberto
-- nunca pode passar do numero de contas vencidas.
c12 as (
    select 12, 'um incidente aberto por conta, nao um por varredura',
           case when (select count(*) from public.incidents
                       where component = 'instagram:token-vencido' and status <> 'resolved')
                     <= (select count(*) from public.instagram_instances
                          where token_expires_at is not null and token_expires_at < now())
                then 'ok' else 'CONFERIR' end,
           (select count(*)::text from public.incidents
             where component = 'instagram:token-vencido' and status <> 'resolved')
           || ' incidente(s) aberto(s) para '
           || (select count(*)::text from public.instagram_instances
                where token_expires_at is not null and token_expires_at < now())
           || ' conta(s) vencida(s)'
),
-- Medicao, nao veredito: o tamanho real da exposicao hoje.
c13 as (
    select 13, 'contas do Instagram vencidas ou vencendo em 7 dias',
           'ok',
           (select count(*) filter (where token_expires_at < now())::text || ' vencida(s), '
                || count(*) filter (where token_expires_at >= now()
                                      and token_expires_at < now() + interval '7 days')::text
                || ' vencendo em 7d, de ' || count(*)::text || ' conta(s)'
              from public.instagram_instances where token_expires_at is not null)
)
select checagem, status, detalhe from (
    select * from c1 union all select * from c2 union all select * from c3
    union all select * from c4 union all select * from c5 union all select * from c6
    union all select * from c7 union all select * from c8 union all select * from c9
    union all select * from c10 union all select * from c11 union all select * from c12
    union all select * from c13
) t order by ord;
