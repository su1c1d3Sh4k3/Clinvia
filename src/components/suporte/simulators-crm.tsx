import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Bot, Headset, CalendarCheck, Wrench, ThumbsDown, ListChecks, Ticket, KanbanSquare, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Simulador — mover o card muda a fila (e etapas terminais encerram o ticket)
// ---------------------------------------------------------------------------

interface StageOption {
    key: string;
    label: string;
    icon: any;
    color: string;       // borda/cor da coluna
    queue: string;
    iaAtende: boolean;
    terminal?: boolean;
    explain: string;
}

const STAGE_OPTIONS: StageOption[] = [
    {
        key: "ia",
        label: "Em Atendimento IA",
        icon: Bot,
        color: "border-violet-400",
        queue: "Atendimento IA",
        iaAtende: true,
        explain: "Etapa de IA: a conversa fica na fila Atendimento IA e a assistente pode responder (com os portões abertos).",
    },
    {
        key: "humano",
        label: "Em Atendimento Humano",
        icon: Headset,
        color: "border-blue-400",
        queue: "Atendimento Humano",
        iaAtende: false,
        explain: "Etapa humana: a conversa muda para a fila Atendimento Humano e a IA solta o cliente — a equipe assume.",
    },
    {
        key: "agendado",
        label: "Agendado",
        icon: CalendarCheck,
        color: "border-amber-400",
        queue: "Atendimento IA (mantida)",
        iaAtende: true,
        explain: "Cliente com horário marcado. É uma etapa do grupo da IA: se a conversa já estava com a IA, ela continua acompanhando (confirmações automáticas cuidam do resto).",
    },
    {
        key: "suporte",
        label: "Suporte",
        icon: Wrench,
        color: "border-pink-400",
        queue: "Suporte",
        iaAtende: false,
        explain: "Etapas de setor (Suporte, Financeiro, Pós-Venda) mandam a conversa para a fila do setor correspondente — cada equipe vê a sua fila.",
    },
    {
        key: "sem-interesse",
        label: "Sem Interesse",
        icon: ThumbsDown,
        color: "border-red-400",
        queue: "—",
        iaAtende: false,
        terminal: true,
        explain: "Etapa TERMINAL: o sistema pede o motivo da perda, o card vira histórico (sai do quadro) e os atendimentos abertos do cliente NESTA CONEXÃO são ENCERRADOS automaticamente.",
    },
];

export function StageSyncSimulator() {
    const [sel, setSel] = useState(STAGE_OPTIONS[0]);
    const [panelRef] = useAutoAnimate();

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Simulação: solte o card "Maria Souza" numa etapa e veja o efeito</p>
            <div className="flex flex-wrap gap-1.5">
                {STAGE_OPTIONS.map((s) => (
                    <button
                        key={s.key}
                        onClick={() => setSel(s)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            sel.key === s.key
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
                {/* Mini coluna com o card */}
                <div key={`col-${sel.key}`} className={cn("rounded-xl border-2 border-dashed p-3", sel.color)}>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <sel.icon className="h-3.5 w-3.5" />
                        {sel.label}
                    </p>
                    <div
                        className={cn(
                            "rounded-lg border bg-background p-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300",
                            sel.terminal && "opacity-60",
                        )}
                    >
                        <p className="text-sm font-medium">Maria Souza</p>
                        <p className="text-xs text-muted-foreground">Toxina Botulínica · R$ 1.200</p>
                        {sel.terminal && (
                            <Badge variant="outline" className="mt-1.5 border-0 bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                vira histórico
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Efeitos */}
                <div key={`fx-${sel.key}`} className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border bg-background p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold"><ListChecks className="h-3.5 w-3.5 text-primary" />Fila da conversa</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{sel.queue}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold"><Bot className="h-3.5 w-3.5 text-primary" />IA atende?</p>
                        <p className={cn("mt-0.5 text-xs font-medium", sel.iaAtende ? "text-emerald-600" : "text-red-500")}>
                            {sel.iaAtende ? "Sim (portões abertos)" : "Não"}
                        </p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold"><Ticket className="h-3.5 w-3.5 text-primary" />Ticket aberto</p>
                        <p className={cn("mt-0.5 text-xs font-medium", sel.terminal ? "text-red-500" : "text-emerald-600")}>
                            {sel.terminal ? "ENCERRADO automaticamente" : "Continua aberto"}
                        </p>
                    </div>
                </div>

                <div
                    key={`explain-${sel.key}`}
                    className={cn(
                        "animate-in fade-in slide-in-from-bottom-1 duration-300 rounded-xl p-3.5 text-sm",
                        sel.terminal
                            ? "border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                            : "bg-muted/50 text-muted-foreground",
                    )}
                >
                    {sel.terminal && <AlertTriangle className="mb-1 h-4 w-4" />}
                    {sel.explain}
                </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KanbanSquare className="h-3.5 w-3.5" />
                Regra central: etapa do funil e fila do inbox andam sempre juntas — mover um move o outro, sempre dentro
                da conexão daquele card.
            </p>
        </div>
    );
}
