-- Catalogo da Etapa 2: cobertura das edge functions e dos provedores externos.
--
-- A partir do envelope `serveMonitored`, TODA resposta 5xx de qualquer uma das
-- 133 functions vira incidente, e o `fetchProvider` passa a nomear a falha do
-- terceiro. Sem catalogo, cada um desses componentes chegaria como:
--
--   * severidade `media` (o padrao de quem nao esta catalogado), e
--   * um incidente extra do detector `monitoramento:componente-nao-catalogado`.
--
-- O segundo e o problema: seriam ~130 linhas de "nao conheco este componente"
-- antes de o painel dizer uma unica coisa util.
--
-- ORCAMENTO DE RUIDO — medido nos ultimos 7 dias de trafego real, nao estimado
-- no chute (268 respostas 5xx, das quais 78 sao HTTP 500 construido pelo nosso
-- codigo; o resto e 502/504/520/522/546 do gateway, que nem chega na function):
--
--   webhook-handle-message  39    ai-analyze-conversation 13
--   api-scheduling           7    process-auto-follow-up   4
--   transcribe-audio         3    ai-suggest-response      3
--   ia-workflow-webhook      3    auto-close-worker        3
--   api-public-booking       2    api-crm                  1
--
-- Por isso TUDO o que entra aqui entra em `media` ou `baixa` — ou seja, no
-- painel e em lugar nenhum mais. As unicas que ja disparam telefone sao as que
-- ja estavam catalogadas como alta/critica antes desta migration, e nessas o
-- volume medido foi de 9 eventos em 7 dias que o fingerprint agrupa em 2
-- incidentes. Promover qualquer linha daqui e decisao para depois de uma semana
-- de painel, com numero na mao.

-- ---------------------------------------------------------------------------
-- 1. Provedores externos: o componente e do PROVEDOR, nao da function
-- ---------------------------------------------------------------------------
-- `fetchProvider` gera `<provedor>:<motivo>` com motivo em
-- {credencial_recusada, limite_de_uso, fora_do_ar, timeout}. Um prefixo por
-- provedor cobre os quatro e qualquer motivo novo que venha depois.
--
-- `openai:`, `n8n:` e `gemini:` ja existiam como prefixo e nao sao tocados:
-- mexer neles reabriria a calibragem que ja foi feita.

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, severidade_padrao, somente_painel)
values
    ('meta:', 'prefixo', 'servico',
     'A Meta (Graph API do WhatsApp Oficial e do Instagram) recusou ou nao respondeu. O motivo vem depois dos dois-pontos: credencial_recusada (token da pagina/WABA vencido ou revogado), limite_de_uso, fora_do_ar ou timeout.',
     'Conferir o token da instancia em Conexoes. Se for credencial_recusada, o envio esta parado para aquela conta ate reconectar; os demais motivos costumam passar sozinhos.',
     'media', false),

    ('uazapi:', 'prefixo', 'servico',
     'A UAZAPI (WhatsApp nao oficial) recusou ou nao respondeu. Vale para envio, criacao de instancia e busca de foto de perfil.',
     'Conferir se a instancia esta conectada. credencial_recusada aponta para token trocado; fora_do_ar e da UAZAPI e nao tem acao do nosso lado alem de esperar.',
     'media', false),

    ('google:', 'prefixo', 'servico',
     'A API do Google (OAuth e Google Calendar) recusou ou nao respondeu. credencial_recusada aqui quase sempre e refresh token morto de um profissional especifico.',
     'Ver qual profissional esta no contexto do incidente e pedir para reconectar o Google Calendar dele. A agenda dos outros nao e afetada.',
     'media', false),

    ('resend:', 'prefixo', 'servico',
     'O Resend recusou ou nao respondeu. Afeta e-mail transacional e a segunda via dos alertas criticos.',
     'Se for credencial_recusada, a chave do Resend foi trocada ou revogada — o canal de e-mail dos alertas fica mudo junto, entao vale olhar rapido.',
     'media', false)
