import { useState } from "react";
import { Megaphone, Radar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCampaignDashboard, useMonitoringDashboard, CampanhasPeriod } from "@/hooks/useCampaignDashboard";
import { Campaign } from "@/hooks/useCampaigns";
import { CampanhasPeriodFilter } from "./CampanhasPeriodFilter";
import { CampanhasKpiCards } from "./CampanhasKpiCards";
import { CampaignExpandableCard } from "./CampaignExpandableCard";
import { MonitoringExpandableCard } from "./MonitoringExpandableCard";
import { MetaQualityPanel } from "@/components/campaigns/MetaQualityPanel";
import { CampaignWizard } from "@/components/campaigns/CampaignWizard";

export function CampanhasDashboard() {
    const [period, setPeriod] = useState<CampanhasPeriod>({ mode: "all" });
    const [subTab, setSubTab] = useState<"campanhas" | "monitoramento">("campanhas");
    const [resending, setResending] = useState<Campaign | null>(null);
    const { kpis, items, isLoading } = useCampaignDashboard(period);
    const { items: monitoringItems, isLoading: loadingMonitoring } = useMonitoringDashboard(period);

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <MetaQualityPanel />

            <Tabs value={subTab} onValueChange={(v) => setSubTab(v as typeof subTab)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <TabsList>
                        <TabsTrigger value="campanhas" className="gap-1.5">
                            <Megaphone className="w-3.5 h-3.5" /> Campanhas
                        </TabsTrigger>
                        <TabsTrigger value="monitoramento" className="gap-1.5">
                            <Radar className="w-3.5 h-3.5" /> Monitoramento
                        </TabsTrigger>
                    </TabsList>
                    <CampanhasPeriodFilter period={period} onChange={setPeriod} />
                </div>

                <TabsContent value="campanhas" className="space-y-4 mt-4">
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
                            <p className="font-medium">Nenhuma campanha no período</p>
                            <p className="text-sm mt-1">Ajuste o filtro ou crie uma campanha em /campanhas.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {items.map((item) => (
                                <CampaignExpandableCard
                                    key={item.campaign.id}
                                    campaign={item.campaign}
                                    stats={item.stats}
                                    onResend={setResending}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Monitoramento de Grupos: 1 container por grupo monitorado (nome = tag) */}
                <TabsContent value="monitoramento" className="space-y-4 mt-4">
                    {loadingMonitoring ? (
                        <div className="space-y-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="h-20 border rounded-xl bg-muted/30 animate-pulse" />
                            ))}
                        </div>
                    ) : monitoringItems.length === 0 ? (
                        <div className="border rounded-xl p-10 text-center text-muted-foreground">
                            <Radar className="w-8 h-8 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">Nenhum monitoramento de grupo no período</p>
                            <p className="text-sm mt-1">
                                Crie um monitoramento abrindo a conversa do grupo no inbox → menu lateral → Monitoramento.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {monitoringItems.map((item) => (
                                <MonitoringExpandableCard
                                    key={item.campaign.id}
                                    campaign={item.campaign}
                                    stats={item.stats}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <CampaignWizard
                open={!!resending}
                onOpenChange={(o) => { if (!o) setResending(null); }}
                resendFrom={resending}
            />
        </div>
    );
}
