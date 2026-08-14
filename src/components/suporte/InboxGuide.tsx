import { useNavigate } from "react-router-dom";
import {
    MessageSquare, ListChecks, Headset, Bot, PanelRight, Paperclip, Archive,
    HelpCircle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { ConversationFlowSimulator } from "./simulators-inbox";

// ---------------------------------------------------------------------------
// Manual da aba Inbox
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "filas-e-status", label: "Filas e status" },
    { id: "atendendo", label: "Atendendo" },
    { id: "ia-no-inbox", label: "IA no inbox" },
    { id: "sidebar", label: "Painel lateral" },
    { id: "midias-acoes", label: "Mídias e ações" },
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
                    IA pode atuar (só na fila Atendimento IA).
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
                    { title: "Encontre a conversa", description: "Use os filtros da lista (fila, status, busca por nome/telefone) ou o sino de notificações. Conversas pendentes têm destaque." },
                    { title: "Assuma o atendimento", description: <>Clique em <strong>Atender</strong>. A conversa vira "em atendimento", ganha seu nome como responsável e a IA para na hora.</>, },
                    { title: "Converse", description: "Texto, áudio, imagem, documento, resposta citada, encaminhamento... tudo pelo campo de mensagem. O cliente recebe no WhatsApp normalmente." },
                    { title: "Encerre quando resolver", description: <>Clique em <strong>Resolver</strong>. As mensagens vão para o histórico do contato e, se o cliente voltar, nasce uma conversa nova.</>, },
                ]} />
                <Callout type="pratica" title="Encerre sempre que concluir">
                    Conversa encerrada = fila limpa, métricas corretas (tempo de atendimento) e IA liberada para o próximo
                    contato do cliente. Conversa esquecida aberta trava a IA para aquele cliente.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="ia-no-inbox" index={4} icon={Bot} title="A IA dentro do inbox"
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

            {/* 5 */}
            <TopicSection id="sidebar" index={5} icon={PanelRight} title="Painel de inteligência"
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

            {/* 6 */}
            <TopicSection id="midias-acoes" index={6} icon={Paperclip} title="Mídias e ações nas mensagens"
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
                <Callout type="atencao" title="Janela de 24h no WhatsApp Oficial">
                    No número oficial, você só pode mandar texto livre até <strong>24h após a última mensagem do cliente</strong>.
                    Passou disso, é preciso usar um template aprovado (ou esperar o cliente escrever). O sistema avisa quando a
                    janela fecha.
                </Callout>
            </TopicSection>

            {/* 7 */}
            <TopicSection id="historico" index={7} icon={Archive} title="Histórico de conversas"
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

            {/* 8 */}
            <TopicSection id="faq" index={8} icon={HelpCircle} title="Perguntas frequentes">
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
                            a: "Mensagens não lidas. Ao abrir a conversa, o contador zera.",
                        },
                        {
                            q: "Como transfiro uma conversa para outro setor?",
                            a: "Mude a fila da conversa (menu da conversa > fila). Lembre: tirar da fila Atendimento IA desliga a IA para aquela conversa.",
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
