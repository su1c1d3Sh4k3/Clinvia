import { Clock, CalendarClock, History, CalendarCheck, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RecorrenciaStatusCards } from "@/hooks/useCampaignDashboard";

interface RecurrenceStatusCardsProps {
    data: RecorrenciaStatusCards;
    isLoading: boolean;
}

const PHASE_STYLES = [
    { icon: Clock, color: "text-blue-600", bg: "bg-blue-500/10" },
    { icon: CalendarClock, color: "text-amber-600", bg: "bg-amber-500/10" },
    { icon: History, color: "text-violet-600", bg: "bg-violet-500/10" },
];

/** Cards de status da sub-aba Recorrência: Prévia | Vencimento | Pós | Agendados | Sem Resposta */
export function RecurrenceStatusCards({ data, isLoading }: RecurrenceStatusCardsProps) {
    const cards = [
        ...data.phases.map((phase, i) => ({
            title: phase.label,
            value: phase.realized.toLocaleString("pt-BR"),
            sub: `de ${phase.total.toLocaleString("pt-BR")} abordagem${phase.total !== 1 ? "s" : ""}`,
            ...PHASE_STYLES[i],
        })),
        {
            title: "Agendados",
            value: data.scheduledCount.toLocaleString("pt-BR"),
            sub: undefined as string | undefined,
            icon: CalendarCheck,
            color: "text-emerald-600",
            bg: "bg-emerald-500/10",
        },
        {
            title: "Sem Resposta",
            value: data.noResponseCount.toLocaleString("pt-BR"),
            sub: undefined as string | undefined,
            icon: UserX,
            color: "text-red-600",
            bg: "bg-red-500/10",
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
