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
    { id: "historico", label: "Histórico" },
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
                        <LearnChip topicId="historico">Onde ficam as conversas antigas</LearnChip>
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
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/?tour=inbox-atender")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
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
                    { title: "Encontre a conversa", description: "Use os filtros da lista (fila, tag, instância, usuário responsável, status, busca por nome/telefone) ou o sino de notificações. O filtro de usuário mostra todas as conversas atribuídas a um colega — ou as sem atribuição. Conversas pendentes têm destaque." },
                    { title: "Assuma o atendimento", description: <>Clique em <strong>Atender</strong>. A conversa vira "em atendimento", ganha seu nome como responsável e a IA para na hora.</>, },
                    { title: "Converse", description: "Texto, áudio, imagem, documento, resposta citada, encaminhamento... tudo pelo campo de mensagem. O cliente recebe no WhatsApp normalmente." },
                    { title: "Precisa de outro setor? Transfira", description: <>Clique em <strong>Transferir Atendimento</strong> no topo do chat: escolha a fila e, se quiser, o colega responsável (detalhes no próximo tópico).</>, },
                    { title: "Encerre quando resolver", description: <>Clique em <strong>Resolver</strong>. As mensagens vão para o histórico do contato e, se o cliente voltar, nasce uma conversa nova. Quem resolve leva a atribuição: mesmo que a conversa não estivesse com você, ao encerrá-la ela passa a contar como atendimento seu (inclusive no Monitoramento).</>, },
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
                <Callout type="atencao" title="Por que nem todo colega aparece na lista?">
                    Atendentes podem ter <strong>escopo de visão</strong> (definido em Equipe): conexões liberadas e filas
                    atribuídas. Se a fila escolhida ou a conexão da conversa estiver fora do escopo do colega, ele não aparece —
                    de nada adiantaria transferir para quem não enxerga a conversa.
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
                        { t: "Dados e etapa do CRM", d: "Nome, telefone, etiquetas, categoria (contato/lead/cliente) e a etapa atual no funil." },
                        { t: "Negociação rápida", d: "Crie ou edite a negociação (serviços + valores) sem abrir o CRM — o card do funil nasce dali." },
                        { t: "Resumo e sentimento", d: "Resumo da conversa gerado pela IA e o termômetro do humor do cliente." },
                        { t: "Atalhos", d: "Registrar venda, criar agendamento e abrir o perfil completo em um clique." },
                    ].map((x) => (
                        <div key={x.t} className="rounded-xl border p-3.5">
                            <p className="text-sm font-semibold">{x.t}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{x.d}</p>
                        </div>
                    ))}
                </div>
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
                <Callout type="atencao" title="Janela de 24h no WhatsApp Oficial">
                    No número oficial, você só pode mandar texto livre até <strong>24h após a última mensagem do cliente</strong>.
                    Passou disso, é preciso usar um template aprovado (ou esperar o cliente escrever). O sistema avisa quando a
                    janela fecha.
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
            </TopicSection>

            {/* 9 */}
            <TopicSection id="historico" index={9} icon={Archive} title="Histórico de conversas"
                subtitle="Nada se perde ao resolver">
                <p className="text-sm text-muted-foreground">
                    Ao resolver uma conversa, as mensagens são <strong className="text-foreground">arquivadas no histórico do
                    contato</strong>. Quando ele escrever de novo, a conversa nova mostra também o histórico anterior — você (e
                    a IA) sempre têm o contexto completo.
                </p>
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
                            a: "Mensagens não lidas. Ao abrir a conversa, o contador zera. Os balões vermelhos nas abas Abertos/Pendentes/Grupos somam as não lidas e respeitam os Filtros Avançados: com um filtro de fila, tag, conexão ou usuário aplicado, o balão mostra só as não lidas daquele recorte — se os clientes do filtro não têm nada não lido, o balão some.",
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
