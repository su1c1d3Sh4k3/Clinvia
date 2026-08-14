import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
    Play,
    Pause,
    RotateCcw,
    CalendarClock,
    Send,
    CheckCheck,
    Hourglass,
    ChevronLeft,
    ChevronRight,
    MessageCircle,
    CalendarCheck,
    Archive,
    MoveRight,
    Clock,
    Headset,
    FileText,
    Users,
    Tag,
    MessageSquareText,
    Target,
    ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Simulador 1 — Ciclo de vida da campanha
// ---------------------------------------------------------------------------

const LIFECYCLE = [
    {
        key: "scheduled",
        label: "Agendada",
        icon: CalendarClock,
        color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        dot: "border-slate-400",
        text: "Você criou a campanha e escolheu dia e hora. Ela fica aguardando na fila — dá para editar ou excluir enquanto não começa.",
    },
    {
        key: "dispatching",
        label: "Disparando",
        icon: Send,
        color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
        dot: "border-blue-500",
        text: "Chegou a hora! O sistema envia as mensagens uma a uma, com um intervalo de ~30 segundos entre cada envio (isso protege seu número de bloqueios).",
    },
    {
        key: "dispatched",
        label: "Disparada",
        icon: CheckCheck,
        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
        dot: "border-emerald-500",
        text: "Todas as mensagens foram enviadas. Agora é acompanhar: quem recebeu, quem respondeu, quem agendou. A IA (se ativada) já atende as respostas.",
    },
    {
        key: "expired",
        label: "Expirada",
        icon: Hourglass,
        color: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
        dot: "border-orange-500",
        text: "A data de validade chegou. Os resultados são congelados como estão — vira o retrato final da campanha. Quem ainda estava em atendimento continua sendo atendido normalmente.",
    },
] as const;

