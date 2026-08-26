import { useNavigate } from "react-router-dom";
import {
    KanbanSquare, Columns3, ArrowLeftRight, Flag, IdCard, HandCoins, UserCheck,
    HelpCircle, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { StageSyncSimulator } from "./simulators-crm";

// ---------------------------------------------------------------------------
// Manual da aba CRM
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "estagios", label: "As 16 etapas" },
    { id: "sync-fila", label: "Etapa ↔ fila" },
    { id: "terminais", label: "Etapas terminais" },
    { id: "funil-por-conexao", label: "Um funil por conexão" },
    { id: "negociacoes", label: "Negociações" },
    { id: "client-stage", label: "Contato, lead, cliente" },
    { id: "faq", label: "FAQ" },
];

const IA_GROUP = ["Em Atendimento IA", "Qualificado", "Agendado", "Pesquisa de Satisfação", "Recorrência", "Follow Up"];
const HUMAN_GROUP = ["Em Atendimento Humano", "Aguardando Pagamento", "Suporte", "Financeiro", "Pós-Venda"];
const TERMINAL_GROUP = ["Ganho", "Perdido", "Sem Contato", "Sem Interesse", "Finalizado"];

export function CrmGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <KanbanSquare className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Manual do CRM</h1>
                        <p className="text-sm text-muted-foreground">
                            O funil de vendas da clínica: cada cliente é um card que caminha do primeiro contato até o Ganho.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="estagios">Conhecer as 16 etapas</LearnChip>
                        <LearnChip topicId="sync-fila">Como etapa e fila andam juntas</LearnChip>
                        <LearnChip topicId="funil-por-conexao">Um funil para cada conexão</LearnChip>
                        <LearnChip topicId="terminais">O que as etapas terminais fazem</LearnChip>
                        <LearnChip topicId="negociacoes">Registrar negociações com valores</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection id="o-que-e" index={1} icon={KanbanSquare} title="O que é o CRM?"
                subtitle="O quadro que mostra onde cada cliente está na jornada">
                <p className="text-sm text-muted-foreground">
                    O CRM é um <strong className="text-foreground">quadro de colunas (kanban)</strong>: cada coluna é uma etapa
                    da jornada e cada <strong className="text-foreground">card é um cliente</strong> com sua negociação (serviços
                    de interesse e valor). Arraste o card entre colunas conforme a conversa evolui — ou deixe que a IA e as
                    automações movam por você.
                </p>
                <p className="text-sm text-muted-foreground">
                    O quadro se alimenta sozinho: cliente novo que chama no WhatsApp ganha card automaticamente, agendamento
                    move para "Agendado", venda concluída leva ao "Ganho".
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/crm?tour=crm-board")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Me mostre na prática
                    </Button>
                </div>
            </TopicSection>

            {/* 2 */}
            <TopicSection id="estagios" index={2} icon={Columns3} title="As 16 etapas"
                subtitle="Três grupos: IA, humano e terminais">
                <div className="space-y-3">
                    <div className="rounded-xl border p-3.5">
                        <p className="mb-2 text-sm font-semibold text-violet-600 dark:text-violet-400">Grupo da IA — a assistente pode trabalhar</p>
                        <div className="flex flex-wrap gap-1.5">
                            {IA_GROUP.map((s) => (
                                <Badge key={s} variant="outline" className="border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300">{s}</Badge>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Cards aqui mantêm a conversa na fila Atendimento IA (se a IA estiver ligada). A IA qualifica, agenda e acompanha.
                        </p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <p className="mb-2 text-sm font-semibold text-blue-600 dark:text-blue-400">Grupo humano — cada etapa tem sua fila</p>
                        <div className="flex flex-wrap gap-1.5">
                            {HUMAN_GROUP.map((s) => (
                                <Badge key={s} variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-300">{s}</Badge>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Mover o card para cá envia a conversa para a fila do setor (Atendimento Humano, Suporte, Financeiro, Pós-Venda) — e a IA para.
                            "Aguardando Pagamento" (entre Qualificado e Agendado no quadro) também manda a conversa para a fila Atendimento Humano: um colaborador assume para conduzir o pagamento.
                        </p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-400">Terminais — o fim da jornada</p>
                        <div className="flex flex-wrap gap-1.5">
                            {TERMINAL_GROUP.map((s) => (
                                <Badge key={s} variant="outline" className="border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300">{s}</Badge>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            O card vira histórico e os atendimentos abertos são encerrados (detalhes no tópico 4).
                        </p>
                    </div>
                </div>
            </TopicSection>

            {/* 3 */}
            <TopicSection id="sync-fila" index={3} icon={ArrowLeftRight} title="Etapa e fila andam juntas"
                subtitle="A regra mais importante do CRM — teste no simulador">
                <StageSyncSimulator />
                <Callout type="dica" title="Vale nos dois sentidos">
                    Mover a <strong>conversa de fila</strong> no inbox (botão Transferir Atendimento) também move o card:
                    mandar para a fila Suporte leva o card para a etapa Suporte, e vice-versa. Você nunca precisa atualizar os
                    dois lugares.
                </Callout>
                <Callout type="atencao" title="Atendentes com escopo veem menos cards">
                    Se um agente tem escopo de visão (conexões, filas e tags liberadas na página Equipe), o quadro dele mostra
                    apenas os cards das conversas dentro do escopo. Admin vê o quadro completo — não é card sumido, é filtro.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection id="terminais" index={4} icon={Flag} title="Etapas terminais"
                subtitle="Ganho, Perdido, Sem Contato, Sem Interesse, Finalizado">
                <StepByStep steps={[
                    { title: "O card vira histórico", description: "Ele some do quadro (as colunas terminais mostram só os recentes) e fica registrado no perfil do cliente, com data e motivo." },
                    { title: "Os atendimentos abertos são ENCERRADOS", description: "Arrastar o card para uma etapa terminal no quadro fecha os tickets abertos/pendentes do cliente automaticamente — jornada concluída, conversa concluída." },
                    { title: "Encerrando pelo chat, só aquela conversa fecha", description: "Quando você usa Resolver no inbox e escolhe a etapa final, o sistema encerra apenas aquele atendimento. Se o cliente tiver conversa aberta em outra instância/número, ela continua ativa e ganha um novo card no funil." },
                    { title: "Sem Interesse pede o motivo", description: "Uma janela pergunta o porquê (preço, tempo, concorrente...). Esses motivos viram relatório para você entender as perdas." },
                    { title: "Se o cliente voltar, tudo recomeça", description: "Nova mensagem = nova conversa + novo card, começando a jornada do zero. O histórico antigo continua no perfil." },
                ]} />
                <Callout type="atencao" title="Mover para terminal encerra o ticket!">
                    É intencional: um cliente "Perdido" com conversa aberta seria um contrassenso. Se ainda precisa conversar,
                    mova o card só quando o papo terminar. E quem move leva a atribuição: a conversa encerrada passa a contar
                    como atendimento de quem arrastou o card (aparece no Monitoramento em seu nome).
                </Callout>
                <Callout type="dica" title='O botão "Ver mais" no fim da coluna'>
                    As colunas terminais acumulam milhares de cards com o tempo. Para o quadro abrir rápido, cada coluna
                    mostra os 30 primeiros e o botão <strong className="text-foreground">Ver mais</strong> carrega o
                    próximo lote. O número no topo da coluna e o valor total continuam contando{" "}
                    <strong className="text-foreground">todos</strong> os cards, não só os que estão à vista — e o filtro
                    da coluna (lupa) procura na lista inteira.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection id="funil-por-conexao" index={5} icon={IdCard} title="Um funil por conexão"
                subtitle="Cada número (e cada Instagram) tem o seu próprio quadro">
                <p className="text-sm text-muted-foreground">
                    Se a clínica tem mais de uma conexão, o topo do CRM mostra{" "}
                    <strong className="text-foreground">uma aba por número e uma por conta do Instagram</strong>, além da aba{" "}
                    <strong className="text-foreground">Todos</strong>. Cada aba é um funil independente: o card daquele cliente
                    naquele número. A aba escolhida fica guardada no endereço da página, então dá para deixar salvo nos favoritos.
                </p>
                <p className="text-sm text-muted-foreground">
                    Dentro de uma conexão vale a regra de sempre:{" "}
                    <strong className="text-foreground">1 card ativo por cliente</strong> — nova conversa ou novo agendamento
                    reaproveitam o card em vez de criar outro. O que mudou é que o mesmo cliente{" "}
                    <strong className="text-foreground">pode estar em etapas diferentes em cada conexão</strong>: em
                    "Em Atendimento IA" no número que tem IA e em "Em Atendimento Humano" no número da recepção, por exemplo.
                </p>
                <Callout type="atencao" title="O mesmo nome pode aparecer duas vezes em Todos">
                    Não é duplicidade. Na aba Todos os cards de todas as conexões aparecem juntos, e cada card ganha uma
                    etiqueta com o nome da conexão. Por isso os totais do quadro podem ter subido — cada funil conta o seu.
                </Callout>
                <Callout type="dica" title="Mexer em uma conexão não mexe na outra">
                    Arrastar o card na aba de um número muda a fila só da conversa daquele número. "Encerrar negociação" no
                    inbox encerra só o atendimento daquela conversa — o card da outra conexão continua vivo.
                </Callout>
                <Callout type="dica" title='"Sumiu o card do fulano!"'>
                    Confira se você não está na aba de outra conexão. Se não estiver lá, ele chegou a uma etapa terminal (virou
                    histórico): abra o perfil do cliente na página Clientes, aba Negociações — a trajetória de cada conexão está lá,
                    com a etiqueta do número.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="negociacoes" index={6} icon={HandCoins} title="Negociações: serviços e valores"
                subtitle="O que dá dinheiro ao funil">
                <p className="text-sm text-muted-foreground">
                    Cada card carrega uma <strong className="text-foreground">negociação</strong>: os serviços de interesse do
                    cliente com quantidade e valor. É esse valor que aparece no card e soma nos totais por coluna.
                </p>
                <StepByStep steps={[
                    { title: "Pelo inbox (mais rápido)", description: "No painel lateral da conversa, clique na negociação e adicione os serviços — sem sair do chat." },
                    { title: "Pelo CRM", description: "Clique no card > Negociações, ou use o botão de criar negociação no topo da página." },
                    { title: "O preço vem do catálogo", description: "Os valores sugeridos vêm dos seus serviços cadastrados (página Serviços) — dá para ajustar caso negocie um desconto." },
                ]} />
            </TopicSection>

            {/* 7 */}
            <TopicSection id="client-stage" index={7} icon={UserCheck} title="Contato, Lead ou Cliente"
                subtitle="A categoria automática de cada pessoa">
                <p className="text-sm text-muted-foreground">
                    Todo contato tem uma categoria calculada <strong className="text-foreground">automaticamente</strong> pelas
                    compras dele — você não precisa (nem consegue) marcar na mão:
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border p-3.5">
                        <Badge variant="outline" className="border-0 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">Contato</Badge>
                        <p className="mt-1.5 text-sm text-muted-foreground">Nunca comprou nada. Todo mundo começa aqui.</p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <Badge variant="outline" className="border-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300">Lead</Badge>
                        <p className="mt-1.5 text-sm text-muted-foreground">Só comprou Avaliação — mostrou interesse, ainda não fechou procedimento.</p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                        <Badge variant="outline" className="border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">Cliente</Badge>
                        <p className="mt-1.5 text-sm text-muted-foreground">Comprou qualquer serviço além de avaliação. A meta é todo mundo chegar aqui.</p>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    O selo aparece no card do CRM, no topo da conversa e na página Clientes — e você pode filtrar por ele em
                    campanhas e relatórios.
                </p>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="faq" index={8} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="rounded-xl border px-4">
                    {[
                        {
                            q: "Movi o card e a conversa mudou de fila sozinha. É bug?",
                            a: "Não — é a regra central do CRM: etapa e fila são espelho uma da outra. Mover o card para uma etapa humana tira a conversa da IA; mover para uma etapa de IA devolve (se a IA estiver ligada).",
                        },
                        {
                            q: "O card sumiu do quadro. Onde foi parar?",
                            a: "Ele chegou a uma etapa terminal (Ganho, Perdido, Sem Contato, Sem Interesse ou Finalizado) e virou histórico. Veja no perfil do cliente, aba Negociações.",
                        },
                        {
                            q: "Movi para Sem Interesse e o atendimento fechou. Por quê?",
                            a: "Etapas terminais encerram os tickets abertos do cliente automaticamente — jornada encerrada, conversa encerrada. Se ele responder depois, nasce conversa e card novos.",
                        },
                        {
                            q: "Por que não consigo criar dois cards para a mesma pessoa?",
                            a: "Dentro da mesma conexão vale 1 card ativo por cliente: evita duplicidade e números inflados no funil. Termine a jornada atual (terminal) e um novo card poderá nascer. Em outra conexão, sim: cada número/Instagram tem o seu próprio card.",
                        },
                        {
                            q: "O mesmo cliente apareceu duas vezes na aba Todos. É duplicidade?",
                            a: "Não. Ele tem conversa em duas conexões, e cada conexão tem o seu funil — repare na etiqueta com o nome do número em cada card. Se quiser ver um funil de cada vez, use as abas do topo.",
                        },
                        {
                            q: "Movi o card em um número e o outro não mudou. Está certo?",
                            a: "Sim. Cada conexão é independente: mover o card muda a fila só das conversas daquela conexão. É isso que permite o cliente estar com a IA num número e com a equipe no outro.",
                        },
                        {
                            q: "O agendamento moveu o card sozinho para Agendado. Como?",
                            a: "Automático: criar agendamento (pela equipe, pela IA ou pelo link público) move o card ativo para Agendado. Concluir o atendimento leva ao Ganho com a venda registrada.",
                        },
                        {
                            q: "Posso mudar as etapas do funil?",
                            a: "As 16 etapas são fixas — elas sustentam as automações (filas, IA, confirmações, campanhas). Para organizar times, use as filas de atendimento e as etiquetas.",
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
