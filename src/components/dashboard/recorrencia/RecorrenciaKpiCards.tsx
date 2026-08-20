import { Users, CheckCheck, MessageCircle, CalendarCheck, TrendingUp, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { RecorrenciaKpis } from "@/hooks/useCampaignDashboard";

interface RecorrenciaKpiCardsProps {
    kpis: RecorrenciaKpis;
    isLoading: boolean;
}

export function RecorrenciaKpiCards({ kpis, isLoading }: RecorrenciaKpiCardsProps) {
    const cards = [
        {
            title: "Total de Contatos",
            value: kpis.totalContacts.toLocaleString("pt-BR"),
            icon: Users,
            color: "text-blue-600",
            bg: "bg-blue-500/10",
        },
        {
            title: "Abordagens Realizadas",
            value: kpis.realizedApproaches.toLocaleString("pt-BR"),
            icon: CheckCheck,
            color: "text-emerald-600",
            bg: "bg-emerald-500/10",
        },
        {
            title: "Clientes em Contato",
            value: kpis.inContactCount.toLocaleString("pt-BR"),
            icon: MessageCircle,
            color: "text-violet-600",
            bg: "bg-violet-500/10",
        },
        {
            title: "Agendaram",
            value: kpis.scheduledCount.toLocaleString("pt-BR"),
            icon: CalendarCheck,
            color: "text-teal-600",
            bg: "bg-teal-500/10",
        },
        {
            title: "Taxa de Conversão",
            value: `${kpis.conversionPct.toFixed(1)}%`,
            icon: TrendingUp,
            color: "text-amber-600",
            bg: "bg-amber-500/10",
        },
        {
            title: "Custo",
            value: formatCurrency(kpis.costBRL),
            sub: kpis.rateIsFallback ? "estimado (câmbio padrão)" : "estimado",
            icon: DollarSign,
            color: "text-cyan-600",
            bg: "bg-cyan-500/10",
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {cards.map((card) => (
                <Card
                    key={card.title}
                    className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all duration-300"
                >
                    <CardContent className="p-3 md:p-4">
                        <div className={`p-2 rounded-lg w-fit ${card.bg}`}>
                            <card.icon className={`w-4 h-4 ${card.color}`} />
                        </div>
                        <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider mt-2">
                            {card.title}
                        </p>
                        <p className={`text-base md:text-lg font-bold mt-0.5 ${card.color}`}>
                            {isLoading ? "—" : card.value}
                        </p>
                        {card.sub && !isLoading && (
                            <p className="text-[10px] text-muted-foreground">{card.sub}</p>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
