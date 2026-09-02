import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, FileText, XCircle } from "lucide-react";
import type { OrcamentoCards as Cards } from "@/hooks/useFinanceiro";

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

interface Props {
    data?: Cards;
    isLoading: boolean;
}

export function OrcamentoCards({ data, isLoading }: Props) {
    if (isLoading || !data) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
        );
    }

    const items = [
        {
            label: "Valores totais",
            value: data.total_valor,
            itens: data.total_itens,
            hint: `${data.orcamentos} orçamento${data.orcamentos === 1 ? "" : "s"}`,
            icon: FileText,
            color: "text-blue-500",
            ring: "border-blue-500/20 hover:border-blue-500/40",
            glow: "from-blue-500/10",
        },
        {
            label: "Valores aprovados",
            value: data.aprovado_valor,
            itens: data.aprovado_itens,
            hint: "valor final vendido",
            icon: CheckCircle2,
            color: "text-emerald-500",
            ring: "border-emerald-500/20 hover:border-emerald-500/40",
            glow: "from-emerald-500/10",
        },
        {
            label: "Valores rejeitados",
            value: data.rejeitado_valor,
            itens: data.rejeitado_itens,
            hint: "recusados + expirados",
            icon: XCircle,
            color: "text-rose-500",
            ring: "border-rose-500/20 hover:border-rose-500/40",
            glow: "from-rose-500/10",
        },
        {
            label: "Valores pendentes",
            value: data.pendente_valor,
            itens: data.pendente_itens,
            hint: "aguardando decisão",
            icon: Clock,
            color: "text-amber-500",
            ring: "border-amber-500/20 hover:border-amber-500/40",
            glow: "from-amber-500/10",
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {items.map((it) => (
                <Card
                    key={it.label}
                    className={`relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl shadow-sm transition-all duration-300 ${it.ring}`}
                >
                    <div className={`absolute inset-0 bg-gradient-to-br ${it.glow} via-transparent to-background/5 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl`} />
                    <CardContent className="relative z-10 p-4">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{it.label}</span>
                            <it.icon className={`w-4 h-4 ${it.color}`} />
                        </div>
                        <p className={`mt-2 text-2xl font-bold tracking-tight ${it.color}`}>{fmt(it.value)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            {it.itens} {it.itens === 1 ? "item" : "itens"} · {it.hint}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
