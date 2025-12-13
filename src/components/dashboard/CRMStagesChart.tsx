import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export const CRMStagesChart = () => {
    const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);

    // Fetch Funnels
    const { data: funnels } = useQuery({
        queryKey: ["crm-funnels-chart"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_funnels" as any)
                .select("id, name")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    // Auto-select first funnel
    useEffect(() => {
        if (funnels && funnels.length > 0 && !selectedFunnelId) {
            setSelectedFunnelId(funnels[0].id);
        }
    }, [funnels, selectedFunnelId]);

    // Fetch Stages and Deal Counts
    const { data: chartData, isLoading } = useQuery({
        queryKey: ["crm-stages-chart", selectedFunnelId],
        queryFn: async () => {
            if (!selectedFunnelId) return [];

            // Get stages
            const { data: stages, error: stagesError } = await supabase
                .from("crm_stages" as any)
                .select("id, name")
                .eq("funnel_id", selectedFunnelId)
                .order("position");

            if (stagesError) throw stagesError;

            // Get deals count per stage
            // We can do this with a raw query or iterating. 
            // For simplicity and RLS compliance, let's fetch deals and aggregate in JS or use a view if available.
            // Since we don't have a specific RPC for this yet, let's fetch deals for the funnel.
            const { data: deals, error: dealsError } = await supabase
                .from("crm_deals" as any)
                .select("stage_id")
                .eq("funnel_id", selectedFunnelId);

            if (dealsError) throw dealsError;

            // Aggregate
            const counts: Record<string, number> = {};
            deals?.forEach((deal: any) => {
                counts[deal.stage_id] = (counts[deal.stage_id] || 0) + 1;
            });

            return stages.map((stage: any) => ({
                name: stage.name,
                value: counts[stage.id] || 0
            })).filter((item: any) => item.value > 0); // Optional: hide empty stages or keep them
        },
        enabled: !!selectedFunnelId
    });

    const hasData = chartData && chartData.length > 0;

    return (
        <Card className="flex flex-col h-[300px]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-[#005AA8] dark:text-muted-foreground">
                    Cliente por Etapa do CRM
                </CardTitle>
                {funnels && funnels.length > 0 && (
                    <Select value={selectedFunnelId || ""} onValueChange={setSelectedFunnelId}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Funil" />
                        </SelectTrigger>
                        <SelectContent>
                            {funnels.map((f: any) => (
                                <SelectItem key={f.id} value={f.id} className="text-xs">
                                    {f.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </CardHeader>
            <CardContent className="flex-1 pb-0">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <span className="loading loading-spinner loading-sm"></span>
                    </div>
                ) : hasData ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={70}
                                paddingAngle={5}
                                dataKey="value"
                                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                            >
                                {chartData.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        Sem dados neste funil
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
