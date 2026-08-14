import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Crown, Eye, Headset, Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Explorador — o que cada papel enxerga e pode fazer
// ---------------------------------------------------------------------------

type Access = "sim" | "nao" | "depende";

interface Role {
    key: string;
    label: string;
    icon: any;
    summary: string;
    rows: { area: string; access: Access; note: string }[];
}

const ROLES: Role[] = [
    {
        key: "admin",
        label: "Admin",
        icon: Crown,
        summary: "O dono da conta. Vê e faz tudo — inclusive gerenciar a equipe, permissões e configurações.",
        rows: [
            { area: "Inbox, CRM, Agenda, Clientes", access: "sim", note: "Acesso total" },
            { area: "Dashboard (todas as abas)", access: "sim", note: "Inclui Vendas/financeiro" },
            { area: "IA, Conexões, Campanhas", access: "sim", note: "Configura tudo" },
            { area: "Equipe e Permissões", access: "sim", note: "Só admin convida e define permissões" },
        ],
    },
    {
        key: "supervisor",
        label: "Supervisor",
        icon: Eye,
        summary: "O gerente: quase tudo do admin, exceto gerenciar a equipe. O financeiro depende de permissão.",
        rows: [
            { area: "Inbox, CRM, Agenda, Clientes", access: "sim", note: "Acesso total (criar/editar conforme permissões)" },
            { area: "Dashboard (todas as abas)", access: "depende", note: "Vendas só com acesso financeiro liberado" },
            { area: "IA, Conexões, Campanhas", access: "sim", note: "Pode configurar" },
            { area: "Equipe e Permissões", access: "nao", note: "Página exclusiva de admin" },
        ],
    },
    {
        key: "agent",
        label: "Agente",
        icon: Headset,
        summary: "O atendente: focado em conversar e atender. Sem configurações nem números financeiros.",
        rows: [
            { area: "Inbox, CRM, Agenda, Clientes", access: "depende", note: "Usa no dia a dia; criar/editar/apagar conforme permissões finas" },
            { area: "Dashboard", access: "depende", note: "Só a aba CRM" },
            { area: "IA, Conexões, Campanhas", access: "nao", note: "Não configura canais nem IA" },
            { area: "Equipe e Permissões", access: "nao", note: "Página exclusiva de admin" },
        ],
    },
];

const ACCESS_UI: Record<Access, { icon: any; cls: string }> = {
    sim: { icon: Check, cls: "text-emerald-600" },
    nao: { icon: X, cls: "text-red-500" },
    depende: { icon: Minus, cls: "text-amber-600" },
};

export function RoleMatrixExplorer() {
    const [sel, setSel] = useState(ROLES[0]);
    const [panelRef] = useAutoAnimate();

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Explore: o que cada papel vê e pode fazer</p>
            <div className="flex flex-wrap gap-1.5">
                {ROLES.map((r) => (
                    <button
                        key={r.key}
                        onClick={() => setSel(r)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            sel.key === r.key
                                ? "border-primary bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                    >
                        <r.icon className="h-3 w-3" />
                        {r.label}
                    </button>
                ))}
            </div>

            <div ref={panelRef} className="space-y-3">
                <p key={`sum-${sel.key}`} className="rounded-xl bg-muted/50 p-3.5 text-sm text-muted-foreground animate-in fade-in duration-300">
                    {sel.summary}
                </p>
                <div key={`rows-${sel.key}`} className="space-y-1.5">
                    {sel.rows.map((row) => {
                        const ui = ACCESS_UI[row.access];
                        return (
                            <div key={row.area} className="flex items-start gap-2.5 rounded-lg border bg-background p-2.5">
                                <ui.icon className={cn("mt-0.5 h-4 w-4 shrink-0", ui.cls)} />
                                <div>
                                    <p className="text-sm font-medium">{row.area}</p>
                                    <p className="text-xs text-muted-foreground">{row.note}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