on conflict (component) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Familias de edge function
-- ---------------------------------------------------------------------------
-- Prefixos, nao 133 linhas exatas. Linha exata so existe quando ha uma acao
-- diferente a recomendar; para o resto, o que o painel precisa saber e a que
-- parte do produto a function pertence e o que fazer com uma falha dela.
--
-- Casamento: exato vence prefixo, e entre prefixos vence o mais longo. Ou seja,
-- as linhas exatas que ja existem (api-scheduling, meta-send-message, ...)
-- continuam valendo exatamente como antes.

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, severidade_padrao, somente_painel)
values
    ('api-', 'prefixo', 'servico',
     'API publica consumida pela IA do n8n ou pelo link de agendamento. Uma falha aqui significa que a IA recebeu erro no lugar de resposta.',
     'Ler a origem do incidente: se for ia_n8n, o pedido veio da IA e o texto do erro costuma dizer qual campo ela mandou errado. Erro repetido com a mesma rota e defeito nosso.',
     'media', false),

    ('ai-', 'prefixo', 'servico',
     'Recurso de IA interno do painel (analise de conversa, sugestao de resposta, copiloto). Falha aqui degrada a experiencia mas nao para atendimento.',
     'Verificar se e falha de provedor (o incidente do provedor aparece separado, com o nome dele). Sem provedor envolvido, e defeito nosso.',
     'media', false),

    ('meta-', 'prefixo', 'servico',
     'Function do canal WhatsApp Oficial (onboarding, templates, qualidade, webhook). Nao confundir com o componente `meta:`, que e a Graph API respondendo mal.',
     'Se vier junto com um incidente `meta:`, a causa e do lado da Meta e esta function e so a vitima.',
     'media', false),

    ('instagram-', 'prefixo', 'servico',
     'Function do canal Instagram Direct (OAuth, webhook, envio, renovacao de token).',
     'Falha de token tem componente proprio (instagram:token-vencido). Aqui sobra o resto: webhook malformado, envio recusado, enriquecimento de perfil.',
     'media', false),

    ('webhook-', 'prefixo', 'servico',
     'Entrada de mensagem vinda do provedor. E o caminho mais quente do produto: falha sustentada aqui e mensagem de paciente que nao aparece no inbox.',
     'Olhar o volume antes do texto: uma falha isolada o provedor reentrega. Falha continuada por mais de alguns minutos e perda de mensagem e precisa de acao imediata.',
     'media', false),

    ('admin-', 'prefixo', 'servico',
     'Function do painel interno (super admin). Nao afeta cliente nenhum.',
     'Tratar como manutencao: nao ha impacto em atendimento, agenda ou cobranca.',
     'baixa', false),

    ('delivery-automation-', 'prefixo', 'servico',
     'Fluxo de automacao de entrega (dispatcher, worker, respond).',
     'Conferir a fila da automacao. Falha do worker segura o disparo mas nao perde o job.',
     'media', false),

    ('appointment-confirmation-', 'prefixo', 'servico',
     'Confirmacao e lembrete de agendamento (cron e resposta do paciente).',
     'Falha do cron atrasa a confirmacao do dia; falha do respond faz o botao do paciente nao surtir efeito. O segundo e mais grave porque o paciente ja agiu.',
     'media', false),

    ('campaign-', 'prefixo', 'servico',
     'Campanhas: disparo, expiracao, tomada de contato e gestao.',
     'Ver se o incidente e do disparo (afeta envio agora) ou da manutencao (afeta o placar depois).',
     'media', false),

    ('google-calendar-', 'prefixo', 'servico',
     'Sincronizacao com o Google Calendar dos profissionais.',
     'Falha isolada se resolve na proxima passada. Falha continuada no mesmo profissional aponta para conexao dele que precisa ser refeita.',
     'media', false)
on conflict (component) do nothing;

-- `google-calendar-` ja existia; o `on conflict do nothing` acima preserva a
-- linha antiga de proposito — nao e papel desta migration reescrever texto que
-- ja estava calibrado.

-- ---------------------------------------------------------------------------
-- 3. Duas linhas exatas que merecem texto proprio
-- ---------------------------------------------------------------------------
-- Estas duas concentram 52 dos 78 HTTP 500 dos ultimos 7 dias. Deixar cair no
-- prefixo generico seria jogar fora justamente o que ja sabemos sobre elas.

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao, severidade_padrao, somente_painel)
values
    ('webhook-handle-message', 'exato', 'servico',
     'Entrada de toda mensagem recebida, nos tres canais. Responde 500 de proposito quando nao consegue gravar, para que a fila reentregue em vez de perder a mensagem.',
     'Ler o codigo do Postgres no texto: 23505 e reentrega do provedor de mensagem que ja esta salva (inofensivo); 57014 e timeout de consulta e e defeito real. Qualquer outro codigo merece leitura.',
     'media', false),

    ('ai-analyze-conversation', 'exato', 'servico',
     'Analise de conversa por IA. Depende da OpenAI; quando ela recusa, esta function e quem aparece falhando.',
     'Conferir se existe incidente de provedor aberto no mesmo horario. Se existir, a causa e la e esta linha e consequencia.',
     'media', false)
on conflict (component) do nothing;
