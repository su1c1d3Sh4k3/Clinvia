-- item_sentinela_externa — a plataforma vigia quem a vigia.
--
-- O que este teste protege, em uma frase: um vigia que pode ficar mudo em
-- silencio nao e vigia. A sentinela mora FORA (VPS, systemd) e avisa por
-- WhatsApp direto, sem Supabase no caminho; se a caixa dela morrer, o unico
-- jeito de alguem saber e a AUSENCIA das linhas de sinal de vida aqui dentro.
--
-- Nao chama `sentinela_health_scan()`: o varredor apaga heartbeat velho e pode
-- abrir incidente. Teste que escreve em producao vira o problema que deveria
-- medir — a inspecao aqui e estatica de proposito.
--
-- Uma unica instrucao: `db query --file` imprime so o resultado do ULTIMO
-- statement, entao verify partido em varios selects perde tudo menos o fim.

set lock_timeout = '5s';
set statement_timeout = '60s';

with fn as (
    select p.oid, p.prosrc, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sentinela_health_scan'
),
job as (
    select schedule, active from cron.job where jobname = 'sentinela-health-watch'
),
checagens(item, ok) as (

    -- ── A. o sinal de vida tem onde pousar ───────────────────────────────────
    select 'A1 tabela sentinela_heartbeats existe',
           to_regclass('public.sentinela_heartbeats') is not null
    union all
    select 'A2 RLS ligada na tabela',
           coalesce((select c.relrowsecurity from pg_class c
                      where c.oid = to_regclass('public.sentinela_heartbeats')), false)
    union all
    -- A caixa externa e, por definicao, menos protegida que a plataforma. O que
    -- ela escreve nao pode ser lido nem apagado por quem passa pelo gateway com
    -- a chave publica do front.
    select 'A3 anon e authenticated sem privilegio nenhum na tabela',
           not exists (
               select 1
                 from unnest(array['anon', 'authenticated']) r,
                      unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
                where has_table_privilege(r, 'public.sentinela_heartbeats', p))

    -- ── B. o varredor ────────────────────────────────────────────────────────
    union all
    select 'B1 sentinela_health_scan existe', exists (select 1 from fn)
    union all
    select 'B2 security definer com search_path fixo',
           (select prosecdef and proconfig::text like '%search_path%' from fn)
    union all
    -- `create function` concede EXECUTE a PUBLIC, e revoke de anon nao tira isso
    select 'B3 anon e authenticated nao executam o varredor',
           (select not has_function_privilege('anon', oid, 'EXECUTE')
                   and not has_function_privilege('authenticated', oid, 'EXECUTE') from fn)
    union all
    select 'B4 limiar de silencio de 10 minutos',
           (select prosrc like '%v_min < 10%' from fn)
    union all
    -- Sem esta guarda a plataforma reclamaria, de 5 em 5 minutos e para sempre,
    -- de uma caixa que ainda nao foi instalada. Ruido nascido de decisao nossa.
    select 'B5 fica calado enquanto nunca houve sinal',
           (select prosrc like '%v_ultimo is null%' and prosrc like '%nunca_reportou%' from fn)
    union all
    select 'B6 abre incidente critico quando o silencio passa do limiar',
           (select prosrc like '%sentinela:parou-de-reportar%'
                   and prosrc like '%incident_set_severidade_inicial%'
                   and prosrc like '%''critica''%' from fn)
    union all
    -- Reincidir no mesmo incidente: silencio de horas nao pode virar uma linha
    -- nova a cada passada do cron.
    select 'B7 request_id por hora, para reincidir em vez de empilhar',
           (select prosrc like '%sentinela-muda:%' and prosrc like '%YYYYMMDDHH24%' from fn)

    -- ── C. cadencia ──────────────────────────────────────────────────────────
    union all
    select 'C1 cron sentinela-health-watch agendado e ativo',
           (select active from job)
    union all
    -- O minuto EXATO nao entra na checagem — recalibragem de folga de conexao e
    -- acerto, nao regressao. O que nao pode e voltar para o minuto cheio, que
    -- 20260925220000 acabou de esvaziar: qualquer termo comecando em `*` inclui
    -- o :00.
    select 'C2 nao reempilha no minuto cheio',
           (select split_part(schedule, ' ', 1) not like '*%' from job)

    -- ── D. catalogo: os dois componentes e a diferenca entre eles ────────────
    union all
    select 'D1 aplicacao-inacessivel e critica e SO-PAINEL',
           (select severidade_padrao = 'critica' and somente_painel
              from public.incident_component_info('sentinela:aplicacao-inacessivel'))
    union all
    -- O oposto do anterior, e e o coracao do desenho: quando este dispara a
    -- sentinela esta muda por definicao, entao nao existe segunda via. Marca-lo
    -- como painel deixaria a queda da VPS sem nenhum canal.
    select 'D2 parou-de-reportar VAI ao WhatsApp',
           (select severidade_padrao = 'critica' and somente_painel = false
              from public.incident_component_info('sentinela:parou-de-reportar'))
    union all
    select 'D3 os dois estao ativos no catalogo',
           (select count(*) = 2 from public.incident_component_catalog
             where is_active and component in ('sentinela:aplicacao-inacessivel',
                                               'sentinela:parou-de-reportar'))
    union all
    -- A acao tem que carregar a SEGUNDA hipotese: se a function que grava o
    -- heartbeat quebrar, o silencio acusa queda da VPS com a VPS de pe. Quem le
    -- o alerta as 3 da manha precisa saber disso pela propria mensagem.
    select 'D4 acao do silencio menciona a hipotese de defeito nosso',
           (select acao_padrao ilike '%sentinela-heartbeat%'
              from public.incident_component_info('sentinela:parou-de-reportar'))
)
select case when ok then 'ok' else 'CONFERIR' end as status, item
  from checagens
 order by ok, item;
