import { useNavigate } from "react-router-dom";
import {
    MessageSquare, ListChecks, Headset, Bot, PanelRight, Paperclip, Archive,
    HelpCircle, ExternalLink, ArrowRightLeft, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { ConversationFlowSimulator, TransferFlowSimulator, TransferWalkthrough } from "./simulators-inbox";

// ---------------------------------------------------------------------------
// Manual da aba Inbox
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "filas-e-status", label: "Filas e status" },
    { id: "atendendo", label: "Atendendo" },
    { id: "transferindo", label: "Transferindo" },
    { id: "ia-no-inbox", label: "IA no inbox" },
    { id: "sidebar", label: "Painel lateral" },
    { id: "midias-acoes", label: "Mídias e ações" },
    { id: "notas", label: "Notas internas" },
    { id: "historico", label: "Histórico e tickets anteriores" },
    { id: "faq", label: "FAQ" },
];

export function InboxGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <MessageSquare className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual do Inbox</h1>
                        <p className="text-sm text-muted-foreground">
                            A central de conversas: WhatsApp e Instagram num só lugar, dividindo o trabalho entre IA e equipe.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="filas-e-status">Filas, pendente × em atendimento</LearnChip>
                        <LearnChip topicId="atendendo">Assumir e encerrar conversas</LearnChip>
                        <LearnChip topicId="transferindo">Transferir para filas e colegas</LearnChip>
                        <LearnChip topicId="sidebar">Usar o painel de inteligência</LearnChip>
                        <LearnChip topicId="historico">Tickets anteriores e conversas antigas</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={MessageSquare} title="O que é o Inbox?"
                subtitle="Todas as conversas da clínica numa tela só">
                <p className="text-sm text-muted-foreground">
                    O Inbox reúne <strong className="text-foreground">todas as conversas de todos os números e do
                    Instagram</strong> da clínica. À esquerda, a lista de conversas com filtros; no centro, o chat; à direita,
                    o painel de inteligência com os dados do cliente e a negociação do CRM.
                </p>
                <Callout type="dica" title="Filtros Avançados (o funil no topo da lista)">
                    Filtre a lista por <strong>Filas, Tags, Etapas do CRM, Conexões e Usuários</strong> (incluindo "sem
                    atribuição") com múltiplas seleções: dentro da mesma categoria vale OU (qualquer uma das marcadas),
                    entre categorias vale E (todas juntas). O filtro de <strong>Etapas do CRM</strong> usa a etapa do
                    card ativo do cliente no funil — como grupo não tem card, a aba Grupos fica vazia enquanto ele
                    estiver marcado. Os balões de não lidas se adaptam ao filtro ativo. O filtro fica{" "}
                    <strong>salvo no navegador</strong> — permanece ativo mesmo ao atualizar a página ou sair e voltar;
                    para removê-lo, use o botão <strong>Limpar Filtros</strong> no topo da janela de filtros.
                </Callout>
                <Callout type="dica" title="Filtro ativo mostra o total do banco">
                    Com qualquer filtro ligado (inclusive <strong>Não respondidas</strong>) aparece uma barra logo acima da
                    lista com o <strong>total de conversas encontradas no banco inteiro</strong>, não só nas que já estão na
                    tela — o filtro procura em todos os tickets da aba, da mais recente para a mais antiga. A exibição
                    continua de <strong>100 em 100</strong>: quando o resultado é maior, a barra mostra quantas estão na tela
                    e o botão <strong>Carregar mais</strong>, no fim da lista, traz as próximas 100.
                </Callout>
                <Callout type="dica" title="Busca: procura em TODOS os tickets">
                    O campo <strong>Buscar em todos os tickets</strong> não filtra só o que está na tela — ele consulta o
                    banco inteiro. Digite o nome, o telefone (ou só os últimos dígitos), o nome do grupo ou o número do
                    ticket e a busca traz <strong>todas as conversas daquele cliente</strong>, mesmo as que estão lá no
                    fim da lista. Ela respeita a <strong>aba aberta</strong>: buscar em Abertos traz só tickets abertos.
                    Não achou? Troque para Pendentes ou Resolvidos e busque de novo. Apague a busca para voltar à lista.
                </Callout>
                <Callout type="atencao" title="A lista carrega 100 por vez">
                    Para abrir rápido mesmo em clínicas com milhares de conversas, a lista mostra as{" "}
                    <strong>100 conversas mais recentes</strong>. Ao chegar no fim, use o botão{" "}
                    <strong>Carregar mais</strong> para trazer as próximas 100. Se estiver procurando um cliente
                    específico, não precisa rolar: use a busca, que já olha o banco inteiro.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/?tour=inbox-atender")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/?tour=inbox-filtros")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Tour: Filtros Avançados
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="filas-e-status" index={2} icon={ListChecks} title="Filas e status"
                subtitle="Entenda o caminho de toda conversa — brinque com a linha do tempo">
                <ConversationFlowSimulator />
                <p className="text-sm text-muted-foreground">
                    Além do status, cada conversa vive numa <strong className="text-foreground">fila</strong>: Atendimento IA,
                    Atendimento Humano, Suporte, Financeiro, Pós-Venda... As filas organizam o trabalho da equipe e definem se a
                    IA pode atuar (só na fila Atendimento IA). E uma regra de ouro:{" "}
                    <strong className="text-foreground">toda conversa sempre pertence a uma fila</strong> — ela nasce na fila da
                    IA ou na humana e, dali em diante, só muda de fila (nunca fica "sem fila").
                </p>
                <Callout type="atencao" title="Fila ≠ status">
                    Status é o momento da conversa (pendente / em atendimento / resolvida). Fila é o setor responsável. Uma
                    conversa pendente pode estar na fila da IA ou na humana — e isso muda quem responde primeiro.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="atendendo" index={3} icon={Headset} title="Atendendo um cliente"
                subtitle="Assumir, conversar, encerrar">
                <StepByStep steps={[
                    { title: "Encontre a conversa", description: "Use os filtros da lista (fila, tag, instância, usuário responsável, status, busca por nome/telefone) ou o sino de notificações. Cada categoria aceita várias seleções ao mesmo tempo (ex.: 2 tags + 1 fila): dentro da categoria basta atender a uma das opções, e as categorias se combinam entre si. O filtro de usuário mostra todas as conversas atribuídas a um colega — ou as sem atribuição. Conversas pendentes têm destaque." },
                    { title: "Assuma o atendimento", description: <>Clique em <strong>Atender</strong>. A conversa vira "em atendimento", ganha seu nome como responsável e a IA para na hora.</>, },
                    { title: "Converse", description: "Texto, áudio, imagem, documento, resposta citada, encaminhamento... tudo pelo campo de mensagem. O cliente recebe no WhatsApp normalmente." },
                    { title: "Precisa de outro setor? Transfira", description: <>Clique em <strong>Transferir Atendimento</strong> no topo do chat: escolha a fila e, se quiser, o colega responsável (detalhes no próximo tópico).</>, },
                    { title: "Encerre quando resolver", description: <>Clique em <strong>Resolver</strong>. As mensagens vão para o histórico do contato e, se o cliente voltar, nasce uma conversa nova. Quem resolve leva a atribuição: mesmo que a conversa não estivesse com você, ao encerrá-la ela passa a contar como atendimento seu (inclusive no Monitoramento). Encerrar fecha <strong>somente aquela conversa</strong>: se o mesmo cliente também fala com você em outra instância/número, aquele atendimento continua aberto normalmente.</>, },
                ]} />
                <Callout type="pratica" title="Encerre sempre que concluir">
                    Conversa encerrada = fila limpa, métricas corretas (tempo de atendimento) e IA liberada para o próximo
                    contato do cliente. Conversa esquecida aberta trava a IA para aquele cliente.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="transferindo" index={4} icon={ArrowRightLeft} title="Transferindo atendimentos"
                subtitle="Fila certa, pessoa certa — em dois cliques">
                <p className="text-sm text-muted-foreground">
                    No topo do chat fica o botão <strong className="text-foreground">Transferir Atendimento</strong>. Ele abre
                    um modal em <strong className="text-foreground">duas etapas</strong>: primeiro você escolhe a fila de
                    destino; depois, quem será o responsável — ou a opção{" "}
                    <strong className="text-foreground">"Não atribuir usuário"</strong>, que manda a conversa para a fila sem
                    dono fixo (qualquer pessoa com acesso pode assumir). Navegue pelo guia visual abaixo — cada tela é uma
                    réplica do que você verá no sistema:
                </p>
                <TransferWalkthrough />
                <Callout type="atencao" title="Atendimento atribuído é exclusivo">
                    Quando a conversa tem um <strong>atendente responsável</strong>, ela fica visível <strong>somente para
                    ele</strong> — nenhum outro atendente vê o atendimento, nem na lista. Admins e supervisores continuam vendo
                    tudo. Conversas <strong>sem atribuição</strong> ficam visíveis para todos os atendentes com acesso à fila e
                    à conexão, até alguém assumir.
                </Callout>
                <Callout type="atencao" title="Quem pode transferir para quem?">
                    <strong>Admins e supervisores</strong> transferem qualquer atendimento. <strong>Atendentes</strong>{" "}
                    transferem normalmente os atendimentos <strong>atribuídos a eles</strong> — inclusive para outro colega.
                    O que o atendente não pode é transferir um atendimento que pertence a outra pessoa; e um atendimento{" "}
                    <strong>sem responsável</strong> ele só pode assumir para si ou mover de fila sem atribuir.
                </Callout>
                <Callout type="dica" title="Aviso na hora, para quem está online">
                    Quando um <strong>Admin ou Supervisor</strong> transfere um cliente de um atendente para outro, os dois
                    lados são avisados na hora com um <strong>popup no centro da tela</strong>: quem perdeu o cliente vê
                    "O cliente X foi transferido para o atendente Y pelo Supervisor Z", e quem recebeu vê "O Supervisor Z
                    acabou de transferir para você o cliente X que estava com outro usuário". O aviso só aparece para quem
                    está <strong>com o sistema aberto naquele momento</strong> — não fica pendente para depois.
                </Callout>
                <Callout type="atencao" title="Por que nem todo colega aparece na lista?">
                    Atendentes podem ter <strong>escopo de visão</strong> (definido em Equipe): conexões liberadas, filas
                    atribuídas e tags visíveis. Se a fila escolhida, a conexão da conversa ou as tags do contato estiverem fora
                    do escopo do colega, ele não aparece — de nada adiantaria transferir para quem não enxerga a conversa.
                </Callout>
                <p className="text-sm text-muted-foreground">
                    Agora experimente você: no simulador abaixo, troque a fila de destino e veja a lista de responsáveis mudar
                    em tempo real, exatamente como no modal de verdade.
                </p>
                <TransferFlowSimulator />
                <Callout type="dica" title="Devolver para a IA">
                    Transferir para a fila <strong>Atendimento IA</strong> devolve a conversa para a assistente (se os portões
                    da IA estiverem abertos). E não existe mais "Sem Fila": toda conversa fica sempre em alguma fila.
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/?tour=inbox-transferir")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="ia-no-inbox" index={5} icon={Bot} title="A IA dentro do inbox"
                subtitle="Quando ela atua e como tirar (ou devolver) uma conversa dela">
                <p className="text-sm text-muted-foreground">
                    A IA só responde conversas <strong className="text-foreground">pendentes</strong> que estão na fila{" "}
                    <strong className="text-foreground">Atendimento IA</strong> — além dos interruptores geral, da conexão e do
                    contato (os 5 portões, explicados no guia da IA).
                </p>
                <StepByStep steps={[
                    { title: "Quero assumir do meio da conversa", description: "Clique em Atender. Pronto: a IA solta o cliente na hora e você continua de onde ela parou — o histórico inteiro está na tela." },
                    { title: "Quero devolver para a IA", description: "Encerre a conversa. Na próxima mensagem do cliente, a IA volta a atender (se os portões estiverem abertos)." },
                    { title: "Quero silenciar a IA só para esse cliente", description: "Na página Clientes, desligue o botão de IA do contato. A equipe passa a atender sempre." },
                ]} />
            </TopicSection>

            {/* 6 */}
            <TopicSection id="sidebar" index={6} icon={PanelRight} title="Painel de inteligência"
                subtitle="O raio-x do cliente sem sair da conversa">
                <p className="text-sm text-muted-foreground">
                    Passe o mouse sobre a barra à direita do chat e ela expande, mostrando tudo do cliente:
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                    {[
                        { t: "Dados e etapa do CRM", d: "Nome, telefone, etiquetas, categoria (contato/lead/cliente) e a etapa atual no funil desta conexão." },
                        { t: "Negociação rápida", d: "Crie ou edite a negociação (serviços + valores) sem abrir o CRM — o card nasce no funil da conexão desta conversa." },
                        { t: "Tickets anteriores", d: "Todos os atendimentos já encerrados deste cliente nesta conexão, em cartões. Clique em um deles para ver aquele trecho isolado." },
                        { t: "Resumo e sentimento", d: "Resumo da conversa gerado pela IA e o termômetro do humor do cliente." },
                        { t: "Atalhos", d: "Registrar venda, criar agendamento e abrir o perfil completo em um clique." },
                    ].map((x) => (
                        <div key={x.t} className="rounded-xl border p-3.5">
                            <p className="text-sm font-semibold">{x.t}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{x.d}</p>
                        </div>
                    ))}
                </div>
                <Callout type="atencao" title="Encerrar negociação mexe só nesta conexão">
                    Cada número (e cada conta do Instagram) tem o seu próprio funil no CRM. Ao usar
                    <strong> Encerrar negociação</strong>, só o card <strong>desta conversa</strong> vai para a etapa final —
                    se o mesmo cliente também fala com você em outro número, a negociação de lá continua exatamente
                    onde estava.
                </Callout>
                <Callout type="dica" title="O painel se fixa enquanto você trabalha">
                    Se você <strong>abrir qualquer seção</strong> (CRM, Venda, Copilot...) ou <strong>digitar algo</strong>,
                    o painel se fixa e não fecha mais ao tirar o mouse — nada do que você escreveu se perde. Para recolher,
                    clique na <strong>setinha na borda esquerda</strong> do painel (no meio da altura). Sem interação, ele
                    volta ao comportamento padrão: expande no hover e recolhe ao sair.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="midias-acoes" index={7} icon={Paperclip} title="Mídias e ações nas mensagens"
                subtitle="O que dá (e o que não dá) para fazer em cada tipo de WhatsApp">
                <p className="text-sm text-muted-foreground">
                    Clique com o botão direito (ou no menu ⋮) de uma mensagem para <strong className="text-foreground">responder,
                    reagir, encaminhar, editar ou apagar</strong>. Atenção às diferenças entre os tipos de conexão:
                </p>
                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[480px] text-sm">
                        <thead className="bg-muted/60 text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">Ação</th>
                                <th className="px-3 py-2 text-left font-medium">WhatsApp não oficial</th>
                                <th className="px-3 py-2 text-left font-medium">WhatsApp Oficial (Meta)</th>
                            </tr>
                        </thead>
                        <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t">
                            <tr><td>Responder (citar)</td><td>✅</td><td>✅</td></tr>
                            <tr><td>Reagir com emoji</td><td>✅</td><td>✅</td></tr>
                            <tr><td>Editar mensagem enviada</td><td>✅</td><td>❌ (a Meta não permite)</td></tr>
                            <tr><td>Apagar para todos</td><td>✅</td><td>❌ (a Meta não permite)</td></tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-muted-foreground">
                    Para anexar arquivos você pode usar o <strong className="text-foreground">clipe</strong> (Fotos e Vídeos,
                    Documento ou Contato), <strong className="text-foreground">colar</strong> uma imagem copiada (Ctrl+V) ou
                    simplesmente <strong className="text-foreground">arrastar o arquivo do computador e soltar sobre a
                    conversa</strong> — aparece a área "Solte o arquivo para anexar" e o arquivo fica pronto para envio.
                </p>
                <p className="text-sm text-muted-foreground">
                    Para baixar um documento recebido ou enviado, clique no botão com o nome do arquivo dentro da mensagem (ou
                    no ícone de download em <strong className="text-foreground">Mídias e arquivos</strong> da conversa). O arquivo
                    é salvo com o <strong className="text-foreground">nome e a extensão originais</strong> — um .xml continua .xml,
                    um .pdf continua .pdf.
                </p>
                <Callout type="atencao" title="Janela de 24h no WhatsApp Oficial">
                    No número oficial, você só pode mandar texto livre até <strong>24h após a última mensagem do cliente</strong>.
                    Passou disso, é preciso usar um template aprovado (ou esperar o cliente escrever). O sistema avisa quando a
                    janela fecha. Na lista de templates (tanto no modal <strong>Enviar Template</strong> quanto no de{" "}
                    <strong>nova mensagem</strong>) use as abas de tipo e o campo <strong>Buscar template…</strong> para achar
                    pelo nome — a lista rola e destaca o item sob o mouse.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="notas" index={8} icon={StickyNote} title="Notas internas da conversa"
                subtitle="Recados roxos para a equipe — o cliente nunca vê">
                <p className="text-sm text-muted-foreground">
                    O botão lilás <strong className="text-foreground">Adicionar nota</strong> (ícone de nota, ao lado das
                    Mensagens Rápidas) abre um campo de texto para registrar uma <strong className="text-foreground">nota interna</strong>{" "}
                    na conversa. A nota aparece na timeline como uma <strong className="text-foreground">bolha roxa</strong>{" "}
                    com o título "Nota de Conversa - nome - data/hora" — visível no inbox e no modal de conversa para toda a
                    equipe, mas <strong className="text-foreground">nunca é enviada ao cliente</strong>.
                </p>
                <StepByStep steps={[
                    { title: "Escreva e anexe", description: "Clique no botão roxo, escreva o recado (ex.: 'cliente prefere contato à tarde') e anexe. A nota entra na conversa na hora." },
                    { title: "Quem lê", description: "Qualquer atendente que abrir a conversa vê a nota no ponto da timeline em que foi criada — ideal para passar contexto no troca-turno." },
                    { title: "Editar (nunca apagar)", description: "Notas não podem ser excluídas. Ao editar (lápis ao lado da bolha), a nota mostra 'editado de ...' com o início do texto anterior — passe o mouse para ler o texto antigo completo." },
                ]} />
                <Callout type="dica" title="Catalogadas no perfil do cliente">
                    Toda nota também fica registrada no perfil do cliente (página Clientes &gt; nome &gt; aba Histórico &gt;
                    sub-aba Notas), com autor e data. A IA também pode registrar notas — elas aparecem com o autor "IA".
                </Callout>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/?tour=inbox-notas")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 9 */}
            <TopicSection id="historico" index={9} icon={Archive} title="Histórico e tickets anteriores"
                subtitle="Um ticket por cliente em cada conexão — nada se perde ao resolver">
                <p className="text-sm text-muted-foreground">
                    Ao resolver uma conversa, as mensagens são <strong className="text-foreground">arquivadas no histórico do
                    contato</strong>. Quando ele escrever de novo, a conversa nova mostra também o histórico anterior — você (e
                    a IA) sempre têm o contexto completo.
                </p>
                <Callout type="dica" title="A aba Resolvidos mostra um ticket por cliente, por conexão">
                    Antes, um cliente que falou dez vezes aparecia dez vezes em Resolvidos. Agora ele aparece{" "}
                    <strong>uma única vez em cada número (ou conta do Instagram)</strong>, com todo o histórico daquela conexão
                    reunido na mesma conversa — nada foi apagado, só deixou de ficar repetido. Se o mesmo cliente falou em dois
                    números diferentes, são <strong>dois tickets</strong>: cada conexão é um atendimento próprio e o histórico de
                    um nunca se mistura com o do outro.
                </Callout>
                <Callout type="atencao" title="Cliente com ticket aberto ou pendente não aparece em Resolvidos">
                    Se existe atendimento em andamento naquele número, o cliente fica só nas abas{" "}
                    <strong>Abertos</strong> ou <strong>Pendentes</strong> — assim ninguém responde pelo ticket errado. O
                    histórico continua acessível pelo painel lateral, dentro da conversa atual.
                </Callout>
                <StepByStep steps={[
                    { title: "Role para cima para carregar mais", description: "A conversa abre com os atendimentos mais recentes. À medida que você rola para o topo, o sistema traz os anteriores automaticamente, sempre da mesma conexão. Quando chegar em Início do histórico desta conexão, acabou." },
                    { title: "Abra Tickets anteriores no painel lateral", description: <>No painel à direita há a seção <strong>Tickets anteriores</strong> — disponível também em conversas abertas e pendentes. Cada atendimento encerrado vira um cartão com o número do ticket, a conexão, quem encerrou (se não foi ninguém, foi a IA), a data de abertura e a de fechamento.</>, },
                    { title: "Filtre por data quando a lista ficar grande", description: <>Acima dos cartões há um botão de <strong>calendário</strong> e, ao lado, um seletor <strong>Fechamento | Abertura</strong> (fechamento é o padrão). No calendário só ficam clicáveis os dias que realmente têm ticket — escolha um e a lista mostra apenas os daquele dia. O <strong>X</strong> ao lado limpa o filtro.</>, },
                    { title: "Clique no cartão para ver o trecho isolado", description: "O chat passa a mostrar somente aquele atendimento, do começo ao fim. Útil para reler uma promessa feita ao cliente sem se perder no meio de tudo." },
                    { title: "Volte quando quiser", description: <>Use <strong>Retornar para a conversa geral</strong> — o botão aparece tanto no topo da seção Tickets anteriores quanto embaixo do chat.</>, },
                ]} />
                <Callout type="atencao" title="Ticket anterior é somente leitura">
                    Enquanto você estiver vendo um trecho antigo, o campo de mensagem some — para não responder dentro de um
                    atendimento já encerrado. Para falar com o cliente, use <strong>Retornar para a conversa geral</strong>:
                    cada cliente tem um ticket único por conexão, e é sempre nele que a conversa continua. Ticket resolvido
                    também não tem o botão <strong>Atender</strong>.
                </Callout>
                <Callout type="dica">
                    Precisa reler um atendimento antigo? Abra o perfil do cliente (página Clientes &gt; clique no nome) e veja a
                    aba Atendimentos, com todas as conversas encerradas.
                </Callout>
            </TopicSection>

            {/* 10 */}
            <TopicSection id="faq" index={10} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Respondi e o cliente não recebeu. O que houve?",
                            a: "No WhatsApp Oficial, verifique a janela de 24h (fora dela só template aprovado) e o painel Qualidade Meta. No não oficial, confira se a instância está conectada (bolinha verde em Conexões).",
                        },
                        {
                            q: "Por que não consigo editar/apagar uma mensagem?",
                            a: "A conversa é de um número WhatsApp Oficial (Meta) — a própria Meta não oferece editar/apagar pela API. Nos números não oficiais as duas ações funcionam.",
                        },
                        {
                            q: "Encerrei sem querer. Perdi as mensagens?",
                            a: "Não. Elas foram arquivadas no histórico do contato. Quando o cliente mandar a próxima mensagem (ou você iniciar uma nova conversa), o histórico aparece junto.",
                        },
                        {
                            q: "O que significa a bolinha/contador na conversa?",
                            a: "O contador azul são mensagens não lidas — ao abrir a conversa, ele zera. A bolinha ao lado do nome mostra quem falou por último: laranja = a última mensagem é do cliente (resposta do atendente pendente); verde = a última mensagem foi da equipe. Toda conversa com a bolinha laranja também ganha uma barra fina laranja na lateral esquerda do cartão (mesmo esquema da urgência no card do CRM), para você bater o olho e ver o que está esperando resposta. Os balões vermelhos nas abas Abertos/Pendentes/Grupos somam as não lidas e respeitam os Filtros Avançados: com um filtro de fila, tag, conexão ou usuário aplicado, o balão mostra só as não lidas daquele recorte — se os clientes do filtro não têm nada não lido, o balão some.",
                        },
                        {
                            q: "A aba Resolvidos tinha vários tickets do mesmo cliente e agora só tem um. Apagaram os outros?",
                            a: "Não. Cada cliente passou a aparecer uma única vez por conexão, e essa conversa reúne TODO o histórico daquele número — role para cima e os atendimentos anteriores vão carregando. Para ver um atendimento específico isolado, abra Tickets anteriores no painel lateral direito e clique no cartão desejado.",
                        },
                        {
                            q: "O cliente não aparece em Resolvidos. Por quê?",
                            a: "Porque ele tem atendimento em andamento naquela conexão: enquanto houver ticket aberto ou pendente, ele fica só nessas abas. Abra a conversa atual e use Tickets anteriores no painel lateral para consultar o histórico encerrado.",
                        },
                        {
                            q: "Estou vendo um ticket anterior e sumiu o campo de mensagem.",
                            a: "É proposital: trecho antigo é somente leitura, para ninguém responder dentro de um atendimento já encerrado. Clique em Retornar para a conversa geral — o cliente tem um ticket único por conexão e é nele que a conversa continua.",
                        },
                        {
                            q: "Por que o histórico de um número não mostra as conversas do outro?",
                            a: "Cada conexão (número de WhatsApp ou conta do Instagram) é um atendimento independente. Se o cliente falou 3 vezes no número A e 5 no número B, o ticket do A mostra só as 3 do A e o do B só as 5 do B — inclusive na lista de Tickets anteriores.",
                        },
                        {
                            q: "Não acho a conversa de um cliente na lista. Sumiu?",
                            a: "Não. A lista mostra as 100 conversas mais recentes (use Carregar mais no fim para trazer as próximas) — se o cliente falou há mais tempo, ele está mais para baixo. Em vez de rolar, digite o nome ou o telefone no campo de busca: ela consulta o banco inteiro e traz TODAS as conversas daquele cliente na aba em que você está. Se não aparecer, o ticket provavelmente está em outra aba — repita a busca em Pendentes ou Resolvidos.",
                        },
                        {
                            q: "Como vejo só as conversas que aguardam resposta?",
                            a: "Use o botão Não respondidas ao lado da busca: a lista passa a mostrar apenas as conversas cuja última mensagem é do cliente (bolinha laranja e barra laranja na lateral do cartão). O filtro procura no banco inteiro, não só nas conversas já carregadas — a barra acima da lista mostra o total encontrado e a exibição continua de 100 em 100 (use Carregar mais no fim). Clique de novo para voltar à lista completa.",
                        },
                        {
                            q: "Grupos de WhatsApp têm atendente responsável?",
                            a: "Não. Conversa de grupo nunca é atribuída a um atendente — ela fica visível para toda a equipe na aba Grupos, independente de escopo ou atribuição. Se alguém tentar atribuir, o sistema ignora e o grupo continua compartilhado. A exceção é o botão Restringir Grupo (abaixo).",
                        },
                        {
                            q: "Como vejo os detalhes de um grupo (foto, descrição, participantes)?",
                            a: "Clique no nome do grupo no topo do chat: abre um modal com a foto, o nome, a descrição, as mídias trocadas e a lista de participantes (foto, nome e número). Clicar em um participante abre o modal de nova mensagem já preenchido com o contato e a conexão do grupo pré-selecionada — você pode trocar a conexão; se escolher uma conexão da API oficial (Meta) sem janela de 24h aberta, será pedido um template aprovado, como em qualquer nova mensagem.",
                        },
                        {
                            q: "De onde vem a foto de perfil do contato?",
                            a: "Das conexões não oficiais: a cada interação do cliente, o sistema pega a foto do próprio WhatsApp e a guarda de forma permanente — inclusive quando o contato ainda está sem foto. A API oficial (Meta) não fornece foto de perfil, então interações por ela nunca alteram nem apagam a foto já obtida: quem tem as duas conexões mantém a foto capturada pela não oficial mesmo que o cliente passe a conversar pelo número oficial.",
                        },
                        {
                            q: "Sou avisado quando alguém entra ou sai de um grupo?",
                            a: "Sim. Quando um participante entra ou sai de um grupo (conexões não oficiais), aparece uma notificação centralizada no chat — no mesmo estilo das notificações de transferência — informando quem entrou ou saiu e o horário. Essas notificações não contam como última mensagem da conversa.",
                        },
                        {
                            q: "Aparece um aviso quando alguém visualiza a conversa?",
                            a: "Sim, para atendentes (agentes): a primeira vez que um agente abre uma conversa pelo inbox, o sistema registra uma notificação centralizada no chat — no mesmo estilo das transferências — com 'O colaborador <nome> visualizou essa conversa' e a data/hora. É registrada só uma vez por agente em cada conversa, fica visível para toda a equipe e não conta como última mensagem. Supervisores e administradores não disparam esse aviso, e abrir a conversa pela janelinha (modal) também não.",
                        },
                        {
                            q: "Dá para saber quem encerrou a conversa e com qual etapa?",
                            a: "Sim. Ao encerrar a negociação (pelo botão do chat, arrastando o card no CRM ou por qualquer outro caminho), fica registrada no fim do chat uma notificação centralizada — no mesmo estilo das transferências — com 'DD/MM/AAAA HH:MM - O colaborador <nome> finalizou essa conversa com a etapa <etapa>'. Quando o encerramento é automático (encerramento por inatividade, campanha ou integração), o aviso aparece como 'O sistema finalizou essa conversa...'. Esse aviso fica visível para toda a equipe ao reabrir a conversa encerrada e não conta como última mensagem na lista.",
                        },
                        {
                            q: "O que é o Monitoramento de Grupos?",
                            a: "Uma captação automática de leads dentro de um grupo (conexões não oficiais). Abra o grupo, menu lateral direito → Monitoramento: defina um termo (ex.: 'eu quero'), o modo (contém/igual), a mensagem de abordagem (as variáveis {{nome_cliente}}, {{telefone}} e {{servico}} aparecem como botões clicáveis abaixo do campo — clique para inserir), a validade e, se quiser, ligue 'Enviar botões de escolha' (até 3 botões de resposta rápida enviados junto da abordagem). Ligando 'IA aborda', você define a Função da IA (Agendamento ou Qualificação), o objetivo, os serviços — pelo botão 'Adicionar serviço', escolhendo o serviço inteiro ou só aplicações específicas — e o desconto. Quando um participante escrever o termo no grupo, ele ganha a tag 'Monitoramento - <grupo> - <data>', recebe a mensagem no privado (conversa 1:1 criada na hora) e cai na fila da IA ou do humano. Só a primeira mensagem com o termo dispara; mensagens suas são ignoradas. Criar/encerrar é para admin e supervisor; cada grupo tem no máximo 1 monitoramento ativo.",
                        },
                        {
                            q: "O que significam as bordas coloridas nas fotos dentro do grupo monitorado?",
                            a: "São os leads capturados pelo monitoramento: verde = conversa 1:1 aberta com a equipe; laranja = aguardando atendimento humano; lilás = aguardando a IA; azul-claro = conversa encerrada. A mensagem-gatilho (a que contém o termo) ganha borda na própria bolha. O botão Monitoramento (radar) no topo do chat filtra o grupo para mostrar só as mensagens-gatilho — todos da equipe podem usar o filtro. Ao encerrar ou expirar o monitoramento, bordas, filtro e tags somem; o histórico fica no Dashboard → Campanhas → Monitoramento.",
                        },
                        {
                            q: "Posso esconder um grupo de alguns membros da equipe?",
                            a: "Sim. Abra o grupo e clique em Restringir Grupo no topo do chat: todos começam marcados (visível); desmarque quem não deve ver aquele grupo e salve — o grupo some do inbox da pessoa. Supervisores podem restringir apenas atendentes; o admin restringe atendentes e supervisores. Admins nunca podem ser restringidos.",
                        },
                        {
                            q: "Como transfiro uma conversa para outro setor ou colega?",
                            a: "Use o botão Transferir Atendimento no topo do chat: escolha a fila e depois o responsável (ou 'Não atribuir usuário'). Lembre: tirar da fila Atendimento IA desliga a IA para aquela conversa.",
                        },
                        {
                            q: "Por que um colega não aparece na lista de transferência?",
                            a: "Ele é um atendente com escopo de visão restrito: só aparece se a fila escolhida E a conexão da conversa estiverem liberadas para ele. O admin ajusta isso na página Equipe, ao editar o membro. Admins e supervisores aparecem sempre.",
                        },
                        {
                            q: "Quem enviou cada mensagem? E se a assinatura estiver desligada?",
                            a: "Toda mensagem enviada mostra o nome de quem a enviou acima do balão verde (ou 'IA' quando foi a assistente/automação). Isso independe da opção 'Assinar mensagens' das Configurações: ela controla apenas se o nome vai junto no texto que o CLIENTE recebe no WhatsApp — no painel, o remetente aparece sempre. Respostas enviadas FORA do Clinvia (ex.: pelo app do WhatsApp Business no celular) aparecem como 'Enviada de fonte externa' — assim dá para monitorar o uso fora do painel. Mensagens antigas enviadas com a assinatura desligada não guardaram o remetente: nessas, o rótulo fica em branco (nunca 'IA' por engano).",
                        },
                        {
                            q: "Comecei a mensagem com um título em negrito (ex.: *Convênio:*) e ele sumiu do painel. O cliente recebeu?",
                            a: "O cliente sempre recebeu o texto completo — o que falhava era só a exibição no painel. O sistema tira do balão o nome do atendente que vai junto na assinatura, e antes ele confundia qualquer palavra em negrito seguida de dois-pontos na primeira linha com essa assinatura, apagando a linha inteira. Agora a linha só é removida quando o negrito é mesmo o nome de quem enviou. Se você viu isso em mensagens antigas, elas voltam a aparecer inteiras.",
                        },
                        {
                            q: "Como sei onde termina o atendimento antigo e começa o novo?",
                            a: "Quando um cliente volta a conversar depois de um atendimento encerrado, o chat carrega o histórico das conversas anteriores e insere uma pílula centralizada (mesmo estilo das notificações de transferência) no início de cada ticket: 'Conversa iniciada dia <data> pelo atendente <nome>' — ou 'pelo cliente <nome>' quando foi o cliente quem mandou a primeira mensagem, e 'pela IA' quando a primeira mensagem foi da assistente. Assim fica claro onde cada novo ticket começou.",
                        },
                        {
                            q: "Como vejo a data de cada mensagem na conversa?",
                            a: "De duas formas: toda mensagem exibe data e hora juntas no cantinho do balão (ex.: '25/08/2026 14:32'); e a primeira mensagem de cada dia ganha um separador de data centralizado — 'Hoje', 'Ontem' ou 'Segunda-feira, 25/08/2026' — no mesmo estilo das notificações de transferência. Assim a conversa vira uma linha do tempo por blocos de dia, tanto no inbox quanto no modal de conversa.",
                        },
                        {
                            q: "O modal de conversa (janelinha) mostra tudo que o inbox mostra?",
                            a: "Sim — mesma timeline: mensagens, notas roxas, transferências (pílula azul) e o remetente de cada envio. Abaixo do nome do contato ele mostra o atendente responsável e a fila da conversa, atualizados em tempo real quando há transferência.",
                        },
                        {
                            q: "Cliente escreveu no Instagram e no WhatsApp. São duas conversas?",
                            a: "Sim, uma por canal — mas você pode vincular o contato do Instagram ao do WhatsApp (página Clientes), e o sistema passa a tratá-los como a mesma pessoa.",
                        },
                    ].map((f, i, arr) => (
                        <AccordionItem key={i} value={`faq-${i}`} className={i === arr.length - 1 ? "border-b-0" : ""}>
                            <AccordionTrigger className="text-left text-sm font-semibold">{f.q}</AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </TopicSection>
        </div>
    );
}
