import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { FolderOpen, Layers, Syringe, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Explorador — a hierarquia Categoria → Serviço → Aplicação
// ---------------------------------------------------------------------------

interface Level {
    key: string;
    label: string;
    icon: any;
    example: string;
    explain: string;
}

const LEVELS: Level[] = [
    {
        key: "categoria",
        label: "Categoria",
        icon: FolderOpen,
        example: "Toxina Botulínica",
        explain: "O grupo grande — a 'prateleira'. Ex.: Toxina Botulínica, Preenchimento, Depilação a Laser. A IA e os filtros da Agenda navegam por aqui primeiro.",
    },
    {
        key: "servico",
        label: "Serviço",
        icon: Layers,
        example: "Botox Full Face",
        explain: "O procedimento dentro da categoria. Ex.: dentro de Toxina Botulínica: Botox Full Face, Botox Testa, Botox Axilas.",
    },
    {
        key: "aplicacao",
        label: "Aplicação",
        icon: Syringe,
        example: "Botox Full Face 50U — R$ 1.200 · 60 min · Dra. Ana",
        explain: "A SUA versão do serviço: preço, duração e profissionais que executam. É a aplicação que aparece na Agenda, nas vendas e nas respostas da IA. Sem aplicação cadastrada, o serviço 'não existe' para o sistema.",
    },
];

export function HierarchyExplorer() {
    const [sel, setSel] = useState(LEVELS[2]);
    const [panelRef] = useAutoAnimate();

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Explore: clique em cada nível da hierarquia</p>

            {/* Árvore */}
            <div className="space-y-1.5">
                {LEVELS.map((l, i) => (
                    <button
                        key={l.key}
                        onClick={() => setSel(l)}
                        style={{ marginLeft: i * 20 }}
                        className={cn(
                            "flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                            sel.key === l.key
                                ? "border-primary bg-primary/10"
                                : "text-muted-foreground hover:border-primary/40",
                        )}
                    >
                        <l.icon className={cn("h-4 w-4 shrink-0", sel.key === l.key && "text-primary")} />
                        <span>
                            <span className="font-semibold">{l.label}: </span>
                            {l.example}
                        </span>
                    </button>
                ))}
            </div>

            <div ref={panelRef}>
                <div key={sel.key} className="rounded-xl bg-muted/50 p-3.5 text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-300">
                    {sel.explain}
                </div>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Exceção: categorias "diretas" (Consultas e Avaliação) pulam o nível Serviço — você cria a aplicação
                direto na categoria (ex.: "Avaliação Facial — R$ 0 · 30 min").
            </p>
        </div>
    );
}
