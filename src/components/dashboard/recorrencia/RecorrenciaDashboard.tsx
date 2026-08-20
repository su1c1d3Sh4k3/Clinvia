import { useState } from "react";
import { Megaphone, RefreshCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    useRecorrenciaDashboard,
    useRecurrenceCampaignGroups,
    CampanhasPeriod,
} from "@/hooks/useCampaignDashboard";
import { CampanhasPeriodFilter } from "@/components/dashboard/campanhas/CampanhasPeriodFilter";
import { RecorrenciaKpiCards } from "./RecorrenciaKpiCards";
import { RecurrenceStatusCards } from "./RecurrenceStatusCards";
import { RecurrenceMonthCard } from "./RecurrenceMonthCard";
import { RecurrenceDayCard } from "./RecurrenceDayCard";

export function RecorrenciaDashboard() {
    const [period, setPeriod] = useState<CampanhasPeriod>({ mode: "all" });
    const { kpis, statusCards, months, isLoading } = useRecorrenciaDashboard(period);
    const { groups, statsMap, isLoading: loadingGroups } = useRecurrenceCampaignGroups(period);

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <CampanhasPeriodFilter period={period} onChange={setPeriod} />

            <Tabs defaultValue="recorrencia">
                <TabsList className="overflow-x-auto flex-nowrap">
                    <TabsTrigger value="recorrencia" className="shrink-0 gap-1.5">
                        <RefreshCcw className="w-3.5 h-3.5" /> Recorrência
                    </TabsTrigger>
                    <TabsTrigger value="campanhas" className="shrink-0 gap-1.5">
                        <Megaphone className="w-3.5 h-3.5" /> Campanhas
                    </TabsTrigger>
                </TabsList>

                {/* ── Sub-aba Recorrência: cards de status + containers mensais ── */}
                <TabsContent value="recorrencia" className="space-y-4 mt-4">
                    <RecurrenceStatusCards data={statusCards} isLoading={isLoading} />

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
                </TabsContent>

                {/* ── Sub-aba Campanhas: KPIs + containers por dia (Fase 5, R13) ── */}
                <TabsContent value="campanhas" className="space-y-4 mt-4">
                    <RecorrenciaKpiCards kpis={kpis} isLoading={isLoading} />

                    {loadingGroups ? (
                        <div className="h-20 border rounded-xl bg-muted/30 animate-pulse" />
                    ) : groups.length === 0 ? (
                        <div className="border rounded-xl p-6 text-center text-muted-foreground text-sm">
                            Nenhuma campanha de recorrência no período. Elas são geradas automaticamente
                            todos os dias quando há abordagens vencendo.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {groups.map((group) => (
                                <RecurrenceDayCard key={group.dateISO} group={group} statsMap={statsMap} />
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
