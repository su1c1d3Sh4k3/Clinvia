-- Catalogo estatico de componentes: a linha "O QUE ESSE SERVICO FAZ" do alerta.
--
-- POR QUE UMA TABELA E NAO A IA:
-- descrever o que um componente faz e informacao fixa, escrita uma vez. Pedir
-- isso a IA a cada alerta custa token, pode alucinar e pode variar de uma
-- mensagem para a outra. Decisao do user em 23/09/2026: "e barato, nunca falha
-- e nunca alucina".
--
-- POR QUE `natureza` EXISTE:
-- ate hoje todo incidente virava a mesma frase, escrita como se fosse falha. O
-- alerta do `openai:daily_anomaly` de 23/09 saiu dizendo "Erro: falha em
-- openai:daily_anomaly" quando na verdade o detector tinha FUNCIONADO e
-- detectado um gasto fora da curva. Falha de componente e deteccao sao coisas
-- opostas e agora tem bloco e cabecalho diferentes.
--
-- POR QUE `acao_padrao` EXISTE:
-- "abrir o painel e investigar" nao e acao. Quando a IA nao souber o que fazer,
-- o alerta cai nesta coluna, que diz o que olhar PRIMEIRO e por que — escrito
-- por quem conhece o componente, nao adivinhado na hora.
--
-- REGRA DE OPERACAO (guarda pedida pelo user): linha entra SO POR MIGRATION.
-- Nada de insert ad-hoc. O texto que chega no WhatsApp dele e codigo revisado.
-- Por isso a tabela nao tem grant de insert/update para ninguem alem de
-- service_role, e o RPC de leitura nao escreve.
--
-- NADA RETROATIVO E NADA DESTRUTIVO: cria uma tabela, semeia, cria um RPC.

-- 1. Tabela --------------------------------------------------------------------
create table if not exists public.incident_component_catalog (
    component   text primary key,
    match_tipo  text not null default 'exato',
    natureza    text not null default 'servico',
    descricao   text not null,
    acao_padrao text,
    is_active   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint icc_match_tipo_chk check (match_tipo in ('exato', 'prefixo')),
    constraint icc_natureza_chk   check (natureza in ('servico', 'detector'))
);

alter table public.incident_component_catalog enable row level security;
revoke all on table public.incident_component_catalog from anon, authenticated;
grant select on table public.incident_component_catalog to service_role;

comment on table public.incident_component_catalog is
    'Uma linha por componente: o que ele faz, se e servico ou detector, e a acao padrao quando a IA nao tem sugestao. Alimenta o bloco "O QUE ESSE SERVICO FAZ" do alerta. Linhas entram SO por migration (decisao do user 23/09/2026).';
comment on column public.incident_component_catalog.match_tipo is
    'exato = o component do incidente e igual a esta chave. prefixo = casa por inicio de texto (cron:, n8n:), para familias com nome variavel. Exato sempre vence prefixo; entre prefixos vence o mais longo.';
comment on column public.incident_component_catalog.natureza is
    'servico = o componente executa algo e o incidente significa que ele FALHOU. detector = o componente vigia algo e o incidente significa que ele DETECTOU. Decide o cabecalho e o bloco do meio da mensagem.';
comment on column public.incident_component_catalog.acao_padrao is
    'Usada quando a IA nao devolve acao. Deve dizer o que olhar primeiro E por que. Nunca "abrir o painel e investigar".';

-- 2. Semente -------------------------------------------------------------------
-- Prefixos primeiro: sao a rede que impede "componente nao catalogado" para
-- familias inteiras. Depois as chaves exatas, que vencem o prefixo.
insert into public.incident_component_catalog (component, match_tipo, natureza, descricao, acao_padrao) values

-- ── familias (prefixo) ──
('cron:', 'prefixo', 'servico',
 'Tarefa agendada no banco (pg_cron). Roda sozinha em intervalo fixo e nao tem ninguem olhando enquanto funciona.',
 'Veja a ultima execucao em cron.job_run_details e a resposta HTTP correlacionada em cron_http_calls. Status "succeeded" nao prova nada: net.http_post responde no momento em que ENFILEIRA, entao a falha real so aparece no codigo HTTP.'),

('cron-http:', 'prefixo', 'detector',
 'Vigia das chamadas HTTP disparadas por tarefas agendadas. Compara cada chamada registrada em cron_http_calls com a resposta que voltou em net._http_response.',
 'O alvo esta no nome do componente. Confira o segredo que o invocador manda em x-service-key: 401 e 403 quase sempre sao o JWT legado do vault contra o sb_secret_ do ambiente da function.'),

