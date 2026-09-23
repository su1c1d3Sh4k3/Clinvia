-- Erro de entrada: contar sem alertar, e alertar no PADRAO.
--
-- O QUE MUDOU DO LADO DO CODIGO (mesmo commit)
-- `_shared/api-errors.ts` passou a devolver 400 — e nao 500 — para uma lista
-- FECHADA de SQLSTATE que so acontece quando a entrada esta errada:
--   22P02 texto onde se espera uuid/numero/enum
--   22007 formato de data/hora invalido
--   22008 data/hora fora de faixa
--   23514 valor violando CHECK
-- 23503 (FK) e 23505 (unique) ficaram DE FORA por decisao do user: os dois
-- tanto podem ser entrada ruim quanto defeito nosso, e o codigo e o mesmo.
--
-- O RISCO DESSA MUDANCA, E O QUE ESTA MIGRATION FAZ A RESPEITO
-- `report: false` resolve o ruido e cria cegueira. Foi cegueira que deixou o bug
-- do `appointment_id` viver de 16/09 a 23/09/2026: sete dias em que cada
-- ocorrencia isolada parecia irrelevante enquanto o PADRAO era o defeito.
--
-- Entao o 400 nunca e mudo. Toda ocorrencia vira evento na familia
-- `entrada:<function>`, catalogada `somente_painel = true`: conta, agrupa,
-- aparece no painel e NUNCA vira mensagem sozinha. Quem fala sao dois
-- detectores sobre a repeticao.
--
-- POR QUE DOIS DETECTORES E NAO UM LIMIAR POR HORA
-- Medi antes de escrever: o trafego real do bug do `appointment_id` foram 4
-- eventos em 7 dias (16/09, 17/09 e dois em 23/09). NENHUM limiar por hora
-- pegaria isso — a regra que o user pediu nao teria achado o caso que ele citou
-- como motivo. A regra que teria disparado, e no dia 17/09, e LENTA: o mesmo
-- alvo errando em dois dias diferentes.
--   A. SURTO       >= 10 ocorrencias do mesmo alvo em 1h  -> alta  (aviso na hora)
--   B. PERSISTENCIA >= 2 ocorrencias em >= 2 dias distintos em 7d -> media (resumo de 2h)
-- A lenta e a que acha defeito de contrato; a rapida e a que acha integracao
-- nova apontada para o campo errado. Sao problemas diferentes.
--
-- Rollback: 20260923540000_entrada_invalida_detector_rollback.sql
-- Teste:    supabase/tests/security/item_entrada_invalida/

-- ── 1. chave de desligar ─────────────────────────────────────────────────────
alter table public.llm_platform_settings
    add column if not exists alert_input_rate_enabled boolean not null default true;

comment on column public.llm_platform_settings.alert_input_rate_enabled is
    'Liga os detectores de taxa de erro de ENTRADA. Desligar nao para a contagem: os eventos continuam entrando em entrada:<function> e no painel, so nao viram incidente de padrao.';

-- ── 2. catalogo ──────────────────────────────────────────────────────────────
insert into public.incident_component_catalog
    (component, match_tipo, natureza, severidade_padrao, somente_painel, descricao, acao_padrao)
values
    ('entrada:', 'prefixo', 'detector', 'baixa', true,
     'Registro de chamada recusada porque o VALOR enviado estava errado — texto onde se espera '
     || 'identificador, data malformada, valor fora da regra da tabela. Nao e falha da plataforma: '
     || 'a API respondeu 400 corretamente. Existe para que o padrao possa ser medido.',
     'Nao ha nada a corrigir em uma ocorrencia isolada. O nome do componente diz qual function '
     || 'recusou e a rota do evento diz qual acao e qual SQLSTATE. Se a repeticao importar, ela '
     || 'chega por entrada-invalida:surto ou entrada-invalida:persistente — estes sim pedem acao.'),

    ('entrada-invalida:surto', 'exato', 'detector', 'alta', false,
     'Dispara quando um mesmo alvo (function + acao + SQLSTATE) acumula 10 ou mais recusas por '
     || 'valor invalido dentro de uma hora. Volume assim nao e usuario errando: e um chamador '
     || 'automatico mandando o campo errado em laco.',
     'O alvo esta no contexto do incidente. Veja os ultimos eventos da familia entrada: com essa '
     || 'mesma rota e leia o campo detalhe — ele traz o valor cru que o banco recusou. Se o '
     || 'chamador for o n8n, o conserto quase sempre e a descricao da tool, nao a API.'),

    ('entrada-invalida:persistente', 'exato', 'detector', 'media', false,
     'Dispara quando o mesmo alvo erra a entrada em dois ou mais DIAS distintos dentro de 7 dias. '
     || 'E o sinal lento: pouco volume, mas repetindo — a assinatura de contrato mal entendido '
     || 'entre quem chama e a API, nao de um engano pontual.',
     'Compare os eventos dos dois dias: valor recusado igual nos dois indica que o chamador sempre '
     || 'manda aquele formato, e o conserto e na origem. Este detector existe porque o bug do '
     || 'appointment_id (rotulo humano no lugar do UUID) passou 7 dias invisivel em 4 ocorrencias.')

on conflict (component) do update set
    match_tipo        = excluded.match_tipo,
    natureza          = excluded.natureza,
    severidade_padrao = excluded.severidade_padrao,
    somente_painel    = excluded.somente_painel,
    descricao         = excluded.descricao,
    acao_padrao       = excluded.acao_padrao,
    is_active         = true,
    updated_at        = now();

