import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { useRecorrenciaDashboard, CampanhasPeriod } from "@/hooks/useCampaignDashboard";
import { CampanhasPeriodFilter } from "@/components/dashboard/campanhas/CampanhasPeriodFilter";
import { RecorrenciaKpiCards } from "./RecorrenciaKpiCards";
import { RecurrenceMonthCard } from "./RecurrenceMonthCard";

export function RecorrenciaDashboard() {
    const [period, setPeriod] = useState<CampanhasPeriod>({ mode: "all" });
    const { kpis, months, isLoading } = useRecorrenciaDashboard(period);

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <CampanhasPeriodFilter period={period} onChange={setPeriod} />

            <RecorrenciaKpiCards kpis={kpis} isLoading={isLoading} />

            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 border rounded-xl bg-muted/30 animate-pulse" />
                    ))}
                </div>
            ) : months.length === 0 ? (
                <div className="border rounded-xl p-10 text-center text-muted-foreground">
                    <RefreshCcw className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Nenhuma recorrência no período</p>
                    <p className="text-sm mt-1">Ajuste o filtro ou cadastre recorrências na página Recorrência.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {months.map((agg) => (
                        <RecurrenceMonthCard key={agg.monthKey} agg={agg} />
                    ))}
                </div>
            )}
        </div>
    );
}