('n8n:', 'prefixo', 'servico',
 'Workflow de IA no n8n que atende as conversas de uma conta. Recebe a mensagem do cliente, decide a resposta e chama as APIs da plataforma.',
 'Abra a execucao pelo execution_url do evento e va direto ao no que falhou. Erro em no de tool costuma ser contrato de API mudado; erro no no do modelo costuma ser credencial ou cota.'),

('openai:', 'prefixo', 'detector',
 'Vigia do consumo e do saldo da OpenAI. Le o que o sync horario gravou de uso e custo real por conta.',
 'Compare o dia corrente com os 7 anteriores em Super Admin > Minha Conta > Tokens, separando n8n de sistema. Se o sync estiver parado, o numero esta velho e nao vale decisao.'),

-- ── chaves exatas ──
('openai:daily_anomaly', 'exato', 'detector',
 'Compara o gasto diario de OpenAI de cada conta com a media dos 7 dias anteriores e dispara quando passa do fator configurado e do valor minimo em dolar. Gasto alto e estavel nao dispara: a regra exige salto E valor.',
 'Abra Super Admin > Minha Conta > Tokens da conta e separe o consumo do dia por origem (n8n x sistema). Salto de custo com volume de conversas normal aponta modelo trocado ou prompt que cresceu; salto junto com volume alto e uso real e nao precisa de acao.'),

('openai:zero_usage', 'exato', 'detector',
 'Vigia contas que costumam ter movimento e amanheceram zeradas em horario comercial. Mede requisicoes, nao custo, para nao confundir dia barato com dia parado.',
 'Confirme se a IA esta ligada para a conta: ia_config.ia_on, instances.ia_on_wpp e a fila da conversa. Zero requisicao com IA ligada costuma ser credencial do n8n apontando para o projeto errado.'),

('openai:sync_failure', 'exato', 'detector',
 'Vigia o sincronizador que baixa uso e custo real da OpenAI de hora em hora. Dispara quando passa tempo demais sem uma execucao bem sucedida.',
 'Veja a ultima linha de openai_sync_runs com status e error_message. Enquanto o sync estiver parado, TODO numero de custo do painel esta velho — inclusive os outros alertas de custo, que passam a nao valer.'),

('openai:saldo_baixo', 'exato', 'detector',
 'Vigia o saldo da organizacao na OpenAI contra a ancora manual registrada no Super Admin. A API da OpenAI nao expoe saldo, entao a base e o valor que voce informou menos o consumo desde entao.',
 'Recarregue e atualize a ancora de saldo no Super Admin. Se o valor da ancora estiver velho, o alerta pode estar certo pelo motivo errado: confira a data antes de concluir.'),

('openai:sem_credito', 'exato', 'detector',
 'Detecta recusa da OpenAI por falta de credito (insufficient_quota / HTTP 429 sem cota). Com a conta sem credito, a IA para de responder cliente.',
 'Recarregue a organizacao na OpenAI agora. Depois confira se algum fluxo caiu em modelo de fallback durante a janela sem credito — resposta que saiu por fallback silencioso deixa o dado de custo torto.'),

('openai:ancora_de_saldo_vencida', 'exato', 'detector',
 'Avisa que a ancora manual de saldo da OpenAI esta velha demais para servir de base de calculo.',
 'Abra o saldo real na OpenAI e regrave a ancora no Super Admin com a data de hoje. Enquanto estiver vencida, os alertas de saldo baixo e sem credito perdem confiabilidade.'),

('instagram:token-vencido', 'exato', 'detector',
 'Vigia a validade dos tokens de Instagram, que duram 60 dias e sao renovados por tarefa agendada enquanto ainda estao validos. Token vencido nao renova mais: exige novo OAuth.',
 'Reconecte a conta em Conexoes > Instagram. Renovar so funciona com token ainda valido, entao token ja vencido nao tem conserto automatico.'),

('cron-http:timeouts', 'exato', 'detector',
 'Vigia a proporcao de chamadas de tarefa agendada que nao devolveram codigo HTTP nenhum. O pg_net desiste em 5 segundos; function mais lenta que isso aparece aqui mesmo funcionando.',
 'Cheque quais alvos concentram os timeouts em cron_http_calls. Alvo que sempre estoura 5s nao esta necessariamente quebrado — confirme pelo log interno da propria function antes de tratar como falha.'),

