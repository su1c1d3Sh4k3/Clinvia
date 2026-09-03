import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { MessageCircle, Bot, Headset, Hourglass, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Simulador — como ler um card do Monitoramento
// ---------------------------------------------------------------------------

interface MonitorScenario {
    key: string;
    label: string;
    icon: any;
    card: {
        name: string;
        preview: string;
        lastSender: "cliente" | "equipe" | "ia";
        /** Vazio = conexão sem janela de 24h (API não oficial): o selo some do card */
        window: string;
        windowTone: "ok" | "warn" | "closed";
    };
    read: string;
    action: string;
}

const SCENARIOS: MonitorScenario[] = [
    {
        key: "aguardando",
        label: "Cliente esperando",
        icon: AlertTriangle,
        card: { name: "Maria Souza", preview: "Quanto fica o pacote de 3 sessões?", lastSender: "cliente", window: "18h restantes", windowTone: "ok" },
        read: "O último a falar foi o CLIENTE — ele está esperando resposta. É o card que merece atenção imediata.",
        action: "Priorize: quanto mais tempo o cliente espera, menor a chance de fechar. Clique no card para abrir a conversa.",
    },
    {
        key: "respondida",
        label: "Equipe respondeu",
        icon: Headset,
        card: { name: "João Lima", preview: "Você: Fica R$ 1.200 no pacote 😉", lastSender: "equipe", window: "22h restantes", windowTone: "ok" },
        read: "O último a falar foi a EQUIPE — a bola está com o cliente. Sem urgência, só acompanhar.",
        action: "Nada a fazer agora. Se o cliente sumir, o card continua aqui como lembrete de follow-up.",
    },
    {
        key: "ia",
        label: "IA conduzindo",
        icon: Bot,
        card: { name: "Ana Paula", preview: "IA: Temos horário quinta às 10h ou sexta às 14h!", lastSender: "ia", window: "23h restantes", windowTone: "ok" },
        read: "A IA está conduzindo a conversa sozinha. O card existe para você ACOMPANHAR, não para intervir.",
        action: "Só assuma se perceber que a IA travou ou o cliente pediu um humano — aí sim, clique e atenda.",
    },
    {
        key: "janela",
        label: "Janela 24h fechando",
        icon: Hourglass,
        card: { name: "Carlos Reis", preview: "Vou pensar e te falo…", lastSender: "cliente", window: "1h restante", windowTone: "warn" },
        read: "No número oficial (Meta), você só pode mandar mensagem livre até 24h após a ÚLTIMA mensagem do cliente. Essa janela está quase fechando.",
        action: "Responda agora ou perderá o canal: depois que fecha, só é possível recontatar com template aprovado.",
    },
    {
        key: "nao-oficial",
        label: "Número não oficial",
        icon: MessageCircle,
        card: { name: "Rita Alves", preview: "Bom dia, ainda tem vaga hoje?", lastSender: "cliente", window: "", windowTone: "ok" },
        read: "A conexão é a API não oficial (QR Code), que não tem janela de 24h — por isso o card não mostra contagem nenhuma. O contorno laranja é o que importa: ninguém respondeu.",
        action: "Responda normalmente: aqui não existe prazo da Meta nem necessidade de template aprovado.",
    },
];

export function MiniMonitorSimulator() {
    const [sel, setSel] = useState(SCENARIOS[0]);
    const [panelRef] = useAutoAnimate();

    const senderBadge = {
        cliente: { label: "Cliente falou por último", cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
        equipe: { label: "Equipe falou por último", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
        ia: { label: "IA falou por último", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300" },
    }[sel.card.lastSender];

    const windowCls = {
        ok: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
        warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
        closed: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    }[sel.card.windowTone];

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Simulação: aprenda a ler um card do Monitoramento</p>
            <div className="flex flex-wrap gap-1.5">
                {SCENARIOS.map((s) => (
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
                {/* Card do monitoramento */}
                <div
                    key={`card-${sel.key}`}
                    className={cn(
                        "rounded-xl border-2 bg-background p-3.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300",
                        sel.card.lastSender === "cliente" ? "border-orange-500/70" : "border-emerald-500/70",
                    )}
                >
                    <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                            <MessageCircle className="h-3.5 w-3.5 text-primary" />
                            {sel.card.name}
                        </p>
                        {sel.card.window && (
                            <Badge variant="outline" className={cn("border-0 text-[10px]", windowCls)}>
                                Janela: {sel.card.window}
                            </Badge>
                        )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{sel.card.preview}</p>
                    <Badge variant="outline" className={cn("mt-2 border-0", senderBadge.cls)}>{senderBadge.label}</Badge>
                </div>

                <div key={`read-${sel.key}`} className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background p-3">
                        <p className="text-xs font-semibold">Como ler</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{sel.read}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-3">
                        <p className="text-xs font-semibold">O que fazer</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{sel.action}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
