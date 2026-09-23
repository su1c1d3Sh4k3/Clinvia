-- Gravidade deixa de depender da IA + familias que faltavam no catalogo.
--
-- O BURACO QUE ESTA MIGRATION FECHA
-- `20260923350000` passou a exigir critica/alta para o aviso individual. Isso
-- consertou o "media e baixa saindo na hora", mas criou coisa pior: `ai_severity`
-- e escrita pelo ANALISADOR. Com o analisador fora do ar — que e exatamente
-- quando mais se precisa de alerta — o incidente nasce com gravidade nula, nao
-- casa com critica/alta e cai no resumo de 2 em 2 horas. Um critico calado por
-- duas horas e um defeito maior do que um alerta de baixa chegando cedo.
--
-- A CORRECAO
-- Gravidade passa a ter fonte que nao depende da IA: coluna `severidade_padrao`
-- no catalogo, por componente. A gravidade EFETIVA de um incidente e
--     coalesce(ai_severity, catalogo.severidade_padrao, 'media')
-- calculada em um so lugar (`incident_severidade_efetiva`) e usada pelos tres
-- pontos de roteamento. A IA continua podendo subir ou descer — ela escreve em
-- `ai_severity`, que vence o catalogo —, mas deixa de ser a UNICA fonte.
--
-- O 'media' do fim do coalesce e o fallback de componente que nem esta
-- catalogado: nao cala (vai ao resumo) e nao grita (nao acorda ninguem por algo
-- que ninguem descreveu). Componente catalogado sempre tem valor, a coluna e NOT
-- NULL.
--
-- POR QUE UMA FUNCTION E NAO A EXPRESSAO REPETIDA TRES VEZES
-- O defeito original nasceu de duas consultas parecidas para o mesmo fim
-- (portao e corpo do resumo divergindo). Repetir o coalesce em tres funcoes
-- reproduz a mesma classe de erro: um dia alguem muda uma e esquece as outras,
-- e o sintoma e "alerta que nunca sai" ou "cron acordando para nada".
--
-- AS FAMILIAS NOVAS (segunda metade do arquivo)
-- O catalogo cobria as funcoes de plataforma mas nao cobria os CANAIS. O caso
-- mais grave: o proprio canal por onde todo alerta passa. Se ele emudecer, nada
-- avisa nada — e esse modo de falha ja aconteceu (401 do alert-notify). A linha
-- `canal:whatsapp-alertas` existe para que esse sinal tenha nome; a entrega
-- fora do WhatsApp e passo separado e ainda NAO esta feita, esta declarada no
-- `acao_padrao` da linha para nao virar promessa silenciosa.
--
-- IMPORTANTE: catalogar NAO e detectar. Estas linhas dao nome, natureza,
-- gravidade e acao a incidentes desses componentes. Os detectores de
-- `canal:whatsapp-alertas`, `uazapi:instancia-desconectada` e
-- `n8n:no-silencioso` ainda precisam ser escritos — sem eles a linha fica
-- inerte, que e melhor do que um incidente chegando sem descricao.
--
-- Rollback: `20260923360000_severidade_padrao_e_catalogo_rollback.sql`.
-- Teste:    `supabase/tests/security/item_severidade_padrao/`.

-- ── 1. a coluna e a fonte unica da gravidade efetiva ─────────────────────────

alter table public.incident_component_catalog
    add column if not exists severidade_padrao text not null default 'media';

alter table public.incident_component_catalog
    drop constraint if exists incident_component_catalog_severidade_padrao_check;
alter table public.incident_component_catalog
    add constraint incident_component_catalog_severidade_padrao_check
    check (severidade_padrao in ('critica', 'alta', 'media', 'baixa'));

comment on column public.incident_component_catalog.severidade_padrao is
    'Gravidade que vale enquanto a IA nao analisou (ou quando o analisador esta fora do ar). A IA pode subir ou descer depois escrevendo em incidents.ai_severity, que vence esta coluna.';

-- Quem nasce alta ou critica por natureza, analisador no ar ou nao.
update public.incident_component_catalog set severidade_padrao = 'critica', updated_at = now()
 where component in ('alert-notify', 'openai:sem_credito');

update public.incident_component_catalog set severidade_padrao = 'alta', updated_at = now()
 where component in ('automation-send-queue', 'api-public-booking', 'campaign-dispatch',
                     'delivery-automation-worker', 'monitoramento:analise-indisponivel',
                     'openai:saldo_baixo', 'openai:sync_failure', 'instagram:token-vencido',
                     'cron-http:', 'cron:');

update public.incident_component_catalog set severidade_padrao = 'baixa', updated_at = now()
 where component in ('monitoramento:componente-nao-catalogado', 'simulacao-de-alerta',
                     'openai:zero_usage', 'openai:ancora_de_saldo_vencida');

