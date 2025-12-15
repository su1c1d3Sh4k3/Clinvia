import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMFunnel, CRMStage, CRMDeal } from "@/types/crm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, BarChart3, LineChartIcon, Users } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { format, subDays, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from "recharts";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";

type DateFilterOption = "all" | "7days" | "30days" | "custom";
type ChartType = "line" | "bar";

// Stage colors palette
const STAGE_COLORS = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#f59e0b", // amber
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#ef4444", // red
    "#84cc16", // lime
    "#f97316", // orange
    "#6366f1", // indigo
];

export function DealsStageChart() {
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
    const [dateFilter, setDateFilter] = useState<DateFilterOption>("all");
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    const [chartType, setChartType] = useState<ChartType>("line");

    // Fetch all funnels (INCLUDING IA)
    const { data: funnels, isLoading: isLoadingFunnels } = useQuery({
        queryKey: ["deals-chart-funnels"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_funnels" as any)
                .select("*")
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

    // Fetch all stages and deals
    const { data: allData, isLoading: isLoadingData } = useQuery({
        queryKey: ["deals-chart-data"],
        queryFn: async () => {
            const [stagesResult, dealsResult] = await Promise.all([
                supabase.from("crm_stages" as any).select("*").order("position", { ascending: true }),
                supabase.from("crm_deals" as any).select("*")
            ]);

            return {
                stages: (stagesResult.data || []) as unknown as CRMStage[],
                deals: (dealsResult.data || []) as unknown as CRMDeal[]
            };
        }
    });

    // Get date range based on filter
    const dateRange = useMemo(() => {
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
            // All time - last 12 months
            startDate = startOfMonth(subMonths(now, 11));
        }

        return { startDate, endDate };
    }, [dateFilter, customDateRange]);

    // Filter deals by funnel and responsible (for agents)
    const filteredDeals = useMemo(() => {
        if (!allData?.deals || !selectedFunnelId) return [];

        let deals = allData.deals.filter(deal => deal.funnel_id === selectedFunnelId);

        // FILTRO OBRIGATÓRIO PARA AGENTES: só mostra deals atribuídos
        if (userRole === 'agent' && currentTeamMember) {
            deals = deals.filter(d => d.responsible_id === currentTeamMember.id);
        }

        return deals;
    }, [allData?.deals, selectedFunnelId, userRole, currentTeamMember]);

    // Get stages for chart (with colors)
    const chartStages = useMemo(() => {
        if (!allData?.stages || !funnels || !selectedFunnelId) return [];

        const stages = allData.stages.filter(s => s.funnel_id === selectedFunnelId);

        // Find IA funnel to exclude Ganho/Perdido from it
        const iaFunnel = funnels.find(f => f.name === "IA");

        // Filter stages
        const filtered = stages.filter(s => {
            if (iaFunnel && s.funnel_id === iaFunnel.id && (s.name === "Ganho" || s.name === "Perdido")) {
                return false;
            }
            return true;
        });

        // Get unique stage names preserving order
        const uniqueNames: string[] = [];
        filtered.forEach(s => {
            if (!uniqueNames.includes(s.name)) {
                uniqueNames.push(s.name);
            }
        });

        // Ensure Ganho and Perdido are at the end if they exist
        const regularNames = uniqueNames.filter(n => n !== "Ganho" && n !== "Perdido");
        if (uniqueNames.includes("Ganho")) regularNames.push("Ganho");
        if (uniqueNames.includes("Perdido")) regularNames.push("Perdido");

        return regularNames.map((name, index) => ({
            name,
            color: STAGE_COLORS[index % STAGE_COLORS.length],
            stages: filtered.filter(s => s.name === name)
        }));
    }, [allData?.stages, selectedFunnelId, funnels]);

    // Chart data: monthly time series with one line per stage
    const chartData = useMemo(() => {
        if (!filteredDeals.length || !chartStages.length) return [];

        const { startDate, endDate } = dateRange;

        // Generate months in range
        const months = eachMonthOfInterval({ start: startDate, end: endDate });

        return months.map(month => {
            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);

            const dataPoint: any = {
                date: format(month, "MMM", { locale: ptBR }),
                fullDate: format(month, "MMM/yy", { locale: ptBR })
            };

            // Count deals per stage that were created in this month
            chartStages.forEach(({ name, stages }) => {
                const stageIds = stages.map(s => s.id);
                const count = filteredDeals.filter(deal => {
                    const dealDate = new Date(deal.created_at);
                    return stageIds.includes(deal.stage_id) &&
                        isWithinInterval(dealDate, { start: monthStart, end: monthEnd });
                }).length;
                dataPoint[name] = count;
            });

            return dataPoint;
        });
    }, [filteredDeals, chartStages, dateRange]);

    // Table data: deals per funnel
    const tableData = useMemo(() => {
        if (!funnels || !allData?.stages || !allData?.deals) return [];

        // Filtrar deals por responsável se for agente
        let dealsToUse = allData.deals;
        if (userRole === 'agent' && currentTeamMember) {
            dealsToUse = dealsToUse.filter(d => d.responsible_id === currentTeamMember.id);
        }

        return funnels.map(funnel => {
            const funnelStages = allData.stages.filter(s => s.funnel_id === funnel.id);
            const funnelDeals = dealsToUse.filter(d => d.funnel_id === funnel.id);

            const ganhoStage = funnelStages.find(s => s.name === "Ganho");
            const perdidoStage = funnelStages.find(s => s.name === "Perdido");

            const activeDeals = funnelDeals.filter(d =>
                d.stage_id !== ganhoStage?.id && d.stage_id !== perdidoStage?.id
            ).length;

            const finishedDeals = funnelDeals.filter(d =>
                d.stage_id === ganhoStage?.id || d.stage_id === perdidoStage?.id
            ).length;

            return {
                id: funnel.id,
                name: funnel.name,
                activeDeals,
                finishedDeals
            };
        });
    }, [funnels, allData?.stages, allData?.deals, userRole, currentTeamMember]);

    const isLoading = isLoadingFunnels || isLoadingData;

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <Skeleton className="h-[400px] w-full rounded-2xl" />
                </div>
                <Skeleton className="h-[400px] w-full rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chart - 2/3 width */}
            <div className="lg:col-span-2">
                <div className="rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 p-4 md:p-6 hover:border-border transition-all duration-300 min-h-[480px] md:min-h-0 md:h-[400px] overflow-visible md:overflow-hidden">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                        <h3 className="text-sm font-medium text-muted-foreground">Negócios por Etapa</h3>

                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Chart Type Toggle */}
                            <div className="flex items-center border rounded-lg overflow-hidden">
                                <Button
                                    variant={chartType === "line" ? "default" : "ghost"}
                                    size="sm"
                                    className="h-8 rounded-none"
                                    onClick={() => setChartType("line")}
                                >
                                    <LineChartIcon className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={chartType === "bar" ? "default" : "ghost"}
                                    size="sm"
                                    className="h-8 rounded-none"
                                    onClick={() => setChartType("bar")}
                                >
                                    <BarChart3 className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* Date Filter */}
                            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilterOption)}>
                                <SelectTrigger className="w-[130px] h-8 text-xs">
                                    <Calendar className="h-3 w-3 mr-1 opacity-50" />
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
                                        <Button variant="outline" size="sm" className="h-8 text-xs">
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

                            {/* Funnel Filter */}
                            <Select value={selectedFunnelId || ""} onValueChange={setSelectedFunnelId}>
                                <SelectTrigger className="w-[140px] h-8 text-xs">
                                    <SelectValue placeholder="Funil" />
                                </SelectTrigger>
                                <SelectContent>
                                    {funnels?.map((funnel) => (
                                        <SelectItem key={funnel.id} value={funnel.id}>{funnel.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Chart */}
                    <ResponsiveContainer width="100%" height="80%">
                        {chartType === "line" ? (
                            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                                <CartesianGrid
                                    vertical={false}
                                    strokeDasharray="3 3"
                                    stroke="hsl(var(--muted))"
                                    strokeOpacity={0.3}
                                />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--card))',
                                        borderColor: 'hsl(var(--border))',
                                        borderRadius: '12px',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
                                    }}
                                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={56}
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{
                                        fontSize: 10,
                                        paddingTop: 10,
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        justifyContent: 'center',
                                        gap: '4px 12px',
                                        lineHeight: '1.6'
                                    }}
                                />
                                {chartStages.map(({ name, color }) => (
                                    <Line
                                        key={name}
                                        type="monotone"
                                        dataKey={name}
                                        name={name}
                                        stroke={color}
                                        strokeWidth={2.5}
                                        dot={{ r: 4, fill: color, strokeWidth: 2, stroke: "white" }}
                                        activeDot={{ r: 6, strokeWidth: 2, stroke: 'white' }}
                                    />
                                ))}
                            </LineChart>
                        ) : (
                            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                                <CartesianGrid
                                    vertical={false}
                                    strokeDasharray="3 3"
                                    stroke="hsl(var(--muted))"
                                    strokeOpacity={0.3}
                                />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--card))',
                                        borderColor: 'hsl(var(--border))',
                                        borderRadius: '12px',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
                                    }}
                                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
                                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.1 }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={56}
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{
                                        fontSize: 10,
                                        paddingTop: 10,
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        justifyContent: 'center',
                                        gap: '4px 12px',
                                        lineHeight: '1.6'
                                    }}
                                />
                                {chartStages.map(({ name, color }) => (
                                    <Bar
                                        key={name}
                                        dataKey={name}
                                        name={name}
                                        fill={color}
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={20}
                                    />
                                ))}
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Table - 1/3 width */}
            <div className="rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 p-6 hover:border-border transition-all duration-300 h-[400px] flex flex-col">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Negócios Ativos por Funil</h3>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-xs">Funil</TableHead>
                                <TableHead className="text-xs text-center">Ativos</TableHead>
                                <TableHead className="text-xs text-center">Finalizados</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tableData.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="font-medium text-sm py-3">{row.name}</TableCell>
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                                            {row.activeDeals}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-full bg-muted text-muted-foreground font-semibold text-sm">
                                            {row.finishedDeals}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {tableData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                        Nenhum funil encontrado
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Summary */}
                <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Total Ativos</span>
                        <span className="font-bold text-primary">
                            {tableData.reduce((acc, row) => acc + row.activeDeals, 0)}
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-sm mt-1">
                        <span className="text-muted-foreground">Total Finalizados</span>
                        <span className="font-bold">
                            {tableData.reduce((acc, row) => acc + row.finishedDeals, 0)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