('delivery-automation-worker', 'exato', 'servico',
 'Processa a fila de mensagens de automacao de entrega, um job por vez, ate esvaziar a fila ou bater o limite de tempo.',
 'Veja delivery_automation_jobs por status e last_error. Job preso em running com picked_at antigo indica execucao interrompida no meio.'),

('conversation-summary-worker', 'exato', 'servico',
 'Gera o resumo automatico de uma conversa quando o ticket e encerrado. Um resumo por ticket, nunca o acumulado do cliente.',
 'Veja conversation_summary_queue por status. Acumulo de pending com a fila andando devagar costuma ser cota da OpenAI, nao o worker.'),

('auto-close-worker', 'exato', 'servico',
 'Encerra automaticamente conversas paradas, contando o tempo sempre a partir da ultima mensagem do CLIENTE. Conversa com sessao de confirmacao de agenda e imune.',
 'Rode auto_close_scan() e compare o que ele seleciona com o que voce esperava. Conversa fechada cedo demais quase sempre e ultima mensagem do cliente com data errada, nao o timer.'),

('campaign-dispatch', 'exato', 'servico',
 'Dispara as campanhas agendadas e finaliza as que terminaram de enviar. Meta so aceita template aprovado; UAZAPI aceita texto livre.',
 'Veja a campanha em campaigns e os contatos em campaign_contacts por status. Envio aceito pela Meta ainda pode ser recusado depois, de forma assincrona — confira status failed em messages antes de concluir que entregou.'),

('alert-notify', 'exato', 'servico',
 'Leva o incidente para o WhatsApp do Super Admin, falando direto com o Graph da Meta. Texto livre dentro da janela de 24h, template como plano B.',
 'Veja incident_notifications do incidente: error_code 131047 e janela de 24h fechada (precisa de template aprovado), e 132000 e parametro de template com quebra de linha ou espacos demais.'),

('monitoramento:analise-indisponivel', 'exato', 'detector',
 'Registra que um alerta precisou sair sem a analise da IA. O despachante espera ate 2 minutos pela analise; passado isso, envia com o erro bruto e marca esta ocorrencia.',
 'Veja a ultima execucao de incident-analyze nos logs da function e a coluna analysis_claimed_at dos incidentes pendentes. Reserva antiga sem analyzed_at significa que a function morreu no meio: quase sempre e chave da OpenAI ou cota.'),

('monitoramento:componente-nao-catalogado', 'exato', 'detector',
 'Registra que chegou um incidente de um componente que nao tem linha no catalogo, entao o alerta saiu sem a explicacao do que o servico faz.',
 'O nome do componente esta na mensagem. Cadastre a linha dele em incident_component_catalog por migration — o catalogo nao aceita insert ad-hoc de proposito.'),

('simulacao-de-alerta', 'exato', 'servico',
 'Incidente ficticio criado pelo botao de simulacao do Super Admin. Serve so para provar que o caminho ate o WhatsApp esta de pe.',
 'Se esta mensagem chegou, o canal esta funcionando e nao ha nada a corrigir. Resolva o incidente no painel para tirar da fila.')

on conflict (component) do update
   set match_tipo  = excluded.match_tipo,
       natureza    = excluded.natureza,
       descricao   = excluded.descricao,
       acao_padrao = excluded.acao_padrao,
       updated_at  = now();

-- 3. Leitura -------------------------------------------------------------------
-- Resolucao: chave exata vence; na falta dela, o prefixo mais longo que casar.
-- `catalogado` false e o sinal que o alerta usa para dizer "componente nao
-- catalogado" e abrir o incidente que pede o cadastro.
create or replace function public.incident_component_info(p_component text)
returns table (
    component   text,
    natureza    text,
    descricao   text,
    acao_padrao text,
    catalogado  boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
    select c.component, c.natureza, c.descricao, c.acao_padrao, true
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
    'Resolve a descricao de um componente para o alerta: chave exata vence prefixo, prefixo mais longo vence prefixo curto. Devolve zero linhas quando o componente nao esta catalogado — quem chama trata isso como "componente nao catalogado".';

-- PITFALL: `create function` ja concede EXECUTE a PUBLIC, e `revoke ... from
-- anon` NAO tira o grant de PUBLIC. Revogar de PUBLIC e so entao conceder.
revoke all on function public.incident_component_info(text) from public, anon, authenticated;
grant execute on function public.incident_component_info(text) to service_role;
