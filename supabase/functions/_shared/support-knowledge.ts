// ---------------------------------------------------------------------------
// Base de conhecimento do assistente de suporte.
//
// MANUTENCAO: espelha as abas do manual em src/pages/Suporte.tsx (GUIDE_TABS) e
// os guias em src/components/suporte/*Guide.tsx. Alterou um guia? Atualize a
// entrada correspondente aqui no MESMO commit, senao a IA passa a orientar errado.
// ---------------------------------------------------------------------------

/**
 * As rotas abaixo sao escritas relativas (fonte unica com o front), mas TUDO que
 * sai daqui para o prompt/tools ja vai como URL ABSOLUTA — a IA precisa mandar o
 * link completo para o cliente conseguir clicar.
 */
const APP_URL = (Deno.env.get("APP_PUBLIC_URL") ?? "https://app.clinbia.ai").replace(/\/+$/, "");

const abs = (path: string) => (path.startsWith("http") ? path : `${APP_URL}${path}`);

export interface SupportTopic {
    /** = value da aba em GUIDE_TABS */
    id: string;
    label: string;
    /** rota do manual */
    route: string;
    /** tours guiados disponiveis (src/lib/suporteTours.ts) */
    tours?: { label: string; url: string }[];
    /** duvidas que essa aba responde */
    resolves: string[];
    /** passo a passo curto */
    steps: string[];
    /** armadilhas / regras que costumam gerar chamado */
    gotchas?: string[];
}

