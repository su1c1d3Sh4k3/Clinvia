import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ShoppingBag, Stethoscope, UserX, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Simulador — categoria automática do contato (Contato / Lead / Cliente)
// ---------------------------------------------------------------------------

interface StageScenario {
    key: string;
    label: string;
    icon: any;
    purchases: string[];
    stage: "contato" | "lead" | "cliente";
    explain: string;
}

const SCENARIOS: StageScenario[] = [
    {
        key: "nenhuma",
        label: "Nunca comprou",
        icon: UserX,
        purchases: [],
        stage: "contato",
        explain: "Sem nenhuma compra registrada, a pessoa é um Contato: alguém que conversou com a clínica mas ainda não gastou nada.",
    },
    {
        key: "avaliacao",
        label: "Comprou só Avaliação",
        icon: Stethoscope,
        purchases: ["Avaliação Facial — R$ 0"],
        stage: "lead",
        explain: "Compras APENAS da categoria Avaliação viram Lead: a pessoa deu o primeiro passo, mas ainda não fechou um procedimento de verdade.",
    },
    {
        key: "procedimento",
        label: "Comprou procedimento",
        icon: ShoppingBag,
        purchases: ["Avaliação Facial — R$ 0", "Toxina Botulínica — R$ 1.200"],
        stage: "cliente",
        explain: "Qualquer compra fora da categoria Avaliação promove a Cliente — mesmo que também tenha feito avaliação antes. É cliente de verdade.",
    },
];

const STAGE_BADGE = {
    contato: { label: "Contato", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
    lead: { label: "Lead", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300" },
    cliente: { label: "Cliente", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
};

export function ClientStageSimulator() {
    const [sel, setSel] = useState(SCENARIOS[0]);
    const [panelRef] = useAutoAnimate();
    const badge = STAGE_BADGE[sel.stage];

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Simulação: o histórico de compras define a categoria — sozinho</p>
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
                <div key={`card-${sel.key}`} className="rounded-xl border bg-background p-3.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Maria Souza</p>
                        <Badge variant="outline" className={cn("border-0", badge.cls)}>{badge.label}</Badge>
                    </div>
                    <div className="mt-2 space-y-1">
                        {sel.purchases.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhuma compra registrada</p>
                        ) : (
                            sel.purchases.map((p) => (
                                <p key={p} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <ShoppingBag className="h-3 w-3" /> {p}
                                </p>
                            ))
                        )}
                    </div>
                </div>
                <div key={`explain-${sel.key}`} className="rounded-xl bg-muted/50 p-3.5 text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-300">
                    {sel.explain}
                </div>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                A categoria é 100% automática: registrar/cancelar vendas atualiza o selo na hora. Não existe botão manual.
            </p>
        </div>
    );
}