export function LifecycleSimulator() {
    const [stage, setStage] = useState(0);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        if (!playing) return;
        const t = setInterval(() => {
            setStage((s) => {
                if (s >= LIFECYCLE.length - 1) {
                    setPlaying(false);
                    return s;
                }
                return s + 1;
            });
        }, 2200);
        return () => clearInterval(t);
    }, [playing]);

    const current = LIFECYCLE[stage];
    const Icon = current.icon;

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Simulação: a vida de uma campanha</p>
                <div className="flex gap-1.5">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                            if (stage >= LIFECYCLE.length - 1) setStage(0);
                            setPlaying((p) => !p);
                        }}
                    >
                        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        <span className="ml-1.5 text-xs">{playing ? "Pausar" : "Assistir"}</span>
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => {
                            setPlaying(false);
                            setStage(0);
                        }}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Linha do tempo */}
            <div className="flex items-center">
                {LIFECYCLE.map((s, i) => (
                    <div key={s.key} className={cn("flex items-center", i > 0 && "flex-1")}>
                        {i > 0 && (
                            <div
                                className={cn(
                                    "h-0.5 flex-1 rounded transition-colors duration-500",
                                    i <= stage ? "bg-primary" : "bg-border",
                                )}
                            />
                        )}
                        <button
                            onClick={() => {
                                setPlaying(false);
                                setStage(i);
                            }}
                            className={cn(
                                "mx-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-all duration-300",
                                i <= stage ? cn(s.dot, "scale-100") : "border-border opacity-50",
                                i === stage && "ring-2 ring-primary/30 scale-110",
                            )}
                            title={s.label}
                        >
                            <s.icon className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Descrição do estágio */}
            <div
                key={current.key}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-xl bg-muted/50 p-3.5"
            >
                <Badge variant="outline" className={cn("mb-2 border-0", current.color)}>
                    <Icon className="mr-1 h-3 w-3" />
                    {current.label}
                </Badge>
                <p className="text-sm text-muted-foreground">{current.text}</p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Simulador 2 — O que acontece com cada contato
// ---------------------------------------------------------------------------

interface Scenario {
    key: string;
    label: string;
    icon: any;
    statusBadge: { label: string; cls: string };
    respondida?: { label: string; cls: string };
    agendamento?: { label: string; cls: string };
    atendente?: { label: string; cls: string };
    explain: string;
}

const SCENARIOS: Scenario[] = [
    {
        key: "delivered",
        label: "Mensagem entregue",
        icon: CheckCheck,
        statusBadge: { label: "Entregue", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        respondida: { label: "Pendente", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
        agendamento: { label: "Pendente", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
        explain:
            "O WhatsApp confirmou que a mensagem chegou no celular do cliente. Agora é aguardar: ele pode responder, agendar ou simplesmente não reagir.",
    },
    {
        key: "responded",
        label: "Cliente respondeu",
        icon: MessageCircle,
        statusBadge: { label: "Entregue", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        respondida: { label: "Sim", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        agendamento: { label: "Pendente", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
        atendente: { label: "IA", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300" },
        explain:
            "O cliente respondeu! A conversa entra na fila de atendimento (IA ou humano, conforme você escolheu na campanha) e ele conta no card 'respondidas'.",
    },
    {
        key: "scheduled",
        label: "Cliente agendou",
        icon: CalendarCheck,
        statusBadge: { label: "Entregue", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        respondida: { label: "Sim", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        agendamento: { label: "Agendado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        atendente: { label: "Dra. Ana (congelado)", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        explain:
            "Melhor resultado possível: o agendamento foi criado e o resultado do contato é CONGELADO como 'Agendado'. Mesmo que a campanha expire depois, esse contato fica registrado para sempre como convertido — o resultado nunca regride.",
    },
    {
        key: "resolved",
        label: "Atendimento encerrado sem agendar",
        icon: Archive,
        statusBadge: { label: "Entregue", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        respondida: { label: "Sim", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        agendamento: { label: "Não Agendou", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
        atendente: { label: "Finalizado", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
        explain:
            "A conversa foi encerrada sem agendamento. O contato congela como 'Finalizado' e conta no card 'resolvidos'. Se o cliente voltar depois, será um atendimento novo, fora da campanha.",
    },
    {
        key: "no_response",
        label: "Não respondeu até o fim",
        icon: Clock,
        statusBadge: { label: "Entregue", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        respondida: { label: "Sem Resposta", cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
        agendamento: { label: "Não Agendou", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
        atendente: { label: "Campanha Encerrada", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
        explain:
            "A validade da campanha chegou e o cliente nunca respondeu. Ele congela como 'Sem Resposta' — esse número ajuda a medir se a mensagem e o público foram bem escolhidos.",
    },
    {
        key: "open_ticket",
        label: "Já estava em atendimento",
        icon: Headset,
        statusBadge: { label: "Atendimento Em Aberto", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
        explain:
            "Regra de ouro: se o cliente já estava conversando com sua equipe na hora do disparo, a campanha NÃO envia nada para ele. Nada de interromper um atendimento em andamento com propaganda.",
    },
    {
        key: "moved",
        label: "Entrou em outra campanha",
        icon: MoveRight,
        statusBadge: { label: "Entregue", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        atendente: { label: "Movido Para Outra Campanha", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
        explain:
            "Você disparou uma campanha nova para esse mesmo contato (mesmo número). Cada contato só participa de UMA campanha ativa por vez — a antiga congela como 'Movido' e a nova assume.",
    },
];

export function ContactStatusSimulator() {
    const [selected, setSelected] = useState(SCENARIOS[0]);
    const [panelRef] = useAutoAnimate();

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Simulação: clique num cenário e veja o resultado na tabela</p>
            <div className="flex flex-wrap gap-1.5">
                {SCENARIOS.map((s) => (
                    <button
                        key={s.key}
                        onClick={() => setSelected(s)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            selected.key === s.key
                                ? "border-primary bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                    >
                        <s.icon className="h-3 w-3" />
                        {s.label}
                    </button>
                ))}
            </div>

            <div ref={panelRef} className="space-y-3">
                <div key={selected.key} className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[560px] text-xs">
                        <thead className="bg-muted/60 text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">Contato</th>
                                <th className="px-3 py-2 text-left font-medium">Status</th>
                                <th className="px-3 py-2 text-left font-medium">Respondida</th>
                                <th className="px-3 py-2 text-left font-medium">Agendamento</th>
                                <th className="px-3 py-2 text-left font-medium">Atendente</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="animate-in fade-in duration-300">
                                <td className="px-3 py-2.5 font-medium">Maria Souza</td>
                                <td className="px-3 py-2.5">
                                    <Badge variant="outline" className={cn("border-0", selected.statusBadge.cls)}>
                                        {selected.statusBadge.label}
                                    </Badge>
                                </td>
                                <td className="px-3 py-2.5">
                                    {selected.respondida ? (
                                        <Badge variant="outline" className={cn("border-0", selected.respondida.cls)}>
                                            {selected.respondida.label}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="px-3 py-2.5">
                                    {selected.agendamento ? (
                                        <Badge variant="outline" className={cn("border-0", selected.agendamento.cls)}>
                                            {selected.agendamento.label}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="px-3 py-2.5">
                                    {selected.atendente ? (
                                        <Badge variant="outline" className={cn("border-0", selected.atendente.cls)}>
                                            {selected.atendente.label}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div
                    key={`explain-${selected.key}`}
                    className="animate-in fade-in slide-in-from-bottom-1 duration-300 rounded-xl bg-muted/50 p-3.5 text-sm text-muted-foreground"
                >
                    {selected.explain}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Simulador 3 — Mini-wizard demonstrativo (6 etapas, somente leitura)
// ---------------------------------------------------------------------------

const WIZARD_STEPS = [
    {
        title: "Dados",
        icon: FileText,
        fields: ["Nome da campanha", "Número que vai enviar (instância)", "Data e hora do disparo", "Válida até"],
        tip: "O disparo precisa ser agendado com pelo menos 1 hora de antecedência. A validade define até quando a campanha 'vale' — depois dela, os resultados são congelados.",
    },
    {
        title: "Audiência",
        icon: Users,
        fields: ["Planilha (CSV/Excel)", "Etapa do CRM", "Etiqueta (tag)", "Agendamentos", "Vendas"],
        tip: "Escolha de onde vêm os contatos. Cada pessoa entra só UMA vez, mesmo que apareça repetida na lista.",
    },
    {
        title: "Tipo",
        icon: Tag,
        fields: ["Promoção (serviços + desconto)", "Notificação (aviso, sem preços)"],
        tip: "Promoção exige escolher os serviços ofertados. Notificação é um comunicado simples, sem valores.",
    },
    {
        title: "Mensagem",
        icon: MessageSquareText,
        fields: ["WhatsApp oficial (Meta): template aprovado", "WhatsApp não oficial: texto livre"],
        tip: "No WhatsApp oficial, a Meta exige um modelo pré-aprovado (template). Você conecta cada campo variável ({{1}}, {{2}}) a um dado do contato, como o nome.",
    },
    {
        title: "Objetivo + IA",
        icon: Target,
        fields: ["Descreva o objetivo da campanha", "IA atende as respostas? (sim/não)"],
        tip: "O objetivo vira instrução automática para a IA. Com IA ligada, as respostas caem na fila 'Atendimento IA'; desligada, vão para sua equipe.",
    },
    {
        title: "Revisão",
        icon: ClipboardCheck,
        fields: ["Total de contatos", "Tempo estimado de envio", "Custo estimado", "Avisos (limite do número, contatos repetidos)"],
        tip: "Confira tudo antes de confirmar. Se algum contato participou de campanha nos últimos 7 dias, o sistema avisa e deixa você excluí-lo.",
    },
];

export function MiniWizardDemo() {
    const [step, setStep] = useState(0);
    const s = WIZARD_STEPS[step];
    const Icon = s.icon;

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Simulação: as 6 etapas do assistente</p>
                <span className="text-xs text-muted-foreground">
                    Etapa {step + 1} de {WIZARD_STEPS.length}
                </span>
            </div>

            {/* Progresso */}
            <div className="flex gap-1">
                {WIZARD_STEPS.map((w, i) => (
                    <button
                        key={w.title}
                        onClick={() => setStep(i)}
                        className={cn(
                            "h-1.5 flex-1 rounded-full transition-colors",
                            i <= step ? "bg-primary" : "bg-border",
                        )}
                        title={w.title}
                    />
                ))}
            </div>

            <div key={step} className="animate-in fade-in slide-in-from-right-2 duration-300 space-y-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                    </div>
                    <p className="font-semibold text-sm">{s.title}</p>
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                    {s.fields.map((f) => (
                        <li
                            key={f}
                            className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                        >
                            {f}
                        </li>
                    ))}
                </ul>
                <div className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                    💡 {s.tip}
                </div>
            </div>

            <div className="flex justify-between">
                <Button
                    size="sm"
                    variant="outline"
                    disabled={step === 0}
                    onClick={() => setStep((v) => Math.max(0, v - 1))}
                >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                </Button>
                <Button
                    size="sm"
                    disabled={step === WIZARD_STEPS.length - 1}
                    onClick={() => setStep((v) => Math.min(WIZARD_STEPS.length - 1, v + 1))}
                >
                    Próxima <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
            </div>
        </div>
    );
}