export const SUPPORT_TOPICS: SupportTopic[] = [
    {
        id: "dashboard",
        label: "Dashboard",
        route: "/suporte?tab=dashboard",
        tours: [
            { label: "Conhecer as abas", url: "/dashboard?tour=dashboard-abas" },
            { label: "Monitoramento", url: "/dashboard?tab=monitoramento&tour=monitoramento-tour" },
        ],
        resolves: [
            "onde vejo os numeros da clinica",
            "quantos atendimentos cada colaborador fez",
            "quanto estou gastando com IA e com mensagens da Meta",
            "quantos agendamentos foram feitos no periodo",
            "nota de satisfacao (NPS) dos pacientes",
        ],
        steps: [
            "Abra Dashboard no menu lateral.",
            "Escolha a aba: Minha Conta (custos, conexoes, colaboradores), Monitoramento (conversas em andamento por etapa), CRM, Vendas, Agendamentos, Campanhas, Recorrencia e Satisfacao.",
            "Use o filtro de periodo no topo — ele vale para todos os cards da aba.",
        ],
        gotchas: [
            "A aba Minha Conta e a de Satisfacao sao visiveis apenas para admin e supervisor.",
            "O custo da Meta e uma ESTIMATIVA por categoria de template, nao a fatura oficial da Meta.",
            "Na coluna Concluido do CRM o numero costuma ser baixo: encerrar a conversa remove o card do funil.",
        ],
    },
    {
        id: "inbox",
        label: "Inbox",
        route: "/suporte?tab=inbox",
        tours: [
            { label: "Atender um cliente", url: "/?tour=inbox-atender" },
            { label: "Filtros avancados", url: "/?tour=inbox-filtros" },
            { label: "Transferir atendimento", url: "/?tour=inbox-transferir" },
            { label: "Notas internas", url: "/?tour=inbox-notas" },
        ],
        resolves: [
            "como atender uma conversa",
            "como transferir a conversa para outro colaborador ou fila",
            "como encerrar (resolver) um atendimento",
            "por que nao vejo a conversa de um cliente",
            "como filtrar por fila, tag, conexao ou usuario",
            "onde vejo os atendimentos antigos do mesmo cliente",
            "como mandar audio, imagem, responder, reagir ou apagar mensagem",
            "como deixar uma nota interna que o cliente nao ve",
        ],
        steps: [
            "Abra Inbox (pagina inicial). A lista da esquerda traz as conversas; o funil abre os Filtros Avancados.",
            "Clique na conversa para abrir o chat. 'Atender' assume a conversa (a IA para de responder) e 'Resolver' encerra e arquiva.",
            "Para passar adiante use o botao de transferencia no topo do chat: primeiro a fila, depois o responsavel.",
            "O painel da direita (passe o mouse para expandir) traz dados do cliente, etapa do CRM, negociacao rapida e os tickets anteriores.",
            "O botao roxo de nota (icone de bloco) grava uma observacao interna na conversa — o cliente nunca ve.",
        ],
        gotchas: [
            "Atendente com escopo configurado so enxerga as conexoes, filas e tags liberadas para ele; conversa ja atribuida a outro colega tambem fica invisivel.",
            "Conversa encerrada tem as mensagens arquivadas: o historico aparece dentro da propria conversa do cliente, nao some.",
            "Numero oficial da Meta nao permite editar nem apagar mensagem — esses botoes so aparecem na conexao nao oficial.",
            "Conversa de grupo nunca fica atribuida a um colaborador e e visivel para todos, salvo se o grupo for restrito.",
        ],
    },
    {
        id: "crm",
        label: "CRM",
        route: "/suporte?tab=crm",
        tours: [{ label: "Conhecer o quadro", url: "/crm?tour=crm-board" }],
        resolves: [
            "como funciona o funil e as etapas",
            "por que o card voltou sozinho para outra etapa",
            "o que sao etapas terminais",
            "como registrar servicos e valores da negociacao",
            "diferenca entre Contato, Lead e Cliente",
        ],
        steps: [
            "Abra CRM no menu lateral: cada coluna e uma etapa e cada card e um cliente com negociacao ativa.",
            "Arraste o card para mudar de etapa — a fila do atendimento muda junto, automaticamente.",
            "Clique no card para abrir a negociacao e lancar servicos, valores e agendamento.",
        ],
        gotchas: [
            "Etapa e fila andam juntas nos DOIS sentidos: mover o card muda a fila da conversa e mudar a fila move o card.",
            "Etapas terminais (Ganho, Perdido, Sem Contato, Sem Interesse, Finalizado) encerram a conversa do cliente e viram historico.",
            "Se a IA da conta ou da conexao estiver desligada, o card nao entra nas etapas de IA — vai para atendimento humano.",
            "Cada contato tem no maximo UMA negociacao ativa.",
        ],
    },
    {
        id: "servicos",
        label: "Servicos",
        route: "/suporte?tab=servicos",
        tours: [{ label: "Cadastrar servicos", url: "/products-services?tour=servicos-tour" }],
        resolves: [
            "como cadastrar servicos e precos",
            "como usar os templates prontos de catalogo",
            "como vincular profissionais a um servico",
            "onde configuro as mensagens de recorrencia do servico",
        ],
        steps: [
            "Abra Servicos no menu lateral.",
            "Use o botao azul 'Utilizar templates' para importar um catalogo pronto (categorias, servicos e aplicacoes) e ajustar antes de salvar.",
            "Ou crie do zero: Adicionar Categoria, depois o servico e as aplicacoes com preco e duracao.",
            "No lapis do servico voce vincula profissionais e configura as mensagens de recorrencia.",
        ],
        gotchas: [
            "O preco cadastrado no servico e a fonte unica: valor digitado em planilha de importacao nao altera o cadastro.",
            "A categoria 'Avaliacao' e protegida — nao pode ser renomeada nem excluida (o link publico de agendamento e a regra de orcamento dependem dela). Avaliacao nao e vendida por orcamento, so agendada.",
            "Servico sem sala vinculada bloqueia o lancamento da venda do orcamento: vincule as salas no lapis do servico.",
            "A pagina so lista categorias que ja tenham pelo menos um servico cadastrado.",
        ],
    },
    {
        id: "orcamentos",
        label: "Orcamentos",
        route: "/suporte?tab=orcamentos",
        tours: [
            { label: "Criar um orcamento", url: "/?tour=orcamento-criar" },
            { label: "Ver os numeros dos orcamentos", url: "/financial?tour=financeiro-visao-geral" },
        ],
        resolves: [
            "como fazer um orcamento para o cliente",
            "como lancar a venda de um orcamento",
            "o que significam os icones de status do orcamento (relogio, check, x)",
            "por que o orcamento sumiu da lateral do inbox",
            "por que nao consigo excluir ou editar um orcamento",
            "por que o servico de avaliacao nao aparece no orcamento",
            "onde vejo tudo o que o cliente ja comprou e o valor movimentado",
        ],
        steps: [
            "O orcamento nasce na conversa: abra o Inbox, entre na conversa do cliente e clique no menu Orcamento na barra lateral direita.",
            "Clique em 'Realizar orcamento', escolha os servicos (categoria > servico > aplicacao) com a quantidade, selecione o Profissional (obrigatorio), preencha a Indicacao (de onde veio o cliente, opcional) e a Validade (opcional).",
            "Quando o cliente aceitar, clique em 'Lancar venda' no card: passo 1 marque Vender ou Remover em cada item (o valor e editavel); passo 2 defina Sala, Forma de pagamento, Data do pagamento e se vai agendar agora; passo 3 preencha os agendamentos; passo 4 revise e confirme.",
            "Se responder 'nao' para agendar, ligue o switch 'Agendamento pela IA' e informe em quantos dias a IA deve procurar o cliente.",
            "Todos os orcamentos do cliente (abertos e resolvidos) ficam no perfil dele: Clientes > clique no nome > aba Orcamentos. As vendas ficam na aba Vendas e a soma de tudo aparece como 'Valor movimentado' na lateral do perfil.",
            "Para ver os numeros de TODOS os orcamentos (valores totais, aprovados, rejeitados e pendentes, ranking por profissional e por servico), abra a pagina Financeiro > aba Orcamentos. Da para criar orcamento por la tambem, escolhendo o cliente na busca.",
        ],
        gotchas: [
            "Toda venda passa por orcamento. A unica excecao e a categoria Avaliacao, que nao e vendida — so agendada (ela nem aparece no seletor do orcamento).",
            "A lateral do Inbox mostra apenas orcamentos com item pendente e dentro da validade; os resolvidos ou expirados vivem no perfil do cliente.",
            "Os icones falam de VENDA, nunca de agendamento: relogio = o cliente ainda nao comprou, check verde = vendido, x vermelho = recusado, x cinza = expirado.",
            "Exclusao so e permitida enquanto TODOS os itens estao pendentes; depois que um item vira vendido ou recusado, da para editar apenas os pendentes e a exclusao fica bloqueada.",
            "No passo 2 so aparecem as salas atreladas aquele procedimento. Sem sala vinculada o assistente bloqueia — vincule em Servicos (lapis do servico) e volte.",
            "Atendente e Profissional nao sao editaveis no assistente: o atendente e quem esta logado e o profissional vem do orcamento.",
            "Cada unidade da quantidade e uma linha independente, com valor e status proprios (da para vender uma e o cliente recusar a outra).",
            "Orcamento nao movimenta o CRM e nao existe em conversa de grupo.",
            "Por padrao o atendente pode criar e editar orcamento mas nao pode excluir nem lancar venda — o gestor libera em Equipe > Permissoes (modulos Orcamentos e Vendas).",
            "Orcamento vencido vira somente leitura automaticamente (rotina diaria de madrugada): nao da para editar, excluir nem lancar venda.",
        ],
    },
    {
        id: "clientes",
        label: "Clientes",
        route: "/suporte?tab=clientes",
        tours: [{ label: "Conhecer a pagina", url: "/contacts?tour=clientes-tour" }],
        resolves: [
            "como cadastrar, importar ou exportar clientes",
            "o que significa Contato, Lead e Cliente",
            "como ver o perfil completo, historico e documentos",
            "como desligar a IA para um cliente especifico",
            "como usar tags (etiquetas)",
        ],
        steps: [
            "Abra Clientes no menu lateral.",
            "Clique no nome do cliente para abrir o perfil completo (cadastro, orcamentos, vendas, agendamentos, atendimentos, historico, avaliacao, resumos e negociacoes).",
            "O switch de IA na linha do cliente e o UNICO lugar que desliga a IA para aquele contato.",
        ],
        gotchas: [
            "A categoria (Contato/Lead/Cliente) e automatica pelas vendas: so avaliacao = Lead, qualquer outro servico = Cliente.",
            "Nada no sistema desliga a IA de um contato sozinho — se a IA parou, verifique a fila da conversa, a IA da conexao e o switch geral.",
            "Etiqueta de campanha e removida quando a campanha e encerrada ou quando o cliente nao recebeu a mensagem.",
        ],
    },
    {
        id: "equipe",
        label: "Equipe",
        route: "/suporte?tab=equipe",
        tours: [{ label: "Conhecer a pagina", url: "/equipe?tour=equipe-tour" }],
        resolves: [
            "como convidar um colaborador",
            "diferenca entre Administrador, Supervisor e Atendente",
            "como limitar o que o atendente enxerga",
            "como liberar ou bloquear paginas para um cargo",
            "quem esta online agora",
            "diferenca entre profissional e sala",
            "como cadastrar um profissional ou uma sala",
            "como inativar ou excluir um profissional ou uma sala",
        ],
        steps: [
            "Abra Equipe no menu lateral. Sao quatro abas: Equipe Comercial, Profissionais, Salas e Permissoes.",
            "Equipe Comercial: clique em adicionar membro, informe nome, e-mail, senha e cargo. No mesmo modal defina o escopo do Atendente: conexoes, filas e tags visiveis.",
            "Profissionais: quem atende na clinica (nome, cargo, foto e horarios). Ao salvar, a sala dele e criada automaticamente com o mesmo nome.",
            "Salas: as agendas — as de profissional e as avulsas (botao Adicionar Sala), para consultorio, equipamento ou espaco compartilhado.",
            "A aba Permissoes (somente Administrador) libera modulo a modulo.",
        ],
        gotchas: [
            "Escopo vazio = ve tudo. Escopo preenchido combina os tres criterios ao mesmo tempo.",
            "Atendente com escopo de tags nao ve conversa de cliente sem etiqueta.",
            "A aba Permissoes e sempre exclusiva do Administrador, mesmo para supervisor liberado.",
            "Cada coluna da agenda e uma SALA. Profissional e sala andam juntos: renomear um renomeia o outro e inativar o profissional inativa a sala dele.",
            "Inativar CANCELA todos os agendamentos futuros daquela agenda — o sistema avisa antes de confirmar.",
            "Nao e possivel EXCLUIR profissional ou sala com agendamento futuro: remarque ou cancele antes, ou apenas inative para preservar o historico.",
            "A sala de um profissional nao pode ser inativada sozinha; inative o profissional. Sala avulsa pode.",
        ],
    },
    {
        id: "agenda",
        label: "Agenda",
        route: "/suporte?tab=agenda",
        tours: [{ label: "Conhecer a agenda", url: "/scheduling?tour=agenda-tour" }],
        resolves: [
            "como criar, remarcar ou cancelar um agendamento",
            "como configurar o horario de trabalho da sala / do profissional",
            "como fechar a agenda em um dia",
            "por que todo agendamento gerou uma venda",
            "as mensagens automaticas de confirmacao e lembrete",
            "como importar agendamentos por planilha",
            "por que um profissional nao aparece na grade",
        ],
        steps: [
            "Abra Agenda no menu lateral. O botao no cabecalho alterna entre grade (dia) e calendario (mes).",
            "Cada coluna da grade e uma SALA (a agenda). Clique num horario livre para abrir o agendamento: cliente, servico, sala e forma de pagamento.",
            "O horario de trabalho fica no cadastro da sala (Equipe > Salas, ou Adicionar Sala na barra lateral da agenda), com opcao de horario diferente por dia da semana.",
        ],
        gotchas: [
            "Profissional ou sala inativa some da grade, do modal de agendamento e do link publico.",
            "Todo agendamento precisa de um cliente vinculado e cria/liga uma venda com pagamento pendente.",
            "Concluir o agendamento NAO cria venda nova — ela ja existe desde a criacao.",
            "As mensagens automaticas (confirmacao 24h, lembrete 2h e pesquisa 24h depois) funcionam independentemente da IA estar ligada.",
        ],
    },
    {
        id: "recorrencia",
        label: "Recorrencia",
        route: "/suporte?tab=recorrencia",
        tours: [{ label: "Configurar recorrencia", url: "/recurrence?tour=recorrencia-config" }],
        resolves: [
            "como fazer o paciente voltar depois de X meses",
            "as 3 abordagens e os prazos de cada uma",
            "como editar as mensagens e usar variaveis",
            "por que a mensagem depende de template aprovado pela Meta",
        ],
        steps: [
            "Configure o intervalo de retorno no proprio servico (lapis do servico em Servicos).",
            "Ajuste as 3 mensagens de abordagem: no padrao da conta (Conexoes > Templates > Recorrencia) ou so para aquele servico.",
            "Acompanhe em Dashboard > aba Recorrencia; as campanhas sao geradas automaticamente todo dia.",
        ],
        gotchas: [
            "Campanhas de recorrencia nao aparecem na pagina Campanhas — elas vivem na aba Recorrencia do Dashboard.",
            "No numero oficial a mensagem precisa de template aprovado pela Meta; alterar o texto gera uma nova versao para aprovar.",
            "Os tempos das 3 abordagens sao sempre manuais, definidos por voce.",
        ],
    },
    {
        id: "campanhas",
        label: "Campanhas",
        route: "/suporte?tab=campanhas",
        tours: [{ label: "Criar campanha", url: "/campanhas?tour=nova-campanha" }],
        resolves: [
            "como criar e disparar uma campanha",
            "como montar o publico e usar variaveis",
            "por que um contato nao recebeu",
            "o que significa cada card do quadro de resultados",
            "como reenviar uma campanha",
            "como ativar a IA na campanha",
        ],
        steps: [
            "Abra Campanhas no menu lateral e clique em Nova campanha.",
            "O assistente tem 6 etapas: Dados, Audiencia, Tipo, Mensagem, Objetivo e Revisao.",
            "No numero oficial da Meta a mensagem tem que ser um template ja APROVADO; na conexao nao oficial o texto e livre.",
            "Depois do disparo, expanda o card da campanha para ver os resultados e a tabela contato a contato.",
        ],
        gotchas: [
            "Cliente com conversa ja aberta nao recebe a campanha (o atendimento em andamento tem prioridade).",
            "Cada contato entra em uma unica campanha ativa por conexao — a campanha nova derruba a anterior uma hora antes do disparo.",
            "Quem nao recebeu a mensagem perde a etiqueta da campanha.",
            "O quadro conta quem RESPONDEU a mensagem da campanha; o inbox filtrado por etiqueta mostra tambem quem so recebeu.",
            "Mensagens automaticas de agendamento tem prioridade sobre campanha no mesmo numero.",
        ],
    },
    {
        id: "ia",
        label: "IA",
        route: "/suporte?tab=ia",
        tours: [{ label: "Configurar a IA", url: "/ia-config?tab=settings&tour=ia-config" }],
        resolves: [
            "por que a IA nao esta respondendo",
            "como ligar ou desligar a IA (geral, por conexao ou por cliente)",
            "como alimentar a IA com dados da empresa e F.A.Q",
            "como ajustar o tempo de resposta e a voz",
            "quando a IA para de responder sozinha",
        ],
        steps: [
            "Abra IA no menu lateral: aba Empresa (dados e horarios), F.A.Q (perguntas frequentes) e Configuracoes (switch geral, delay, voz, follow-up).",
            "O switch por conexao fica em Conexoes, no card da instancia.",
            "O switch por cliente fica na pagina Clientes.",
        ],
        gotchas: [
            "Para a IA responder e preciso: switch geral ligado, IA ligada NAQUELA conexao, IA ligada no contato, conversa em status pendente e na fila 'Atendimento IA'.",
            "Assim que alguem clica em Atender, a conversa sai da fila da IA e ela para de responder.",
            "Desligar a IA de uma conexao devolve as conversas abertas dela para o atendimento humano.",
        ],
    },
    {
        id: "conexoes",
        label: "Conexoes",
        route: "/suporte?tab=conexoes",
        tours: [
            { label: "Conectar um canal", url: "/whatsapp-connection?tour=conexoes-tour" },
            { label: "Templates", url: "/whatsapp-connection?tab=templates&tour=conexoes-templates" },
        ],
        resolves: [
            "como conectar o WhatsApp (oficial ou nao oficial) e o Instagram",
            "diferenca entre numero oficial e nao oficial",
            "como criar e acompanhar templates",
            "o que e qualidade e limite diario da Meta",
            "meu numero foi restringido pela Meta, e agora",
            "a conexao caiu / QR code",
        ],
        steps: [
            "Abra Conexoes no menu lateral (aba Conexoes).",
            "Nao oficial: adicione a instancia e leia o QR code com o WhatsApp do celular.",
            "Oficial (Meta): use o botao de conexao com a Meta e siga o cadastro ate o numero ficar registrado.",
            "A aba Templates lista os modelos aprovados, com o status de cada um.",
        ],
        gotchas: [
            "No numero oficial so da para iniciar conversa com template aprovado; texto livre so dentro da janela de 24h apos a ultima mensagem do cliente.",
            "Qualidade baixa ou limite de nivel baixo derruba disparos grandes — confira o painel de qualidade antes da campanha.",
            "Nome de exibicao recusado pela Meta bloqueia envios: aparece um aviso ambar no card da conexao com os passos.",
        ],
    },
    {
        id: "financeiro",
        label: "Financeiro",
        route: "/suporte?tab=financeiro",
        tours: [{ label: "Conhecer a pagina", url: "/financial?tour=financeiro-visao-geral" }],
        resolves: [
            "onde vejo o total orcado, aprovado, rejeitado e pendente",
            "quanto de dinheiro esta parado esperando resposta do cliente",
            "quais servicos sao mais orcados e quem mais faz orcamento",
            "onde vejo a lista de todas as vendas realizadas",
            "faturamento por atendente e por profissional",
            "como criar um orcamento sem abrir a conversa do cliente",
            "por que o valor aprovado nao bate com o valor orcado",
        ],
        steps: [
            "Abra Financeiro no menu lateral (fica logo abaixo de Marketing).",
            "Aba Orcamentos: escolha o periodo no topo (todo o periodo, hoje, 7 dias, 30 dias ou personalizado) — ele vale para os 4 cards de valores.",
            "Os cards mostram, em reais: Valores totais, Valores aprovados (valor final vendido), Valores rejeitados (recusados + expirados) e Valores pendentes.",
            "Abaixo vem o grafico dos ultimos 12 meses em QUANTIDADE de itens (realizados, fechados, perdidos e pendentes), com botao para alternar entre linhas e barras.",
            "A tabela 'Orcamentos realizados' lista uma linha por orcamento, mais recente no topo; clicar no nome do cliente abre a ficha dele na aba Orcamentos.",
            "No rodape da aba ficam 'Orcamentos por profissional' e 'Ranking de servicos orcados' (top 10), cada um com seu proprio filtro de periodo.",
            "Aba Vendas: escolha mes e ano; alem dos cards e graficos, ha a tabela 'Vendas realizadas' (todas as vendas, mais recente no topo), o ranking 'Mais Vendidos' e o faturamento por atendente e por profissional.",
            "Para criar um orcamento sem abrir a conversa, use o botao 'Criar orcamento' no topo da aba Orcamentos e busque o cliente por nome ou numero.",
        ],
        gotchas: [
            "O filtro de periodo do topo vale SOMENTE para os 4 cards. O grafico e sempre dos ultimos 12 meses, a tabela sempre traz os mais recentes e os dois quadros do rodape tem filtros proprios.",
            "Cards sao em REAIS e o grafico e em QUANTIDADE de itens (um orcamento com 3 servicos conta 3) — por isso os numeros nao se comparam entre si.",
            "'Valores aprovados' usa o valor FINAL da venda, ja com o desconto dado no assistente; por isso costuma ficar abaixo do valor orcado.",
            "'Valores rejeitados' soma recusados MAIS expirados.",
            "O 'Ranking de servicos orcados' e sobre o servico OFERECIDO — nao tem relacao com o campo Indicacao (de onde veio o cliente).",
            "Em 'Orcamentos por profissional' aparecem todos os profissionais ativos, inclusive com zero, para o gestor enxergar quem nao esta orcando.",
            "No faturamento por profissional, vendas antigas sem profissional vinculado somam em 'Sem responsavel'.",
            "As tabelas carregam os 300 registros mais recentes; para o historico completo de um cliente, clique no nome dele e abra a ficha.",
            "Financeiro e modulo com permissao: admin ve sempre; supervisor e atendente so veem o item no menu se a permissao do modulo Financeiro estiver ligada em Equipe > Permissoes. O botao 'Criar orcamento' respeita a permissao do modulo Orcamentos.",
        ],
    },
    {
        id: "configuracoes",
        label: "Configuracoes",
        route: "/suporte?tab=configuracoes",
        tours: [{ label: "Conhecer a pagina", url: "/settings?tour=config-tour" }],
        resolves: [
            "como mudar dados da empresa, senha e foto",
            "como ativar o menu agrupado e as notificacoes",
            "como criar e organizar tags",
            "como configurar o encerramento automatico de conversas",
            "quais e-mails o sistema envia",
        ],
        steps: [
            "Abra Configuracoes no menu lateral.",
            "Abas: Perfil, Empresa, Seguranca, Sistema (menu agrupado e notificacoes), Tags e Automacoes.",
            "Em Automacoes ficam o encerramento automatico, a mensagem de aviso e a instancia padrao dos disparos.",
        ],
        gotchas: [
            "O encerramento automatico so nasce ligado em contas novas; contas antigas precisam ligar manualmente.",
            "O prazo do encerramento conta sempre a partir da ultima mensagem DO CLIENTE — se ele responder, o ciclo zera.",
        ],
    },
    {
        id: "atendimento",
        label: "Falar com o suporte",
        route: "/suporte?tab=atendimento",
        tours: [{ label: "Onde fica o botao", url: "/?tour=suporte-chat" }],
        resolves: [
            "como falar com o suporte da Clinvia",
            "onde vejo meus chamados antigos",
            "onde chegam os avisos de atualizacao do sistema",
        ],
        steps: [
            "Clique no botao azul de fone no canto inferior esquerdo.",
            "Aba Suporte: escreva a duvida — o assistente responde na hora e chama a equipe quando precisa.",
            "Botao 'Ver chamados antigos' abre o historico das conversas anteriores.",
            "Aba Avisos: novidades e correcoes publicadas pela equipe da Clinvia.",
        ],
        gotchas: [
            "Cada pessoa tem o proprio chat: ninguem da equipe ve o chamado do colega, nem o dono da conta.",
        ],
    },
];

/** Versao compacta usada no system prompt (links ja absolutos). */
export const KNOWLEDGE_SUMMARY = SUPPORT_TOPICS.map((t) => {
    const tours = t.tours?.length
        ? `\n  Tours: ${t.tours.map((x) => `${x.label} -> ${abs(x.url)}`).join(" | ")}`
        : "";
    return [
        `### ${t.label} (id: ${t.id}) — manual: ${abs(t.route)}${tours}`,
        `  Resolve: ${t.resolves.join("; ")}`,
        `  Passos: ${t.steps.map((s, i) => `${i + 1}) ${s}`).join(" ")}`,
        t.gotchas?.length ? `  Atencao: ${t.gotchas.join(" ")}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}).join("\n\n");

/** Devolve o topico com os links ja absolutos (a IA precisa colar URL clicavel). */
export function getTopic(id: string): SupportTopic | null {
    const key = (id || "").trim().toLowerCase();
    const topic = SUPPORT_TOPICS.find((t) => t.id === key);
    if (!topic) return null;
    return {
        ...topic,
        route: abs(topic.route),
        tours: topic.tours?.map((t) => ({ ...t, url: abs(t.url) })),
    };
}

export const TOPIC_IDS = SUPPORT_TOPICS.map((t) => t.id);
