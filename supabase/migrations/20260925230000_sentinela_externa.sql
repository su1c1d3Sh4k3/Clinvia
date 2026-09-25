-- A plataforma passa a vigiar quem a vigia.
--
-- A sentinela (`monitoring/sentinela_login/`) mede de FORA se a aplicacao esta
-- acessivel e avisa por WhatsApp direto, sem Supabase no caminho — de proposito,
-- porque o cenario que ela vigia inclui esta plataforma estar fora. Falta a
-- outra metade: se a CAIXA DE FORA morrer, ninguem percebe. Um vigia que pode
-- ficar mudo em silencio nao e vigia, e uma luz verde que mente.
--
-- Antes isso era um e-mail diario cuja AUSENCIA era o sinal, o que pedia que
-- ele reparasse na falta de uma mensagem — a coisa mais facil de nao reparar.
-- Agora quem repara e o banco: 10 min sem sinal de vida abrem
-- `sentinela:parou-de-reportar`, critico, pelo caminho normal de alerta.
--
-- DOIS componentes, e a diferenca entre eles e o desenho inteiro:
--
--   sentinela:aplicacao-inacessivel  a propria sentinela JA mandou o WhatsApp
--                                    dela. Aqui e `somente_painel`, senao o
--                                    mesmo fato chega duas vezes no telefone.
--   sentinela:parou-de-reportar      a sentinela esta muda POR DEFINICAO; so a
--                                    plataforma pode levantar isto. NAO e
--                                    `somente_painel` — nao ha segunda via.
--
-- Cadencia do varredor: `5-59/5`, e nao `*/5`. A migration anterior
-- (`20260925220000`) acabou de esvaziar o minuto :00 para dar folga de conexao;
-- reempilhar aqui desfaria o trabalho na mesma rodada. Custo medido e aceito: o
-- vao 55->05 faz a deteccao demorar ate 19 min contra um limiar de 10. Para um
-- detector cujo assunto e "a caixa externa morreu", isso e barato — o que nao
-- pode e ele nunca disparar.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ---------------------------------------------------------------- sinal de vida

create table if not exists public.sentinela_heartbeats (
    id            uuid primary key default gen_random_uuid(),
    recebido_em   timestamptz not null default now(),
    medido_em     timestamptz,
    ok            boolean not null default false,
    falhas        text[] not null default '{}',
    confirmadas   text[] not null default '{}',
    login_medido  boolean not null default false,
    caiu_em       timestamptz,
    avisado       boolean not null default false,
    detalhe       jsonb not null default '{}'::jsonb
);

comment on table public.sentinela_heartbeats is
    'Sinal de vida da sonda externa de login. O valor da linha verde nao e o conteudo dela, e existir: a AUSENCIA e o que dispara sentinela:parou-de-reportar.';

create index if not exists idx_sentinela_heartbeats_recebido
    on public.sentinela_heartbeats (recebido_em desc);

-- Tabela de encanamento: ninguem no front le. O que o Super Admin precisa ver
-- e o INCIDENTE, que ja aparece no painel junto com todo o resto.
alter table public.sentinela_heartbeats enable row level security;
revoke all on table public.sentinela_heartbeats from anon, authenticated;
grant select, insert, delete on table public.sentinela_heartbeats to service_role;

-- ------------------------------------------------------------------- catalogo

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, severidade_padrao, somente_painel, is_active)
values
    ('sentinela:aplicacao-inacessivel', 'exato', 'detector',
     'mede de fora da plataforma se a aplicacao esta acessivel, reproduzindo o que o navegador faz no login',
     'Abrir https://app.clinbia.ai numa aba anonima e conferir. Esta medicao vem de FORA e reproduz o navegador, inclusive o preflight de CORS: o painel pode estar verde e isto vermelho ao mesmo tempo, porque as coberturas sao diferentes.',
     'critica', true, true),
    ('sentinela:parou-de-reportar', 'exato', 'detector',
     'acusa quando a sonda externa de login para de dar sinal de vida',
     'Possivel queda da VPS que hospeda o n8n e a sonda (manager01). Conferir a VPS e o servico: systemctl status sentinela-login.timer. Segunda hipotese, se a VPS estiver de pe: a propria function sentinela-heartbeat parou de gravar — neste caso a aplicacao esta bem e quem quebrou fomos nos.',
     'critica', false, true)
on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       severidade_padrao = excluded.severidade_padrao,
       somente_painel    = excluded.somente_painel,
       is_active         = true,
       updated_at        = now();

-- -------------------------------------------------------------------- varredor

create or replace function public.sentinela_health_scan()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    v_ultimo timestamptz;
    v_min    integer;
    v_res    jsonb;
begin
    select max(recebido_em) into v_ultimo from public.sentinela_heartbeats;

    -- Nunca houve sinal = a sentinela ainda nao foi instalada. Alertar aqui
    -- seria a plataforma reclamando, de 5 em 5 minutos e para sempre, de uma
    -- caixa que nao existe — ruido nascido de decisao nossa. Ela comeca a
    -- vigiar no minuto em que houver o que vigiar.
    if v_ultimo is null then
        return jsonb_build_object('estado', 'nunca_reportou');
    end if;

    -- 7 dias bastam: isto e sinal de vida, nao serie historica. Quem quiser
    -- saber o que aconteceu olha o incidente, que nao e podado aqui.
    delete from public.sentinela_heartbeats where recebido_em < now() - interval '7 days';

    v_min := floor(extract(epoch from (now() - v_ultimo)) / 60)::int;

    if v_min < 10 then
        return jsonb_build_object('estado', 'viva', 'minutos', v_min);
    end if;

    v_res := public.incident_record(jsonb_build_object(
        'source', 'db_job',
        'component', 'sentinela:parou-de-reportar',
        'error_message', format(
            'A sonda externa de login nao reporta ha %s min (ultimo sinal em %s). Possivel queda da VPS do n8n.',
            v_min,
            to_char(v_ultimo at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')),
        -- Uma hora: silencio prolongado reincide no mesmo incidente em vez de
        -- virar uma linha nova a cada passada do cron.
        'request_id', 'sentinela-muda:' || to_char(now(), 'YYYYMMDDHH24'),
        'context', jsonb_build_object(
            'ultimo_sinal', v_ultimo,
            'minutos_em_silencio', v_min)));

    if coalesce((v_res ->> 'skipped')::boolean, false) is false then
        perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'critica');
    end if;

    return jsonb_build_object('estado', 'muda', 'minutos', v_min, 'incidente', v_res);
end;
$$;

comment on function public.sentinela_health_scan() is
    'Acusa silencio da sonda externa de login (>= 10 min). Fica calado enquanto nunca houve sinal: sem sentinela instalada nao ha o que vigiar.';

revoke all on function public.sentinela_health_scan() from public, anon, authenticated;
grant execute on function public.sentinela_health_scan() to service_role;

-- ------------------------------------------------------------------------ cron

select cron.unschedule('sentinela-health-watch')
 where exists (select 1 from cron.job where jobname = 'sentinela-health-watch');

select cron.schedule(
    'sentinela-health-watch',
    '5-59/5 * * * *',
    $cron$select public.sentinela_health_scan();$cron$);
