import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMFunnel, CRMStage, CRMDeal } from "@/types/crm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Filter, Bot, PackageSearch, Repeat, Users } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";
import { VerticalFunnel, StageMetric } from "./VerticalFunnel";
import { DealsStageChart } from "./DealsStageChart";
import { LossReasonsChart } from "./LossReasonsChart";
import { useNavigate } from "react-router-dom";

type DateFilterOption = "all" | "7days" | "30days" | "custom";

// Mapeamento de temas para os funis baseados no nome
const getFunnelConfig = (funnelName: string) => {
    const nameLower = funnelName.toLowerCase();
    if (nameLower.includes("qualifica")) {
        return { theme: 'amber' as const, icon: <Filter className="w-5 h-5" /> };
    }
    if (nameLower.includes("ia") || nameLower.includes("atendimento")) {
        return { theme: 'purple' as const, icon: <Bot className="w-5 h-5" /> };
    }
    if (nameLower.includes("delivery") || nameLower.includes("entrega")) {
        return { theme: 'blue' as const, icon: <PackageSearch className="w-5 h-5" /> };
    }
    if (nameLower.includes("recorr") || nameLower.includes("reten")) {
        return { theme: 'green' as const, icon: <Repeat className="w-5 h-5" /> };
    }
    return { theme: 'primary' as const, icon: <Users className="w-5 h-5" /> };
};

