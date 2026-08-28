import { useNavigate } from "react-router-dom";
import {
    Headphones, MessageSquarePlus, Flame, ListChecks, Bell, HelpCircle, ExternalLink,
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
    { id: "abrir", label: "Abrir chamado" },
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
                        <LearnChip topicId="abrir">Onde fica o botão</LearnChip>
                        <LearnChip topicId="prioridade">Escolher a prioridade certa</LearnChip>
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
                    O suporte funciona como um <strong className="text-foreground">chat</strong>: você abre um
                    chamado descrevendo o problema e a conversa continua ali, com idas e vindas, até resolver.
                    Nada se perde — o histórico completo fica guardado em{" "}
                    <strong className="text-foreground">Suporte</strong>, no menu lateral.
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
                id="abrir"
                index={2}
                icon={MessageSquarePlus}
                title="Como abrir um chamado"
                subtitle="Leva menos de um minuto"
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
                            title: 'Clique em "Novo chamado"',
                            description: "O painel abre com a lista dos seus chamados e o botão no rodapé.",
                            icon: MessageSquarePlus,
                        },
                        {
                            title: "Preencha assunto, prioridade e relato",
                            description: (
                                <>
                                    O assunto é o título curto ("WhatsApp desconectou"). No relato, conte{" "}
                                    <strong>onde acontece, o que você esperava e o que apareceu</strong> — quanto
                                    mais detalhe, mais rápido a resposta.
                                </>
                            ),
                            icon: ListChecks,
                        },
                        {
                            title: "Continue a conversa ali mesmo",
                            description:
                                "O chamado vira um chat. Pode mandar mensagens novas a qualquer momento, sem abrir outro chamado.",
                            icon: Bell,
                        },
                    ]}
                />
                <Callout type="pratica" title="Um assunto por chamado">
                    Problemas diferentes em chamados diferentes: cada um é atendido e concluído no seu ritmo.
                </Callout>
            </TopicSection>

            {/* 3 */}
            <TopicSection
                id="prioridade"
                index={3}
                icon={Flame}
                title="Escolhendo a prioridade"
                subtitle="Ela organiza a fila do atendimento"
            >
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
                    Se todos os chamados chegam como <strong>Urgente</strong>, perdemos a referência de quem
                    realmente está parado. Use a prioridade com sinceridade — ela ajuda você.
                </Callout>
            </TopicSection>

            {/* 4 */}
            <TopicSection
                id="status"
                index={4}
                icon={ListChecks}
                title="O que cada status significa"
                subtitle="A bolinha colorida ao lado do chamado"
            >
                <div className="space-y-2">
                    {SUPPORT_STATUS_ORDER.map((s) => {
                        const cfg = SUPPORT_STATUS_CONFIG[s];
                        const Icon = cfg.icon;
                        const help: Record<string, string> = {
                            open: "Você abriu e o time ainda não olhou.",
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

            {/* 5 */}
            <TopicSection
                id="resposta"
                index={5}
                icon={Bell}
                title="Onde chega a resposta"
                subtitle="No mesmo chat, sem F5"
            >
                <p className="text-sm text-muted-foreground">
                    Quando o atendente responde, a mensagem aparece{" "}
                    <strong className="text-foreground">na hora</strong> no chat, sem precisar recarregar a
                    página. O botão flutuante ganha uma{" "}
                    <strong className="text-foreground">bolinha vermelha</strong> com o número de chamados que
                    têm resposta nova, e a lista mostra a etiqueta <em>respondido</em>.
                </p>
                <Callout type="dica" title="Chamado concluído que volta a incomodar">
                    Basta responder na mesma conversa: o chamado <strong>reabre automaticamente</strong> e volta
                    para a fila do time, com todo o histórico junto.
                </Callout>
            </TopicSection>

            {/* 6 */}
            <TopicSection id="faq" index={6} icon={HelpCircle} title="Perguntas frequentes">
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="q1">
                        <AccordionTrigger className="text-sm">
                            Quem da minha equipe vê os chamados?
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                            Os chamados pertencem à conta da clínica: qualquer pessoa logada na sua conta vê a
                            lista e pode responder. O nome de quem escreveu aparece em cada mensagem.
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
