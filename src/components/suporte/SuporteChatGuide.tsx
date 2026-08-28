import { useNavigate } from "react-router-dom";
import {
    Headphones, MessageSquarePlus, Flame, ListChecks, Bell, HelpCircle, ExternalLink,
    Sparkles, Megaphone, History, ArrowRightLeft, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Callout, LearnChip, StepByStep, SubNav, TopicSection } from "./blocks";
import { SUPPORT_PRIORITY_CONFIG, SUPPORT_STATUS_CONFIG, SUPPORT_STATUS_ORDER } from "@/types/support";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Manual do atendimento com o suporte Clinvia (botão flutuante + página /support)
// ---------------------------------------------------------------------------

const TOPICS = [
    { id: "o-que-e", label: "O que é" },
    { id: "assistente", label: "Assistente virtual" },
    { id: "abrir", label: "Abrir chamado" },
    { id: "avisos", label: "Avisos" },
    { id: "prioridade", label: "Prioridade" },
    { id: "status", label: "Status" },
    { id: "resposta", label: "A resposta" },
    { id: "faq", label: "FAQ" },
];

export function SuporteChatGuide() {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            {/* Hero */}
            <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Headphones className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Falar com o suporte</h1>
                        <p className="text-sm text-muted-foreground">
                            Um chat direto com o time da Clinvia, dentro do próprio sistema. Você escreve, a
                            gente responde no mesmo lugar — sem e-mail, sem sair da tela.
                        </p>
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        O que você vai aprender
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <LearnChip topicId="assistente">Como o assistente atende</LearnChip>
                        <LearnChip topicId="abrir">Onde fica o botão</LearnChip>
                        <LearnChip topicId="avisos">A aba de avisos</LearnChip>
                        <LearnChip topicId="status">O que cada status significa</LearnChip>
                        <LearnChip topicId="resposta">Onde chega a resposta</LearnChip>
                    </div>
                </div>
            </div>

            <SubNav topics={TOPICS} />

            {/* 1 */}
            <TopicSection
                id="o-que-e"
                index={1}
                icon={Headphones}
                title="O que é o suporte da Clinvia?"
                subtitle="Uma conversa, não um formulário"
            >
                <p className="text-sm text-muted-foreground">
                    O suporte funciona como um <strong className="text-foreground">chat</strong>: você escreve a
                    dúvida e a conversa continua ali, com idas e vindas, até resolver. Quem responde primeiro é
                    o <strong className="text-foreground">assistente virtual</strong>; quando ele não resolve, a
                    conversa passa para a equipe no mesmo lugar. Nada se perde — o histórico completo fica
                    guardado em <strong className="text-foreground">Suporte</strong>, no menu lateral.
                </p>
                <p className="text-sm text-muted-foreground">
                    O botão flutuante abre um painel com duas abas:{" "}
                    <strong className="text-foreground">Suporte</strong> (a conversa) e{" "}
                    <strong className="text-foreground">Avisos</strong> (as novidades publicadas pela Clinvia).
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/support")}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir meus chamados
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/?tour=suporte-chat")}>
                        Ver onde fica o botão
                    </Button>
                </div>
                <Callout type="dica" title="Dois caminhos, o mesmo chat">
                    O <strong>botão flutuante</strong> serve para o dia a dia (pergunta rápida sem sair da
                    tela). A <strong>página Suporte</strong> mostra tudo com mais espaço: métricas, filtros e o
                    histórico inteiro.
                </Callout>
            </TopicSection>

            {/* 2 */}
            <TopicSection
                id="assistente"
                index={2}
                icon={Sparkles}
                title="O assistente virtual"
                subtitle="Quem atende você primeiro"
            >
                <p className="text-sm text-muted-foreground">
                    Toda conversa começa com o <strong className="text-foreground">Assistente Clinvia</strong>.
                    Ele conhece este manual inteiro — sabe em qual aba fica cada informação, quais são os passos
                    de cada tela e quais guias interativos você pode rodar para ver na prática. Na maioria das
                    dúvidas do dia a dia a resposta chega em segundos.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border p-3">
                        <p className="text-sm font-semibold">O que ele faz</p>
                        <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                            <li>Explica o passo a passo de qualquer tela</li>
                            <li>Indica a aba do manual e o guia interativo certo</li>
                            <li>Consulta dados da sua conta para orientar (conexões, IA ligada, conversas abertas)</li>
                        </ul>
                    </div>
                    <div className="rounded-xl border p-3">
                        <p className="text-sm font-semibold">O que ele nunca faz</p>
                        <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                            <li>Criar, editar ou apagar qualquer coisa na sua conta</li>
                            <li>Prometer alteração ou executar ação no seu lugar</li>
                            <li>Inventar procedimento que não está no manual</li>
                        </ul>
                    </div>
                </div>
                <Callout type="dica" title="Ele só consulta, quem executa é você">
                    O assistente pode olhar a configuração para te orientar melhor ("sua conexão está
                    desconectada, vá em Conexões e leia o QR"), mas a mudança é sempre feita por você — ou pela
                    equipe de suporte, se você pedir.
                </Callout>
                <div className="rounded-xl border p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                        Quando ele transfere
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Se a dúvida foge do manual, envolve a sua conta especificamente ou parece um erro do
                        sistema, o assistente encaminha sozinho e avisa:{" "}
                        <em>
                            "Seu atendimento foi encaminhado para a equipe de suporte. Assim que um especialista
                            estiver disponível ele entrará em contato por esse chat."
                        </em>{" "}
                        A partir daí é a equipe que responde, <strong>na mesma conversa</strong> — você não
                        precisa repetir nada, porque o time recebe um resumo do que já foi conversado.
                    </p>
                </div>
            </TopicSection>

            {/* 3 */}
            <TopicSection
                id="abrir"
                index={3}
                icon={MessageSquarePlus}
                title="Como abrir um chamado"
                subtitle="Não tem formulário: é só escrever"
            >
                <StepByStep
                    steps={[
                        {
                            title: "Clique no botão azul de fone",
                            description: (
                                <>
                                    Ele fica no <strong>canto inferior esquerdo</strong>, colado na borda do menu
                                    lateral. Quando o menu abre no passar do mouse, o botão acompanha e continua
                                    visível.
                                </>
                            ),
                            icon: Headphones,
                        },
                        {
                            title: "Escreva a sua dúvida na aba Suporte",
                            description: (
                                <>
                                    Não há assunto nem prioridade para preencher: o chamado{" "}
                                    <strong>nasce na primeira mensagem</strong> e o próprio assistente dá um
                                    título para ele. Se preferir, clique em um dos exemplos da tela inicial.
                                </>
                            ),
                            icon: Sparkles,
                        },
                        {
                            title: "Conte onde acontece e o que apareceu",
                            description: (
                                <>
                                    Quanto mais detalhe — <strong>a tela, o que você esperava e o que apareceu</strong>{" "}
                                    — mais rápido vem a solução, tanto do assistente quanto da equipe.
                                </>
                            ),
                            icon: ListChecks,
                        },
                        {
                            title: "Continue a conversa ali mesmo",
                            description:
                                "O chamado é um chat. Pode mandar mensagens novas a qualquer momento; se o assunto for outro, comece um chamado novo.",
                            icon: Bell,
                        },
                    ]}
                />
                <Callout type="dica" title="Ver chamados antigos">
                    O ícone de <strong>relógio</strong> no topo do painel abre o histórico completo. Clique em
                    qualquer chamado para reler a conversa inteira — inclusive os já concluídos. Para voltar ao
                    atendimento atual, use o botão no rodapé da lista.
                </Callout>
                <Callout type="pratica" title="Um assunto por chamado">
                    Problemas diferentes em chamados diferentes: cada um é atendido e concluído no seu ritmo.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection
                id="avisos"
                index={4}
                icon={Megaphone}
                title="A aba Avisos"
                subtitle="As novidades da Clinvia"
            >
                <p className="text-sm text-muted-foreground">
                    A segunda aba do painel mostra os{" "}
                    <strong className="text-foreground">avisos publicados pela Clinvia</strong>: novidades,
                    melhorias, correções e comunicados de manutenção. Cada aviso traz o tipo, a data e o texto
                    completo.
                </p>
                <p className="text-sm text-muted-foreground">
                    O que você ainda não leu aparece destacado com uma marca vermelha e a etiqueta{" "}
                    <em>novo</em>. Basta <strong className="text-foreground">abrir a aba</strong> para marcar
                    tudo como lido — e não volta a aparecer depois de recarregar a página.
                </p>
                <Callout type="dica" title="Uma bolinha só para as duas abas">
                    A bolinha vermelha do botão flutuante soma{" "}
                    <strong>respostas novas no chat + avisos não lidos</strong>. Cada aba mostra o seu próprio
                    número, então dá para saber de onde veio a novidade.
                </Callout>
            </TopicSection>

            {/* 5 */}
            <TopicSection
                id="prioridade"
                index={5}
                icon={Flame}
                title="A prioridade do chamado"
                subtitle="Ela organiza a fila do atendimento"
            >
                <p className="text-sm text-muted-foreground">
                    Você não precisa escolher: a prioridade é definida pelo assistente a partir do que você
                    contou, e a equipe pode ajustá-la depois. Ela aparece como etiqueta ao lado do chamado —
                    entenda o que cada uma quer dizer:
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                    {(["urgent", "high", "medium", "low"] as const).map((p) => {
                        const cfg = SUPPORT_PRIORITY_CONFIG[p];
                        const help: Record<typeof p, string> = {
                            urgent: "O sistema parou: ninguém consegue atender, mensagens não chegam.",
                            high: "Um recurso importante quebrou, mas dá para trabalhar contornando.",
                            medium: "Erro pontual, dúvida de uso, algo estranho que não trava o dia.",
                            low: "Sugestão, melhoria, dúvida sem pressa.",
                        } as any;
                        return (
                            <div key={p} className="rounded-xl border p-3">
                                <span
                                    className={cn(
                                        "inline-block rounded px-2 py-0.5 text-xs font-medium",
                                        cfg.bg,
                                        cfg.color
                                    )}
                                >
                                    {cfg.label}
                                </span>
                                <p className="mt-1.5 text-sm text-muted-foreground">{help[p]}</p>
                            </div>
                        );
                    })}
                </div>
                <Callout type="evite" title="Tudo urgente é o mesmo que nada urgente">
                    Dizer que <strong>tudo</strong> está parado faz o assistente marcar todos os seus chamados
                    como Urgente e perdemos a referência de quem realmente precisa passar na frente. Descreva o
                    impacto real — isso ajuda você.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection
                id="status"
                index={6}
                icon={ListChecks}
                title="O que cada status significa"
                subtitle="A bolinha colorida ao lado do chamado"
            >
                <div className="space-y-2">
                    {SUPPORT_STATUS_ORDER.map((s) => {
                        const cfg = SUPPORT_STATUS_CONFIG[s];
                        const Icon = cfg.icon;
                        const help: Record<string, string> = {
                            open: "Chamado aberto. Se ainda estiver com o assistente, ele já está respondendo; se foi transferido, o time ainda não olhou.",
                            viewed: "Um atendente já abriu seu chamado e está entendendo o caso.",
                            in_progress: "Estamos trabalhando nele — normalmente já há resposta no chat.",
                            resolved:
                                "Concluído. Se o problema voltar, é só responder na mesma conversa que ela reabre sozinha.",
                        };
                        return (
                            <div key={s} className="flex items-start gap-3 rounded-xl border p-3">
                                <span className={cn("mt-0.5 rounded-lg p-1.5", cfg.bg)}>
                                    <Icon className={cn("h-4 w-4", cfg.color)} />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold">{cfg.label}</p>
                                    <p className="text-sm text-muted-foreground">{help[s]}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </TopicSection>

            {/* 7 */}
            <TopicSection
                id="resposta"
                index={7}
                icon={Bell}
                title="Onde chega a resposta"
                subtitle="No mesmo chat, sem F5"
            >
                <p className="text-sm text-muted-foreground">
                    Tanto a resposta do assistente quanto a do atendente aparecem{" "}
                    <strong className="text-foreground">na hora</strong> no chat, sem precisar recarregar a
                    página. O botão flutuante ganha uma{" "}
                    <strong className="text-foreground">bolinha vermelha</strong> somando respostas novas e
                    avisos não lidos, e a lista de chamados mostra a etiqueta <em>respondido</em>.
                </p>
                <p className="text-sm text-muted-foreground">
                    Dá para saber quem falou pelo balão: o do{" "}
                    <strong className="text-foreground">assistente</strong> é lilás e assinado "Assistente
                    Clinvia"; o do <strong className="text-foreground">suporte</strong> traz o nome do
                    especialista. No meio da conversa fica a marca do momento em que a equipe assumiu.
                </p>
                <Callout type="dica" title="Chamado concluído que volta a incomodar">
                    Basta responder na mesma conversa: o chamado <strong>reabre automaticamente</strong> e volta
                    para a fila do time, com todo o histórico junto.
                </Callout>
            </TopicSection>

            {/* 8 */}
            <TopicSection id="faq" index={8} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="q1">
                        <AccordionTrigger className="text-sm">
                            Quem da minha equipe vê os chamados?
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            <span className="flex items-start gap-2">
                                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                    Ninguém. Cada pessoa tem o <strong className="text-foreground">próprio chat</strong>{" "}
                                    de suporte: colegas não veem o seu e você não vê o deles — nem o dono da conta
                                    vê o chamado de um colaborador. Do outro lado, o time da Clinvia enxerga quem
                                    escreveu, de qual empresa e de qual conta.
                                </span>
                            </span>
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="q-historico">
                        <AccordionTrigger className="text-sm">
                            Como vejo uma conversa antiga?
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            <span className="flex items-start gap-2">
                                <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                    Pelo ícone de relógio no topo do painel ("Ver chamados antigos") ou pela
                                    página <strong className="text-foreground">Suporte</strong> no menu lateral,
                                    que tem filtros por status e prioridade. Tudo fica guardado, inclusive os
                                    chamados concluídos.
                                </span>
                            </span>
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="q-ia">
                        <AccordionTrigger className="text-sm">
                            Posso falar direto com uma pessoa, sem passar pelo assistente?
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            É só pedir na conversa ("preciso falar com o suporte"). O assistente encaminha na
                            hora e a equipe recebe o resumo do que você já contou.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="q2">
                        <AccordionTrigger className="text-sm">
                            O botão atrapalha quando estou no kanban ou na agenda?
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Ele é pequeno (40&nbsp;px), fica no canto e some quando o painel está aberto. Ao
                            fechar o painel, volta recolhido.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="q3">
                        <AccordionTrigger className="text-sm">
                            Esse chat conversa com meus pacientes?
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Não. Ele é só com o time da Clinvia. O atendimento de pacientes continua no{" "}
                            <strong className="text-foreground">Inbox</strong>, com WhatsApp e Instagram.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="q4">
                        <AccordionTrigger className="text-sm">Posso anexar um print?</AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Ainda não pelo chat. Por enquanto descreva o passo a passo do que você fez até o erro
                            — costuma ser suficiente para reproduzirmos aqui.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </TopicSection>
        </div>
    );
}