export function MacroFunnelsPanel() {
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const navigate = useNavigate();
    const [dateFilter, setDateFilter] = useState<DateFilterOption>("all");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [funnelSlots, setFunnelSlots] = useState<(string | null)[]>([null, null, null, null, null]);

    const handleNavigateToCRM = (funnelId: string) => {
        navigate(`/crm?funnel=${funnelId}`);
    };

    // 1. Fetch All Data (Funnels, Stages, Deals)
    const { data: allData, isLoading } = useQuery({
        queryKey: ["macro-funnels-data"],
        queryFn: async () => {
            const [funnelsResult, stagesResult, dealsResult] = await Promise.all([
                supabase.from("crm_funnels" as any).select("*").order("created_at", { ascending: true }),
                supabase.from("crm_stages" as any).select("*").order("position", { ascending: true }),
                supabase.from("crm_deals" as any).select("*")
            ]);

            return {
                funnels: (funnelsResult.data || []) as unknown as CRMFunnel[],
                stages: (stagesResult.data || []) as unknown as CRMStage[],
                deals: (dealsResult.data || []) as unknown as CRMDeal[]
            };
        }
    });

    // 2. Filter Deals by Date and Agent assigned
    const filteredDeals = useMemo(() => {
        if (!allData?.deals) return [];

        let deals = allData.deals;

        // FILTRO OBRIGATÓRIO PARA AGENTES
        if (userRole === 'agent' && currentTeamMember) {
            deals = deals.filter(d => d.responsible_id === currentTeamMember.id);
        }

        if (dateFilter !== "all") {
            const now = new Date();
            let startDate: Date;
            let endDate = endOfDay(now);

            if (dateFilter === "7days") {
                startDate = startOfDay(subDays(now, 7));
            } else if (dateFilter === "30days") {
                startDate = startOfDay(subDays(now, 30));
            } else if (dateFilter === "custom" && customDateRange?.from) {
                startDate = startOfDay(customDateRange.from);
                if (customDateRange.to) {
                    endDate = endOfDay(customDateRange.to);
                }
            } else {
                startDate = new Date(0);
            }

            deals = deals.filter(deal => {
                const dealDate = new Date(deal.created_at);
                return isWithinInterval(dealDate, { start: startDate, end: endDate });
            });
        }

        return deals;
    }, [allData?.deals, dateFilter, customDateRange, userRole, currentTeamMember]);

    // 3. Auto-assign funnels to 5 slots initially
    useEffect(() => {
        if (allData?.funnels && allData.funnels.length > 0 && funnelSlots.every(s => s === null)) {
            const funnels = allData.funnels;
            const newSlots = [null, null, null, null, null] as (string | null)[];

            const qF = funnels.find(f => f.name.toLowerCase().includes('qualifica'));
            newSlots[0] = qF ? qF.id : funnels[0]?.id || null;

            const iaF = funnels.find(f => f.name.toLowerCase().includes('ia') || f.name.toLowerCase().includes('atendimento'));
            newSlots[1] = iaF ? iaF.id : funnels[1]?.id || null;

            const dF = funnels.find(f => f.name.toLowerCase().includes('delivery') || f.name.toLowerCase().includes('entrega'));
            newSlots[2] = dF ? dF.id : funnels[2]?.id || null;

            const rF = funnels.find(f => f.name.toLowerCase().includes('recorr') || f.name.toLowerCase().includes('reten'));
            newSlots[3] = rF ? rF.id : funnels[3]?.id || null;

            const usedIds = [newSlots[0], newSlots[1], newSlots[2], newSlots[3]].filter(Boolean);
            const remaining = funnels.filter(f => !usedIds.includes(f.id));
            if (remaining.length > 0) {
                newSlots[4] = remaining[0].id;
            }

            setFunnelSlots(newSlots);
        }
    }, [allData?.funnels, funnelSlots]);

    const handleSlotChange = (slotIndex: number, newFunnelId: string) => {
        setFunnelSlots(prev => {
            const up = [...prev];
            up[slotIndex] = newFunnelId;
            return up;
        });
    };

    // 4. Mount UI logic per funnel slot
    const funnelsCards = useMemo(() => {
        if (!allData || !funnelSlots) return [];

        const allAvailableFunnels = allData.funnels.map(f => ({ id: f.id, name: f.name }));

        return funnelSlots.map((slotFunnelId, slotIndex) => {
            if (!slotFunnelId) return null; // No funnel assigned to this slot

            const funnel = allData.funnels.find(f => f.id === slotFunnelId);
            if (!funnel) return null;

            const funnelDeals = filteredDeals.filter(d => d.funnel_id === funnel.id);
            const funnelStages = allData.stages.filter(s => s.funnel_id === funnel.id);

            // Separar estágios regulares dos estágios finais de saída
            const isSpecialStage = (name: string) => {
                const n = name.trim();
                return ["Follow Up", "Follow Up (IA)", "Sem Contato", "Sem Contato (IA)", "Sem Interesse", "Sem Interesse (IA)"].includes(n);
            };

            const regularStages = funnelStages.filter(s =>
                s.name !== "Perdido" &&
                s.name !== "Perdido (IA)" &&
                s.name !== "Ganho" &&
                !isSpecialStage(s.name)
            ).sort((a, b) => a.position - b.position);

            const specialStages = funnelStages.filter(s => isSpecialStage(s.name)).sort((a, b) => a.position - b.position);

            const lostStage = funnelStages.find(s => s.name === "Perdido" || s.name === "Perdido (IA)");
            const wonStage = funnelStages.find(s => s.name === "Ganho");

            const totalDeals = funnelDeals.length;
            const lostDeals = lostStage ? funnelDeals.filter(d => d.stage_id === lostStage.id).length : 0;
            const wonDeals = wonStage ? funnelDeals.filter(d => d.stage_id === wonStage.id).length : 0;
            const lossRate = totalDeals > 0 ? (lostDeals / totalDeals) * 100 : 0;

            const createMetrics = (stagesArray: CRMStage[]) => {
                return stagesArray.map((stage, index) => {
                    const dealsInStage = funnelDeals.filter(d => d.stage_id === stage.id).length;

                    // Exibindo estritamente a quantidade exata de negociações no momento (sem fakes visuais)
                    const historyCount = dealsInStage;

                    let conversionRate: number | null = null;
                    if (index > 0) {
                        const prevStage = stagesArray[index - 1];
                        const prevDeals = funnelDeals.filter(d => d.stage_id === prevStage.id).length;
                        if (prevDeals > 0) {
                            conversionRate = (dealsInStage / prevDeals) * 100;
                        } else if (dealsInStage > 0) {
                            conversionRate = 100;
                        } else {
                            conversionRate = 0;
                        }
                    }
                    return { stage, dealsInStage, historyCount, conversionRate };
                });
            };

            const stageMetrics = createMetrics(regularStages);
            const specialMetrics = createMetrics(specialStages);

            // Agora adjustedMetrics é puramente o stageMetrics real, sem manipular o "historyCount" num efeito cascata que confundia o usuário
            const adjustedMetrics = stageMetrics;


            const config = getFunnelConfig(funnel.name);

            return (
                <div key={`${slotIndex}-${funnel.id}`} className="min-w-[220px] w-full max-w-[400px]">
                    <VerticalFunnel
                        title={funnel.name}
                        icon={config.icon}
                        colorTheme={config.theme}
                        totalDeals={totalDeals}
                        stages={adjustedMetrics}
                        specialMetrics={specialMetrics}
                        lostDeals={lostDeals}
                        lossRate={lossRate}
                        hasWonStage={!!wonStage}
                        wonDeals={wonDeals}
                        currentFunnelId={funnel.id}
                        allFunnels={allAvailableFunnels}
                        onFunnelSelect={(id) => handleSlotChange(slotIndex, id)}
                        onFunnelClick={handleNavigateToCRM}
                    />
                </div>
            );
        });
    }, [allData, filteredDeals, funnelSlots]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex justify-end gap-2 mb-8">
                    <Skeleton className="h-10 w-40" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 place-items-stretch">
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-[600px] w-full rounded-2xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!allData?.funnels?.length) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] animate-in fade-in slide-in-from-bottom-4 duration-300">
                <Users className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-2xl font-bold tracking-tight text-muted-foreground">Nenhum funil encontrado</h3>
                <p className="text-muted-foreground/70 mt-2">Crie funis no CRM para visualizar as métricas operacionais</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header: Filtros Globais */}
            {userRole !== 'agent' && (
                <div className="sticky top-0 z-30 flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-xl bg-background/80 backdrop-blur-xl border shadow-sm gap-4">
                    <div>
                        <h3 className="text-lg font-bold tracking-tight">Macro Visão de Negócios</h3>
                        <p className="text-sm text-muted-foreground">Desempenho comparativo de todos os processos configurados</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilterOption)}>
                            <SelectTrigger className="w-[160px] h-10 bg-background/50">
                                <Calendar className="h-4 w-4 mr-2 text-primary" />
                                <SelectValue placeholder="Período" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todo período</SelectItem>
                                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                                <SelectItem value="custom">Personalizado</SelectItem>
                            </SelectContent>
                        </Select>

                        {dateFilter === "custom" && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="h-10 bg-background/50">
                                        {customDateRange?.from ? (
                                            customDateRange.to ? (
                                                `${format(customDateRange.from, "dd/MM", { locale: ptBR })} - ${format(customDateRange.to, "dd/MM", { locale: ptBR })}`
                                            ) : format(customDateRange.from, "dd/MM/yy", { locale: ptBR })
                                        ) : "Selecionar"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <CalendarComponent mode="range" selected={customDateRange} onSelect={setCustomDateRange} numberOfMonths={2} locale={ptBR} />
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                </div>
            )}

            {/* Funnels Grid - 5 Columns */}
            {userRole !== 'agent' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-5 place-items-stretch">
                    {funnelsCards}
                </div>
            )}

            {/* Charts Section - Visível para todos */}
            <div className={userRole === 'agent' ? "" : "mt-12 pt-8 border-t border-border/50"}>
                <div className="mb-6">
                    <h3 className="text-lg font-bold tracking-tight mb-1">Análise Aprofundada</h3>
                    <p className="text-sm text-muted-foreground">Métricas avançadas e histórico de longo prazo</p>
                </div>
                <DealsStageChart />
            </div>

            {/* Loss Reasons Chart - Visível para admin/supervisor */}
            {userRole !== 'agent' && (
                <div className="mt-8">
                    <LossReasonsChart />
                </div>
            )}
        </div>
    );
}
