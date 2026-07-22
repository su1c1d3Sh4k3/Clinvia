import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, XCircle, CheckCircle2 } from "lucide-react";
import { DayPicker } from "./DayPicker";
import { useCrmResults } from "@/hooks/useCrmDashboard";
import { formatCurrency } from "@/hooks/useAppointmentsDashboard";

const CARDS = [
    {
        stage: "Ganho" as const,
        icon: Trophy,
        iconClass: "text-emerald-600",
        bgClass: "bg-emerald-500/10",
        valueClass: "text-emerald-600",
    },
    {
        stage: "Perdido" as const,
        icon: XCircle,
        iconClass: "text-red-600",
        bgClass: "bg-red-500/10",
        valueClass: "text-red-600",
    },
    {
        stage: "Finalizado" as const,
        icon: CheckCircle2,
        iconClass: "text-gray-500",
        bgClass: "bg-gray-500/10",
        valueClass: "text-gray-500",
    },
];

export function ResultadosSection() {
    const [date, setDate] = useState(new Date());
    const { data, isLoading } = useCrmResults(date);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Resultados</h3>
                <DayPicker date={date} onDateChange={setDate} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {CARDS.map((c) => {
                    const Icon = c.icon;
                    const result = data?.[c.stage];
                    return (
                        <Card key={c.stage} className="rounded-2xl border border-border/50 shadow-sm">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${c.bgClass}`}>
                                    <Icon className={`w-5 h-5 ${c.iconClass}`} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">{c.stage}</p>
                                    <p className="text-2xl font-bold leading-tight">
                                        {isLoading ? "—" : result?.count ?? 0}
                                    </p>
                                    <p className={`text-xs font-medium ${c.valueClass}`}>
                                        {isLoading ? "" : formatCurrency(result?.value ?? 0)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