-- ── 3. o varredor ────────────────────────────────────────────────────────────
-- SQL puro e sem HTTP de proposito: um detector que depende de chave para
-- funcionar tem o mesmo modo de falha que o alert-notify teve (401 silencioso
-- por semanas). Este le tabela e escreve tabela.
create or replace function public.entrada_invalida_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado  boolean;
    v_surtos  integer := 0;
    v_lentos  integer := 0;
    v_msg     text;
    v_rota    text;
    v_fp      text;
    r         record;
begin
    select coalesce(s.alert_input_rate_enabled, true)
      into v_ligado
      from public.llm_platform_settings s
     limit 1;

    if not coalesce(v_ligado, true) then
        return jsonb_build_object('ok', true, 'desligado', true);
    end if;

    -- A. SURTO: mesmo alvo, 10+ em uma hora.
    for r in
        select e.component                                  as alvo,
               coalesce(e.failed_node, 'rota_nao_informada') as rota,
               count(*)                                     as n
          from public.incident_events e
         where e.component like 'entrada:%'
           and e.received_at >= now() - interval '1 hour'
         group by 1, 2
        having count(*) >= 10
    loop
        v_rota := r.alvo || '|' || r.rota;
        v_msg  := format(
            '%s recusas por valor invalido em %s (%s) na ultima hora',
            r.n, r.alvo, r.rota
        );

        -- Silencio de 6h por alvo: sem isto o cron reabriria o placar a cada
        -- passagem e o contador de recorrencia dispararia reenvio sozinho.
        v_fp := public.incident_fingerprint('db_job', 'entrada-invalida:surto', v_rota, v_msg);
        if exists (
            select 1 from public.incidents i
             where i.fingerprint = v_fp
               and i.status <> 'resolved'
               and i.last_seen >= now() - interval '6 hours'
        ) then
            continue;
        end if;

        perform public.incident_record(jsonb_build_object(
            'source',     'db_job',
            'component',  'entrada-invalida:surto',
            'route',      v_rota,
            'origem',     'cron',
            'http_code',  400,
            'error_message', v_msg,
            'context', jsonb_build_object(
                'alvo', r.alvo, 'rota', r.rota, 'ocorrencias', r.n, 'janela', '1 hora'
            )
        ));
        v_surtos := v_surtos + 1;
    end loop;

    -- B. PERSISTENCIA: mesmo alvo em 2+ dias distintos dentro de 7 dias.
    -- O dia e contado no fuso de Sao Paulo: "dois dias distintos" tem que ser
    -- dois dias para quem le o alerta, nao para o UTC.
    for r in
        select e.component                                  as alvo,
               coalesce(e.failed_node, 'rota_nao_informada') as rota,
               count(*)                                     as n,
               count(distinct (e.received_at at time zone 'America/Sao_Paulo')::date) as dias
          from public.incident_events e
         where e.component like 'entrada:%'
           and e.received_at >= now() - interval '7 days'
         group by 1, 2
        having count(*) >= 2
           and count(distinct (e.received_at at time zone 'America/Sao_Paulo')::date) >= 2
    loop
        v_rota := r.alvo || '|' || r.rota;
        v_msg  := format(
            'valor invalido repetindo em %s (%s): %s ocorrencias em %s dias distintos nos ultimos 7 dias',
            r.alvo, r.rota, r.n, r.dias
        );

        -- Sinal lento: uma vez por dia por alvo basta.
        v_fp := public.incident_fingerprint('db_job', 'entrada-invalida:persistente', v_rota, v_msg);
        if exists (
            select 1 from public.incidents i
             where i.fingerprint = v_fp
               and i.status <> 'resolved'
               and i.last_seen >= now() - interval '24 hours'
        ) then
            continue;
        end if;

        perform public.incident_record(jsonb_build_object(
            'source',     'db_job',
            'component',  'entrada-invalida:persistente',
            'route',      v_rota,
            'origem',     'cron',
            'http_code',  400,
            'error_message', v_msg,
            'context', jsonb_build_object(
                'alvo', r.alvo, 'rota', r.rota, 'ocorrencias', r.n,
                'dias_distintos', r.dias, 'janela', '7 dias'
            )
        ));
        v_lentos := v_lentos + 1;
    end loop;

    return jsonb_build_object('ok', true, 'surtos', v_surtos, 'persistentes', v_lentos);
end;
$$;

comment on function public.entrada_invalida_scan() is
    'Varre a familia entrada:<function> e transforma REPETICAO em incidente: surto (10+/1h, alta) e persistencia (2+ ocorrencias em 2+ dias distintos/7d, media). O evento individual continua somente no painel.';

-- PITFALL do projeto: `create function` ja concede EXECUTE a PUBLIC e
-- `revoke ... from anon` NAO tira o grant de PUBLIC. Revogar de PUBLIC primeiro.
revoke all on function public.entrada_invalida_scan() from public, anon, authenticated;
grant execute on function public.entrada_invalida_scan() to service_role;

-- ── 4. cron ──────────────────────────────────────────────────────────────────
-- 10 em 10 minutos: o surto tem janela de 1h, entao 6 passagens por janela dao
-- deteccao rapida sem transformar o proprio detector em carga.
select cron.unschedule('entrada-invalida-scan')
 where exists (select 1 from cron.job where jobname = 'entrada-invalida-scan');

select cron.schedule(
    'entrada-invalida-scan',
    '*/10 * * * *',
    $cron$ select public.entrada_invalida_scan(); $cron$
);