-- O resolvedor precisa expor a coluna nova ANTES de alguem le-la: quem calcula a
-- gravidade efetiva le o catalogo por esta function, nao pela tabela.
-- `create or replace` nao muda a lista de colunas de um `returns table`, entao
-- expor severidade_padrao exige drop + create. Nenhuma view nem coluna gerada
-- depende desta function; quem chama sao as funcoes de roteamento e a edge
-- `alert-notify`, todas recriadas/redeployadas junto.
drop function if exists public.incident_component_info(text);
create function public.incident_component_info(p_component text)
returns table (
    component         text,
    natureza          text,
    descricao         text,
    acao_padrao       text,
    somente_painel    boolean,
    severidade_padrao text,
    catalogado        boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.component, c.natureza, c.descricao, c.acao_padrao,
           c.somente_painel, c.severidade_padrao, true
      from public.incident_component_catalog c
     where c.is_active
       and (
            (c.match_tipo = 'exato'   and c.component = p_component)
         or (c.match_tipo = 'prefixo' and p_component like c.component || '%')
       )
     order by case when c.match_tipo = 'exato' then 0 else 1 end,
              length(c.component) desc
     limit 1;
$$;

comment on function public.incident_component_info(text) is
    'Resolve a descricao de um componente para o alerta: chave exata vence prefixo, prefixo mais longo vence prefixo curto. Devolve zero linhas quando o componente nao esta catalogado. `somente_painel` diz se ele pode virar mensagem; `severidade_padrao` e a gravidade que vale sem analise da IA.';

revoke all on function public.incident_component_info(text) from public, anon, authenticated;
grant execute on function public.incident_component_info(text) to service_role;

create or replace function public.incident_severidade_efetiva(
    p_component text,
    p_ai_severity text
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
    -- A IA vence o catalogo (ela viu o erro); o catalogo vence o silencio.
    select coalesce(
        nullif(p_ai_severity, ''),
        (select c.severidade_padrao from public.incident_component_info(p_component) c),
        'media'
    );
$$;

comment on function public.incident_severidade_efetiva(text, text) is
    'Gravidade que vale para ROTEAR um incidente: ai_severity se a IA analisou, senao a severidade_padrao do catalogo, senao media. Fonte unica das tres funcoes de roteamento — nao repetir esta expressao em nenhuma delas.';

revoke all on function public.incident_severidade_efetiva(text, text) from public, anon, authenticated;
grant execute on function public.incident_severidade_efetiva(text, text) to service_role;

-- ── 2. os tres pontos de roteamento passam a usar a gravidade efetiva ────────

create or replace function public.incident_claim_for_notification(p_limit integer default 10)
returns table (
    id uuid, source text, component text, ai_severity text, ai_summary text,
    ai_probable_cause text, ai_origin text, ai_fix_system text, ai_fix_n8n text,
    event_count integer, first_seen timestamptz, last_seen timestamptz,
    owner_id uuid, affected_tenants uuid[], analyzed_at timestamptz,
    kind text, ocorrencias_novas integer, desde timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado   boolean;
    v_cooldown integer;
begin
    select coalesce(s.alert_notify_enabled, true),
           greatest(0, coalesce(s.incident_notify_cooldown_min, 60))
      into v_ligado, v_cooldown
      from public.llm_platform_settings s limit 1;

    if v_ligado is false then
        return;
    end if;

    return query
    with alvo as (
        select i.id,
               case when i.notified_count = 0 then 'individual' else 'recorrencia' end as kind,
               greatest(0, i.event_count - i.notified_at_event_count)                  as novas,
               i.last_notified_at                                                      as desde
          from public.incidents i
         where i.status <> 'resolved'
           -- AVISO IMEDIATO E SO PARA CRITICA E ALTA. Gravidade EFETIVA: sem
           -- analise da IA vale a do catalogo, entao analisador fora do ar nao
           -- atrasa critico por 2 horas.
           and public.incident_severidade_efetiva(i.component, i.ai_severity)
               in ('critica', 'alta')
           -- analisado sai na hora; sem analise espera 2 minutos e entao sai
           -- degradada, com o erro bruto. Nunca fica presa.
           and (i.analyzed_at is not null
                or i.created_at < now() - interval '2 minutes')
           -- manutencao interna da plataforma fica no painel e nao vira mensagem
           and not coalesce(
                (select ci.somente_painel from public.incident_component_info(i.component) ci),
                false)
           -- nao pisa em despacho que ja esta em andamento
           and (i.notify_claimed_at is null
                or i.notify_claimed_at < now() - interval '5 minutes')
           -- respeita o recuo de quem acabou de falhar
           and (i.notify_next_attempt_at is null
                or i.notify_next_attempt_at <= now())
           and (
                i.notified_count = 0
                or (
                    -- so volta a falar se continuou acontecendo DEPOIS do ultimo aviso
                    i.event_count > i.notified_at_event_count
                    and i.last_notified_at < now() - make_interval(mins => v_cooldown)
                )
           )
         order by
            case public.incident_severidade_efetiva(i.component, i.ai_severity)
                 when 'critica' then 0 else 1 end,
            i.last_seen desc
         limit greatest(1, coalesce(p_limit, 10))
         for update skip locked
    )
    update public.incidents i
       set notify_claimed_at = now(),
           updated_at        = now()
      from alvo a
     where i.id = a.id
    returning i.id, i.source, i.component, i.ai_severity, i.ai_summary, i.ai_probable_cause,
              i.ai_origin, i.ai_fix_system, i.ai_fix_n8n, i.event_count, i.first_seen,
              i.last_seen, i.owner_id, i.affected_tenants, i.analyzed_at,
              a.kind, a.novas, a.desde;
end;
$$;

revoke all on function public.incident_claim_for_notification(integer) from public, anon, authenticated;
grant execute on function public.incident_claim_for_notification(integer) to service_role;

create or replace function public.incident_notify_pending_count()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
    select count(*)::integer
      from public.incidents i
     where i.status <> 'resolved'
       and public.incident_severidade_efetiva(i.component, i.ai_severity) in ('critica', 'alta')
       and (i.analyzed_at is not null or i.created_at < now() - interval '2 minutes')
       and not coalesce(
            (select ci.somente_painel from public.incident_component_info(i.component) ci),
            false)
       and (i.notify_claimed_at is null or i.notify_claimed_at < now() - interval '5 minutes')
       and (i.notify_next_attempt_at is null or i.notify_next_attempt_at <= now())
       and (
            i.notified_count = 0
            or (i.event_count > i.notified_at_event_count
                and i.last_notified_at < now() - make_interval(mins => greatest(0, coalesce(
                    (select s.incident_notify_cooldown_min from public.llm_platform_settings s limit 1), 60))))
       );
$$;

revoke all on function public.incident_notify_pending_count() from public, anon, authenticated;
grant execute on function public.incident_notify_pending_count() to service_role;

create or replace function public.incident_summary_pending(p_hours integer default 2)
returns table (
    id           uuid,
    component    text,
    ai_summary   text,
    ai_severity  text,
    event_count  integer,
    last_seen    timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
    -- Devolve a gravidade EFETIVA em ai_severity: o resumo diz "media" para um
    -- incidente que a IA nao analisou mas o catalogo classificou. Mostrar "(nula)"
    -- na mensagem so faria quem le perguntar o que e nulo.
    select i.id, i.component, i.ai_summary,
           public.incident_severidade_efetiva(i.component, i.ai_severity),
           i.event_count, i.last_seen
      from public.incidents i
     where i.status <> 'resolved'
       -- sem `is null` solto: nulo ja foi resolvido para media/baixa/alta/critica
       -- pelo catalogo, e o que for alta/critica sai no aviso individual.
       and public.incident_severidade_efetiva(i.component, i.ai_severity) in ('media', 'baixa')
       and i.last_seen >= now() - make_interval(hours => greatest(1, coalesce(p_hours, 2)))
       and not coalesce(
            (select ci.somente_painel from public.incident_component_info(i.component) ci),
            false)
     order by i.event_count desc, i.last_seen desc
     limit 20;
$$;

comment on function public.incident_summary_pending(integer) is
    'O que entra no resumo agrupado: aberto, gravidade EFETIVA media ou baixa, com evento novo na janela, fora da marca somente_painel. Usada pelo portao do cron E pelo corpo da mensagem — lista vazia significa que o resumo nao e enviado.';

revoke all on function public.incident_summary_pending(integer) from public, anon, authenticated;
grant execute on function public.incident_summary_pending(integer) to service_role;

-- ── 3. familias que faltavam no catalogo ─────────────────────────────────────

insert into public.incident_component_catalog
    (component, match_tipo, natureza, severidade_padrao, somente_painel, descricao, acao_padrao)
values

-- O canal por onde todo alerta passa. Nao pode se anunciar por si mesmo.
('canal:whatsapp-alertas', 'exato', 'detector', 'critica', false,
 'O canal de WhatsApp por onde a plataforma manda os alertas de incidente (numero do Bruno Admin na Meta Cloud). Este sinal diz que o canal emudeceu: o envio do alerta foi recusado pela Meta, ou a chamada ao Graph falhou, ou a janela de 24h fechou e nao ha template aprovado. Enquanto ele estiver mudo, NENHUM outro alerta chega — inclusive os criticos.',
 'Este alerta nao pode chegar por WhatsApp, porque o WhatsApp e justamente o que falhou. Confira o painel de incidentes. A causa mais comum ja vista foi chave errada no despacho (401) e a segunda e a janela de 24h fechada sem template aprovado. ATENCAO: a entrega deste sinal por caminho alternativo (e-mail) ainda NAO esta implementada — hoje ele so aparece no painel.'),

('uzapi-', 'prefixo', 'servico', 'alta', false,
 'Funcoes do provedor UAZAPI (WhatsApp nao oficial): criar, conectar, apagar instancia e a checagem de saude. E o canal que os pacientes dos clientes usam para falar com a clinica.',
 'Falha aqui costuma tirar a clinica do ar para os pacientes. Confira em Conexoes se a instancia esta conectada e, no painel da UAZAPI, se o numero nao caiu.'),

('evolution-send-message', 'exato', 'servico', 'alta', false,
 'Roteador de envio de mensagem: toda mensagem sai por aqui e ele decide entre UAZAPI e Meta Cloud conforme a instancia. Falha nele derruba o envio dos DOIS provedores de uma vez.',
 'Veja se a falha e so de um provedor (entao o problema esta no provedor) ou dos dois (entao esta no roteador). Mensagem que nao saiu fica na conversa marcada como falha.'),

('uazapi:instancia-desconectada', 'exato', 'detector', 'alta', false,
 'Uma instancia UAZAPI de um cliente saiu do ar: o celular desconectou, a sessao caiu ou o numero foi banido. Detector, nao falha de codigo.',
 'Peca ao cliente para reconectar pelo QR em Conexoes. Se repetir no mesmo numero em pouco tempo, suspeite de banimento ou de celular sem bateria/rede.'),

('meta-send-message', 'exato', 'servico', 'alta', false,
 'Envio pela Meta Cloud API (WhatsApp oficial). Cobre mensagem de atendimento, campanha e automacao dos clientes que usam o numero oficial.',
 'Confira a qualidade e o limite do numero em Campanhas. Recusa por janela de 24h fechada exige template aprovado; recusa por limite de envio significa que o tier da conta acabou.'),

('instagram-refresh-token', 'exato', 'servico', 'alta', false,
 'Rotina que renova o token de acesso do Instagram enquanto ele ainda e valido. Se ela parar, o token vence sozinho em 60 dias e o Direct do cliente para de funcionar sem nenhum erro visivel ate la.',
 'Falha aqui e silenciosa e so aparece semanas depois. Confira se as contas ainda tem token valido antes de tratar como incidente pequeno. O detector `instagram:token-vencido` e a consequencia deste servico ter falhado.'),

('google-calendar-', 'prefixo', 'servico', 'media', false,
 'Integracao com o Google Calendar dos profissionais: leitura periodica, sincronizacao e webhook. Falha aqui faz a agenda do sistema e a do Google divergirem.',
 'O agendamento no sistema continua funcionando; o que quebra e o espelho no Google. Costuma ser token expirado do profissional — ele precisa reconectar a agenda.'),

('gemini:', 'prefixo', 'servico', 'baixa', false,
 'Modelo Gemini, usado como FALLBACK quando o provedor principal nao responde. O consumo dele e irrelevante para custo e nao deve gerar alarme de gasto.',
 'Falha do fallback nao derruba nada sozinha — ela so importa se o provedor principal tambem estiver falhando. Confira o principal antes.'),

('n8n:no-silencioso', 'exato', 'detector', 'alta', false,
 'Um no falhou DENTRO de uma execucao do n8n que terminou marcada como sucesso. Como a execucao nao aparece com erro, a falha nao aparece em lugar nenhum: a IA responde sem a ferramenta, ou o agendamento nao e gravado, e ninguem percebe.',
 'Abra a execucao citada no n8n e veja o no que falhou. Este e o modo de falha mais dificil de achar sem este alerta, porque tudo parece verde.'),

('cron-health-watch', 'exato', 'servico', 'alta', false,
 'O vigia dos crons: le o resultado HTTP real de cada chamada disparada por agendamento e transforma falha em incidente. E ele quem descobre cron que diz "sucesso" e na verdade tomou 401 ou timeout.',
 'Se o proprio vigia falhar, todas as quebras de cron voltam a ficar invisiveis — inclusive a do despacho de alertas. Trate como prioridade mesmo quando nada mais parecer errado.')

on conflict (component) do update set
    natureza          = excluded.natureza,
    severidade_padrao = excluded.severidade_padrao,
    somente_painel    = excluded.somente_painel,
    descricao         = excluded.descricao,
    acao_padrao       = excluded.acao_padrao,
    is_active         = true,
    updated_at        = now();
