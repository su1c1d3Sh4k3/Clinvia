-- Catálogo para os pontos que erravam em silêncio no caminho da mensagem.
--
-- 484 `console.error` sem incidente vivem neste repositório. A varredura separou
-- 12 onde o silêncio CUSTA, e esta migration dá nome, gravidade e ação a cada um
-- deles. O código que os dispara está nas edge functions; sem linha aqui o
-- catálogo não casa nada, o piso implícito vira `media` e a IA passa a ser a
-- única autora da gravidade — que é exatamente o ruído medido em 24/09.
--
-- DUAS FAMÍLIAS NOVAS, e a razão de não reaproveitar o nome pedido:
--
--   `entrada:` JÁ EXISTE (20260923540000) e quer dizer o OPOSTO do que precisamos
--   aqui: "o chamador mandou um valor errado, não é defeito nosso". Está
--   catalogada `baixa` + `somente_painel = true`, e `entrada_invalida_scan()`
--   varre `component like 'entrada:%'` para achar surto e persistência. Pôr um
--   timeout de banco no caminho da mensagem do paciente dentro dela seria
--   rebaixá-lo a painel e ainda poluir os dois detectores de taxa.
--
--   `recebimento:banco-<sqlstate> (<instância>)` = o banco recusou a escrita na
--   ENTRADA da mensagem. `recibo:banco-<sqlstate> (<instância>)` = o banco
--   recusou a escrita do COMPROVANTE de entrega. São problemas de tamanho
--   diferente e por isso têm gravidade diferente.
--
-- O `23505` continua sem reportar onde existe releitura que recupera a linha —
-- ali ele é concorrência funcionando, 27 ocorrências em 7 dias. Onde NÃO existe
-- releitura (Instagram), ele reporta, porque ali ele descarta a mensagem.
--
-- TODAS as 12 são `natureza = 'servico'`, nenhuma é `detector`. O campo decide
-- UMA palavra no alerta: "O QUE FALHOU" (serviço) × "O QUE FOI DETECTADO"
-- (detector). Detector é o varredor que roda sozinho e ENCONTRA um padrão —
-- `entrada_invalida_scan`, `cron_health_scan`. Estas 12 são relatadas pela
-- própria função no instante em que ela falhou: quem fala é o serviço.

-- Regra desta casa: migration em produção falha em vez de travar o tráfego vivo.
set lock_timeout = '5s';
set statement_timeout = '120s';

insert into public.incident_component_catalog
    (component, match_tipo, natureza, severidade_padrao, somente_painel, descricao, acao_padrao)
