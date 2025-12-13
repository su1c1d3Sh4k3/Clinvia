import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMFunnel, CRMStage, CRMDeal } from "@/types/crm";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowDown, Users } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { DealsStageChart } from "./DealsStageChart";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";

type DateFilterOption = "all" | "7days" | "30days" | "custom";

export function LeadsFunnelPanel() {
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
    const [dateFilter, setDateFilter] = useState<DateFilterOption>("all");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();

    // Fetch all funnels (excluding IA)
    const { data: funnels, isLoading: isLoadingFunnels } = useQuery({
        queryKey: ["leads-panel-funnels-list"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_funnels" as any)
                .select("*")
                .neq("name", "IA")
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data as unknown as CRMFunnel[];
        }
    });

    // Auto-select first funnel
    useEffect(() => {
        if (funnels && funnels.length > 0 && !selectedFunnelId) {
            setSelectedFunnelId(funnels[0].id);
        }
    }, [funnels, selectedFunnelId]);

    // Fetch stages and deals for selected funnel
    const { data: funnelData, isLoading: isLoadingData } = useQuery({
        queryKey: ["leads-panel-funnel-data", selectedFunnelId],
        queryFn: async () => {
            if (!selectedFunnelId) return null;

            const [stagesResult, dealsResult] = await Promise.all([
                supabase
                    .from("crm_stages" as any)
                    .select("*")
                    .eq("funnel_id", selectedFunnelId)
                    .order("position", { ascending: true }),
                supabase
                    .from("crm_deals" as any)
                    .select("*")
                    .eq("funnel_id", selectedFunnelId)
            ]);

            return {
                stages: (stagesResult.data || []) as unknown as CRMStage[],
                deals: (dealsResult.data || []) as unknown as CRMDeal[]
            };
        },
        enabled: !!selectedFunnelId
    });

    // Filter deals by date and responsible (for agents)
    const filteredDeals = useMemo(() => {
        if (!funnelData?.deals) return [];

        let deals = funnelData.deals;

        // FILTRO OBRIGATÓRIO PARA AGENTES: só mostra deals atribuídos
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
    }, [funnelData?.deals, dateFilter, customDateRange, userRole, currentTeamMember]);

    const isLoading = isLoadingFunnels || isLoadingData;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex justify-end gap-2">
                    <Skeleton className="h-10 w-40" />
                    <Skeleton className="h-10 w-40" />
                </div>
                <div className="grid grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!funnels || funnels.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[250px] animate-in fade-in slide-in-from-bottom-4 duration-300">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="text-xl font-semibold text-muted-foreground">Nenhum funil encontrado</h3>
                <p className="text-muted-foreground/70 mt-1 text-sm">Crie funis no CRM para visualizar as métricas</p>
            </div>
        );
    }

    // Get stages (excluding Perdido for main pipeline)
    const stages = funnelData?.stages || [];
    const regularStages = stages.filter(s => s.name !== "Perdido").sort((a, b) => a.position - b.position);
    const lostStage = stages.find(s => s.name === "Perdido");

    // Calculate metrics
    const totalDeals = filteredDeals.length;
    const lostDeals = lostStage ? filteredDeals.filter(d => d.stage_id === lostStage.id).length : 0;
    const lossRate = totalDeals > 0 ? (lostDeals / totalDeals) * 100 : 0;

    // Stage metrics with conversion rates
    const stageMetrics = regularStages.map((stage, index) => {
        const dealsInStage = filteredDeals.filter(d => d.stage_id === stage.id).length;
        const historyCount = stage.history || 0;

        let conversionRate: number | null = null;
        if (index > 0) {
            const prevStage = regularStages[index - 1];
            const prevHistoryCount = prevStage.history || 0;
            if (prevHistoryCount > 0) {
                conversionRate = (historyCount / prevHistoryCount) * 100;
            }
        }

        return { stage, dealsInStage, historyCount, conversionRate };
    });

    // Total columns for grid (stages + conversion badges + lost)
    const totalStages = stageMetrics.length;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Funil de Conversão - Oculto para agentes */}
            {userRole !== 'agent' && (
                <>
                    {/* Header with Filters */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <h3 className="text-lg font-semibold">Funil de Conversão</h3>
                            <p className="text-sm text-muted-foreground">{totalDeals} negociações no período</p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilterOption)}>
                                <SelectTrigger className="w-[150px] h-9 text-sm">
                                    <Calendar className="h-3.5 w-3.5 mr-2 opacity-50" />
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
                                        <Button variant="outline" size="sm" className="h-9">
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

                            <Select value={selectedFunnelId || ""} onValueChange={setSelectedFunnelId}>
                                <SelectTrigger className="w-[160px] h-9 text-sm">
                                    <SelectValue placeholder="Selecione o funil" />
                                </SelectTrigger>
                                <SelectContent>
                                    {funnels.map((funnel) => (
                                        <SelectItem key={funnel.id} value={funnel.id}>{funnel.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Pipeline Container - Using Flexbox */}
                    <div
                        className="flex items-center justify-between flex-wrap"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0' }}
                    >
                        {stageMetrics.map((metric, index) => {
                            const isFirst = index === 0;
                            const isGanho = metric.stage.name === "Ganho";

                            return (
                                <div
                                    key={metric.stage.id}
                                    className="flex items-center"
                                    style={{ flexGrow: 1, flexShrink: 1, minWidth: '140px' }}
                                >
                                    {/* Metric Block */}
                                    <div
                                        className={cn(
                                            "w-full text-center transition-all",
                                            "rounded-xl p-5 shadow-sm"
                                        )}
                                        style={{
                                            borderRadius: '12px',
                                            padding: '20px',
                                            textAlign: 'center',
                                            backgroundColor: isFirst
                                                ? 'hsl(var(--primary))'
                                                : isGanho
                                                    ? 'hsl(142.1 76.2% 36.3%)'
                                                    : 'hsl(var(--muted))',
                                            color: isFirst || isGanho ? 'white' : 'inherit',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                            minHeight: '120px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            alignItems: 'center'
                                        }}
                                    >
                                        {/* Stage Name */}
                                        <span
                                            className="text-xs uppercase tracking-wider font-medium mb-2"
                                            style={{
                                                opacity: isFirst || isGanho ? 0.9 : 0.7,
                                                color: isFirst || isGanho ? 'white' : 'hsl(var(--muted-foreground))'
                                            }}
                                        >
                                            {metric.stage.name}
                                        </span>

                                        {/* Main Number */}
                                        <span
                                            className="text-4xl font-bold tracking-tight"
                                            style={{ color: isFirst || isGanho ? 'white' : 'hsl(var(--foreground))' }}
                                        >
                                            {metric.historyCount.toLocaleString('pt-BR')}
                                        </span>

                                        {/* Sub info */}
                                        <span
                                            className="text-xs mt-2"
                                            style={{
                                                opacity: 0.7,
                                                color: isFirst || isGanho ? 'white' : 'hsl(var(--muted-foreground))'
                                            }}
                                        >
                                            ↑ {metric.dealsInStage} atuais
                                        </span>
                                    </div>

                                    {/* Conversion Arrow Badge Between Cards */}
                                    {index < stageMetrics.length - 1 && (
                                        <div
                                            className="flex-shrink-0 z-10"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginLeft: '-15px',
                                                marginRight: '-15px'
                                            }}
                                        >
                                            <div
                                                className="font-bold text-xs flex items-center justify-center"
                                                style={{
                                                    backgroundColor: 'hsl(var(--foreground))',
                                                    color: 'hsl(var(--background))',
                                                    whiteSpace: 'nowrap',
                                                    clipPath: 'polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%)',
                                                    paddingLeft: '12px',
                                                    paddingRight: '18px',
                                                    minWidth: '75px',
                                                    height: '32px'
                                                }}
                                            >
                                                {stageMetrics[index + 1].conversionRate !== null
                                                    ? `${stageMetrics[index + 1].conversionRate?.toFixed(2)}%`
                                                    : "0.00%"
                                                }
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Lost Stage - Separated */}
                        {lostStage && (
                            <div
                                className="flex-shrink-0 ml-4"
                                style={{ flexGrow: 0, minWidth: '140px' }}
                            >
                                <div
                                    className="text-center rounded-xl shadow-sm"
                                    style={{
                                        borderRadius: '12px',
                                        padding: '20px',
                                        textAlign: 'center',
                                        backgroundColor: 'hsl(0 84.2% 60.2% / 0.15)',
                                        border: '2px solid hsl(0 84.2% 60.2% / 0.3)',
                                        minHeight: '120px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center'
                                    }}
                                >
                                    <span className="text-xs uppercase tracking-wider font-medium mb-2 flex items-center gap-1" style={{ color: 'hsl(0 84.2% 60.2%)' }}>
                                        <ArrowDown className="h-3 w-3" />
                                        Perdido
                                    </span>
                                    <div className="flex items-baseline gap-2 justify-center">
                                        <span className="text-4xl font-bold tracking-tight" style={{ color: 'hsl(0 84.2% 60.2%)' }}>
                                            {lostDeals}
                                        </span>
                                        <span className="text-sm font-medium" style={{ color: 'hsl(0 84.2% 60.2% / 0.7)' }}>
                                            ({lossRate.toFixed(1)}%)
                                        </span>
                                    </div>
                                    <span className="text-xs mt-2" style={{ color: 'hsl(0 84.2% 60.2% / 0.6)' }}>
                                        do total
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Charts Section - Visível para todos */}
            <div className={userRole === 'agent' ? "" : "mt-8"}>
                <DealsStageChart />
            </div>
        </div>
    );
}
