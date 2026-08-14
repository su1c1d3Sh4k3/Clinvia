import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Inbox, Headset, Archive, Bot, KanbanSquare, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Simulador — Ciclo de vida de uma conversa (pendente → em atendimento → resolvida)
// ---------------------------------------------------------------------------

const STATES = [
    {
        key: "pending",
        label: "Pendente",
        icon: Inbox,
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
        dot: "border-amber-500",
        ia: "Pode responder — se os 5 portões da IA estiverem abertos (veja o guia da IA), a assistente atende sozinha.",
        crm: "O card do cliente vive nas etapas de IA do funil (Em Atendimento IA, Qualificado...).",
        text: "A conversa chegou e está na fila, aguardando. Ninguém da equipe assumiu — é aqui que a IA trabalha.",
    },
    {
        key: "open",
        label: "Em atendimento",
        icon: Headset,
        badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
        dot: "border-sky-500",
        ia: "PARA imediatamente — conversa assumida é território humano. A IA não interfere.",
        crm: "A conversa vai para a fila Atendimento Humano; o card acompanha nas etapas humanas.",
        text: "Alguém da equipe clicou em Atender. A conversa agora tem um dono: só esse atendente (e supervisores) cuida dela.",
    },
    {
        key: "resolved",
        label: "Resolvida",
        icon: Archive,
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
        dot: "border-emerald-500",
        ia: "Se o cliente escrever de novo, nasce uma CONVERSA NOVA — e a IA pode voltar a atender do zero.",
        crm: "O ticket fecha. Se o card foi para uma etapa terminal (Ganho, Perdido...), ele vira histórico.",
        text: "Atendimento encerrado. As mensagens são arquivadas no histórico do contato — nada se perde, tudo continua visível ao reabrir.",
    },
] as const;

export function ConversationFlowSimulator() {
    const [idx, setIdx] = useState(0);
    const [panelRef] = useAutoAnimate();
    const s = STATES[idx];

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Simulação: os 3 estados de uma conversa</p>

            {/* Linha do tempo */}
            <div className="flex items-center">
                {STATES.map((st, i) => (
                    <div key={st.key} className={cn("flex items-center", i > 0 && "flex-1")}>
                        {i > 0 && (
                            <div className={cn("h-0.5 flex-1 rounded transition-colors duration-500", i <= idx ? "bg-primary" : "bg-border")} />
                        )}
                        <button
                            onClick={() => setIdx(i)}
                            className={cn(
                                "mx-1 flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 bg-background px-3 text-xs font-medium transition-all duration-300",
                                i <= idx ? st.dot : "border-border opacity-50",
                                i === idx && "ring-2 ring-primary/30",
                            )}
                        >
                            <st.icon className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{st.label}</span>
                        </button>
                    </div>
                ))}
            </div>

            <div ref={panelRef}>
                <div key={s.key} className="space-y-3 rounded-xl bg-muted/50 p-3.5">
                    <div>
                        <Badge variant="outline" className={cn("border-0 mb-1.5", s.badge)}>
                            <s.icon className="mr-1 h-3 w-3" />
                            {s.label}
                        </Badge>
                        <p className="text-sm text-muted-foreground">{s.text}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border bg-background p-3">
                            <p className="flex items-center gap-1.5 text-xs font-semibold"><Bot className="h-3.5 w-3.5 text-primary" />O que a IA faz</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{s.ia}</p>
                        </div>
                        <div className="rounded-lg border bg-background p-3">
                            <p className="flex items-center gap-1.5 text-xs font-semibold"><KanbanSquare className="h-3.5 w-3.5 text-primary" />O que acontece no CRM</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{s.crm}</p>
                        </div>
                    </div>
                </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5" />
                Clique nos estados acima para navegar. Toda conversa percorre esse caminho — às vezes várias vezes com o mesmo cliente.
            </p>
        </div>
    );
}