values
(
    'recebimento:banco-',
    'prefixo',
    'servico',
    'alta',
    false,
    'O banco recusou uma escrita no caminho de ENTRADA da mensagem. Depois do '
    'hífen vem o SQLSTATE do Postgres (57014 = statement timeout, 23505 = chave '
    'duplicada, 42501 = RLS) e entre parênteses a instância. Cada código é um '
    'incidente próprio de propósito: "banco lento" e "permissão negada" são '
    'problemas distintos e não podem somar no mesmo contador. Só aparece quando '
    'o fluxo ABSORVEU a falha (a releitura recuperou a linha e a mensagem '
    'entrou) — quando a mensagem se perde de verdade quem relata é '
    'recebimento:perdida-, que é crítica.',
    'A mensagem desta ocorrência entrou. O que este incidente diz é que ela '
    'quase não entrou, e que a próxima pode não entrar. 57014 em rajada quase '
    'sempre é trabalho nosso disputando lock com o tráfego vivo (migration, '
    'ensaio, exclusão em massa) — confira o que estava rodando na janela. '
    '42501 é regressão de RLS e não passa sozinho.'
),
(
    'recibo:banco-',
    'prefixo',
    'servico',
    'baixa',
    true,
    'O banco recusou a gravação do COMPROVANTE de entrega (entregue/lida/falhou) '
    'de uma mensagem que já existe e já saiu. Depois do hífen vem o SQLSTATE e '
    'entre parênteses a instância. O que se perde é o estado do balão na tela do '
    'atendente, não a mensagem do paciente.',
    'Painel, não telefone: isoladamente não há nada a fazer, e acordar alguém de '
    'madrugada por um recibo de leitura seria ensinar que vermelho pode ser '
    'ignorado. O que importa é a REPETIÇÃO — se este contador subir junto com '
    'recebimento:banco- do mesmo SQLSTATE, o problema é o banco e está afetando '
    'as duas pontas.'
),
(
    'instancia:sem-dono',
    'prefixo',
    'servico',
    'alta',
    false,
    'Uma instância conectada não tem user_id na tabela. Toda mensagem que chegar '
    'por ela é recusada com 400 antes de qualquer processamento — perda de 100% '
    'do tráfego daquele número, e calada, porque 400 não acorda o envelope de '
    'monitoramento (que só relata a partir de 500).',
    'Descubra a qual conta o número pertence e preencha instances.user_id. '
    'Enquanto isso não for feito, o cliente daquele número não recebe nada e '
    'não há fila de retentativa que resolva.'
),
(
    'instancia:nao-encontrada',
    'prefixo',
    'servico',
    'alta',
    false,
    'O provedor mandou webhook de uma instância que não existe na nossa tabela. '
    'O handler responde 404 e descarta. As duas causas conhecidas são instância '
    'órfã no provedor (número conectado lá, sem linha aqui — havia 9 na UAZAPI '
    'em 25/09/2026) e webhook apontando para o projeto errado.',
    'Cruze o nome entre parênteses com a lista do provedor. Se o número é de '
    'clínica real, é instância órfã: ou recadastra aqui, ou remove lá — enquanto '
    'as duas coisas não baterem, mensagem de paciente está caindo no vazio.'
),
(
    'conversa:orfa-migracao',
    'prefixo',
    'servico',
    'media',
    true,
    'Existia uma conversa sem instância para o mesmo contato e a adoção dela pela '
    'instância que recebeu a mensagem falhou. A mensagem NÃO se perde: o fluxo '
    'segue e cria uma conversa nova. O custo é histórico partido em dois cards '
    'para o mesmo cliente.',
    'Painel. Se repetir na mesma instância, procure a conversa órfã pelo '
    'conversation_id do contexto e corrija o instance_id à mão.'
),
(
    'n8n:repasse-recusado',
    'prefixo',
    'servico',
    'alta',
    false,
    'O n8n respondeu um HTTP de recusa que NÃO é 401/403/429/5xx — na prática, '
    'quase sempre 404 "webhook not registered", que é workflow despublicado ou '
    'workflow_code errado na instância. A mensagem do paciente foi gravada e '
    'aparece no inbox, mas a IA não responde e a conversa fica parada na fila '
    'da IA sem ninguém olhar. Os códigos que o fetchProvider já classifica saem '
    'como n8n:* e não passam por aqui.',
    'Abra o workflow da instância entre parênteses e confira se está ativo e se '
    'o caminho do webhook bate com instances.workflow_code. Enquanto estiver '
    'assim, toda conversa em Atendimento IA daquele número está muda.'
),
(
    'n8n:repasse-falhou',
    'prefixo',
    'servico',
    'alta',
    false,
    'O repasse para a IA quebrou ANTES de sair: montar o bd_data falhou. Nada '
    'chegou ao n8n, então o fetchProvider não tem o que classificar — sem esta '
    'linha a falha some inteira.',
    'Olhe o stack no incidente. Costuma ser consulta do bd_data batendo em '
    'tabela/coluna que mudou. O efeito é o mesmo do repasse recusado: a IA não '
    'responde aquele cliente.'
),
(
    'token:cripto-falhou',
    'exato',
    'servico',
    'alta',
    false,
    'A criptografia da chave OpenAI de um cliente falhou. O chamador recebe null '
    'e grava a chave EM TEXTO PURO no banco — um vazamento criado por acidente, '
    'em silêncio.',
    'Trate como incidente de segurança. Confira OPENAI_TOKEN_ENCRYPTION_KEY nos '
    'secrets e procure em profiles.openai_token as linhas SEM o prefixo enc:.'
),
(
    'token:cripto-ausente',
    'exato',
    'servico',
    'alta',
    false,
    'Existe token criptografado no banco e a OPENAI_TOKEN_ENCRYPTION_KEY não está '
    'definida. TODA conta com chave própria cai calada na chave da plataforma: '
    'a IA continua funcionando e a conta errada paga por ela.',
    'Reponha o secret. Não é urgente pelo cliente, que não vê diferença — é '
    'urgente pela fatura, que não avisa.'
),
(
    'token:cripto-ilegivel',
    'exato',
    'servico',
    'alta',
    false,
    'O token criptografado existe e a chave existe, mas a decifragem falhou '
    '(chave trocada, valor corrompido). Mesmo desfecho do caso anterior: o '
    'consumo do cliente vai para a chave da plataforma sem ninguém perceber.',
    'Compare a OPENAI_TOKEN_ENCRYPTION_KEY atual com a que gravou o valor. Se a '
    'chave foi rotacionada, os tokens antigos precisam ser recadastrados.'
),
(
    'token:openai-leitura',
    'exato',
    'servico',
    'media',
    false,
    'A leitura do perfil para descobrir a chave OpenAI da conta falhou. O código '
    'cai na chave da plataforma e segue — a IA responde, e o custo vai para a '
    'conta errada.',
    'Veja o erro no incidente. Falha pontual de rede passa sozinha; erro de '
    'permissão em profiles é regressão de RLS e não passa.'
),
(
    'template-sends:log',
    'exato',
    'servico',
    'baixa',
    true,
    'O envio do template aconteceu e o registro dele em template_sends não. '
    'Nenhuma mensagem se perde; o que fica errado é a contagem do dashboard de '
    'Satisfação, que passa a subestimar em silêncio.',
    'Painel. Só vira problema se repetir: aí o número que o cliente vê no '
    'dashboard deixou de ser confiável e o motivo está no erro registrado aqui.'
)
on conflict (component) do update set
    match_tipo        = excluded.match_tipo,
    natureza          = excluded.natureza,
    severidade_padrao = excluded.severidade_padrao,
    somente_painel    = excluded.somente_painel,
    descricao         = excluded.descricao,
    acao_padrao       = excluded.acao_padrao,
    is_active         = true,
    updated_at        = now();
