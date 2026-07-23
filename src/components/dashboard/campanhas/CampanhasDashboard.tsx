import { useState } from "react";
import { Megaphone } from "lucide-react";
import { useCampaignDashboard, CampanhasPeriod } from "@/hooks/useCampaignDashboard";
import { CampanhasPeriodFilter } from "./CampanhasPeriodFilter";
import { CampanhasKpiCards } from "./CampanhasKpiCards";
import { CampaignExpandableCard } from "./CampaignExpandableCard";
import { RecurrenceMonthCard } from "./RecurrenceMonthCard";

export function CampanhasDashboard() {
    const [period, setPeriod] = useState<CampanhasPeriod>({ mode: "all" });
    const { kpis, items, isLoading } = useCampaignDashboard(period);

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <CampanhasPeriodFilter period={period} onChange={setPeriod} />

            <CampanhasKpiCards kpis={kpis} isLoading={isLoading} />

            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 border rounded-xl bg-muted/30 animate-pulse" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="border rounded-xl p-10 text-center text-muted-foreground">
                    <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Nenhuma campanha ou recorrência no período</p>
                    <p className="text-sm mt-1">Ajuste o filtro ou crie uma campanha em /campanhas.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map((item) =>
                        item.kind === "campaign" ? (
                            <CampaignExpandableCard
                                key={`c-${item.campaign.id}`}
                                campaign={item.campaign}
                                stats={item.stats}
                            />
                        ) : (
                            <RecurrenceMonthCard key={`r-${item.agg.monthKey}`} agg={item.agg} />
                        )
                    )}
                </div>
            )}
        </div>
    );
}
