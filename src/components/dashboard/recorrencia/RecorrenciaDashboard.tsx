import { useState } from "react";
import { Megaphone, RefreshCcw } from "lucide-react";
import {
    useRecorrenciaDashboard,
    useRecurrenceCampaignGroups,
    CampanhasPeriod,
} from "@/hooks/useCampaignDashboard";
import { CampanhasPeriodFilter } from "@/components/dashboard/campanhas/CampanhasPeriodFilter";
import { RecorrenciaKpiCards } from "./RecorrenciaKpiCards";
import { RecurrenceMonthCard } from "./RecurrenceMonthCard";
import { RecurrenceDayCard } from "./RecurrenceDayCard";

export function RecorrenciaDashboard() {
    const [period, setPeriod] = useState<CampanhasPeriod>({ mode: "all" });
    const { kpis, months, isLoading } = useRecorrenciaDashboard(period);
    const { groups, statsMap, isLoading: loadingGroups } = useRecurrenceCampaignGroups(period);

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

            {/* Campanhas de Recorrência — containers por dia (Fase 5, R13) */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-primary" /> Campanhas de Recorrência
                </h3>
                {loadingGroups ? (
                    <div className="h-20 border rounded-xl bg-muted/30 animate-pulse" />
                ) : groups.length === 0 ? (
                    <div className="border rounded-xl p-6 text-center text-muted-foreground text-sm">
                        Nenhuma campanha de recorrência no período. Elas são geradas automaticamente
                        todos os dias quando há abordagens vencendo.
                    </div>
                ) : (
                    groups.map((group) => (
                        <RecurrenceDayCard key={group.dateISO} group={group} statsMap={statsMap} />
                    ))
                )}
            </div>
        </div>
    );
}
