import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Bot, MessageCircle, User, Globe, Plug, ListChecks, CheckCircle2, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Simulador — Os 5 portões da IA ("por que a IA não respondeu?")
// ---------------------------------------------------------------------------

const GATES = [
    {
        key: "pending",
        icon: MessageCircle,
        label: "Conversa pendente",
        detail: "Ninguém da equipe assumiu a conversa. Ao clicar em \"Atender\", a IA para na hora — o cliente é seu.",
        fix: "Devolva a conversa para a fila (encerre o atendimento) para a IA voltar a responder.",
    },
    {
        key: "contact",
        icon: User,
        label: "IA ligada para o contato",
        detail: "Cada cliente tem um botão de IA no cadastro (página Clientes). Desligado, a IA ignora só essa pessoa.",
        fix: "Vá em Clientes, encontre o contato e ligue o botão de IA dele.",
    },
    {
        key: "global",
        icon: Globe,
        label: "IA ligada na clínica",
        detail: "O interruptor geral em IA > Config. Desligado, nenhuma conversa é respondida pela assistente.",
        fix: "Vá em IA > Config e ative \"Ligar IA\".",
    },
    {
        key: "instance",
        icon: Plug,
        label: "IA ligada na conexão",
        detail: "Cada número de WhatsApp conectado tem seu próprio botão de IA. Dá para ter um número com IA e outro só humano.",
        fix: "Em IA > Config, ative a IA na instância por onde essa conversa chega.",
    },
    {
        key: "queue",
        icon: ListChecks,
        label: "Fila \"Atendimento IA\"",
        detail: "A conversa precisa estar na fila Atendimento IA. Se alguém moveu para outra fila (ou o card do CRM foi para uma etapa humana), a IA solta a conversa.",
        fix: "Mova a conversa de volta para a fila Atendimento IA (ou o card do CRM para uma etapa de IA).",
    },
] as const;

export function IaGateSimulator() {
    const [on, setOn] = useState<Record<string, boolean>>(
        Object.fromEntries(GATES.map((g) => [g.key, true])),
    );
    const [panelRef] = useAutoAnimate();
    const blocked = GATES.filter((g) => !on[g.key]);
    const allOn = blocked.length === 0;

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">
                Simulação: desligue qualquer portão e veja a IA parar de responder
            </p>
            <div className="grid gap-2">
                {GATES.map((g) => (
                    <div
                        key={g.key}
                        className={cn(
                            "flex items-start justify-between gap-3 rounded-xl border p-3 transition-colors",
                            on[g.key]
                                ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                                : "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
                        )}
                    >
                        <div className="flex gap-2.5 min-w-0">
                            <g.icon className={cn("mt-0.5 h-4 w-4 shrink-0", on[g.key] ? "text-emerald-600" : "text-red-500")} />
                            <div className="min-w-0">
                                <p className="text-sm font-medium">{g.label}</p>
                                <p className="text-xs text-muted-foreground">{g.detail}</p>
                            </div>
                        </div>
                        <Switch
                            checked={on[g.key]}
                            onCheckedChange={(v) => setOn((s) => ({ ...s, [g.key]: v }))}
                        />
                    </div>
                ))}
            </div>

            {/* Semáforo */}
            <div ref={panelRef}>
                {allOn ? (
                    <div key="ok" className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Bot className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-4 w-4" /> A IA responde!
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Os 5 portões estão abertos — a próxima mensagem do cliente será atendida pela assistente.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div key="blocked" className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-red-700 dark:text-red-300">
                            <XCircle className="h-4 w-4" /> A IA NÃO responde
                        </p>
                        {blocked.map((g) => (
                            <p key={g.key} className="text-xs text-muted-foreground">
                                <strong className="text-foreground">{g.label}:</strong> {g.fix}
                            </p>
                        ))}
                    </div>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                Basta <strong className="text-foreground">um</strong> portão fechado para a IA ficar em silêncio — na dúvida, confira os 5 nesta ordem.
            </p>
        </div>
    );
}
