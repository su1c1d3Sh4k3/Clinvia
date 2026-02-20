import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { XCircle, TrendingDown, MessageSquareText } from "lucide-react";
import { LOSS_REASONS } from "@/components/crm/LossReasonModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

// Colors for each loss reason
const LOSS_REASON_COLORS: Record<string, string> = {
    price: "#ef4444", // red
    competitor: "#f97316", // orange
    timing: "#eab308", // yellow
    no_budget: "#84cc16", // lime
    no_need: "#22c55e", // green
    no_response: "#14b8a6", // teal
    product_fit: "#06b6d4", // cyan
    service_quality: "#3b82f6", // blue
    other: "#8b5cf6", // violet
};

interface LossReasonData {
    name: string;
    value: number;
    label: string;
    color: string;
}

interface OtherReasonDeal {
    id: string;
    title: string;
    reason: string;
    contactName?: string;
}

export function LossReasonsChart() {
    // Fetch deals with loss_reason
    const { data: lossData, isLoading } = useQuery({
        queryKey: ["loss-reasons-chart"],
        queryFn: async () => {
            // Get all deals that have loss_reason
            const { data: deals, error } = await supabase
                .from("crm_deals" as any)
                .select(`
                    id,
                    title,
                    loss_reason,
                    loss_reason_other,
                    contacts(push_name)
                `)
                .not("loss_reason", "is", null);

            if (error) throw error;

            // Count by reason
            const reasonCounts: Record<string, number> = {};
            const otherReasonDeals: OtherReasonDeal[] = [];

            (deals || []).forEach((deal: any) => {
                const reason = deal.loss_reason;
                if (reason) {
                    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

                    // Collect deals with "other" reason
                    if (reason === "other" && deal.loss_reason_other) {
                        otherReasonDeals.push({
                            id: deal.id,
                            title: deal.title,
                            reason: deal.loss_reason_other,
                            contactName: deal.contacts?.push_name,
                        });
                    }
                }
            });

            // Transform to chart data
            const chartData: LossReasonData[] = LOSS_REASONS.map(({ value, label }) => ({
                name: value,
                label: label,
                value: reasonCounts[value] || 0,
                color: LOSS_REASON_COLORS[value] || "#6b7280",
            })).filter(item => item.value > 0);

            return {
                chartData,
                otherReasonDeals,
                totalLost: Object.values(reasonCounts).reduce((a, b) => a + b, 0),
            };
        },
    });

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-[300px] w-full" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-36" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-[250px] w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    const chartData = lossData?.chartData || [];
    const otherReasonDeals = lossData?.otherReasonDeals || [];
    const totalLost = lossData?.totalLost || 0;

    if (totalLost === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <XCircle className="h-5 w-5 text-red-500" />
                        Motivos de Perda
                    </CardTitle>
                    <CardDescription>Análise dos motivos das negociações perdidas</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                        <TrendingDown className="h-12 w-12 mb-4 opacity-50" />
                        <p className="text-sm">Nenhuma negociação perdida com motivo registrado</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar Chart - Main (2/3 width on desktop) */}
            <Card className="lg:col-span-2 bg-background/80 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-300 relative group overflow-hidden rounded-2xl">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-background/5 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
                <div className="relative z-10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <XCircle className="h-5 w-5 text-red-500" />
                            Motivos de Perda
                        </CardTitle>
                        <CardDescription>
                            {totalLost} negociação(ões) perdida(s) com motivo registrado
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={chartData}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        type="category"
                                        dataKey="label"
                                        tick={{ fontSize: 10 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={80}
                                        interval={0}
                                    />
                                    <YAxis
                                        type="number"
                                        allowDecimals={false}
                                        tick={{ fontSize: 12 }}
                                    />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload as LossReasonData;
                                                return (
                                                    <div className="bg-popover border rounded-lg shadow-lg p-3">
                                                        <p className="font-medium">{data.label}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {data.value} negociação(ões)
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {((data.value / totalLost) * 100).toFixed(1)}% do total
                                                        </p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </div>
            </Card>

            {/* Other Reasons Detail (1/3 width on desktop) */}
            <Card className="bg-background/80 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-300 relative group overflow-hidden rounded-2xl">
                <div className="absolute inset-0 bg-gradient-to-bl from-violet-500/5 via-transparent to-background/5 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
                <div className="relative z-10 h-full flex flex-col">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <MessageSquareText className="h-4 w-4 text-violet-500" />
                            Outros Motivos
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Detalhes das negociações com motivo personalizado
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {otherReasonDeals.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                                <MessageSquareText className="h-8 w-8 mb-2 opacity-50" />
                                <p className="text-xs text-center">Nenhuma negociação com "Outro motivo"</p>
                            </div>
                        ) : (
                            <ScrollArea className="h-[280px] pr-4">
                                <div className="space-y-3">
                                    {otherReasonDeals.map((deal) => (
                                        <div
                                            key={deal.id}
                                            className="p-3 rounded-lg border bg-muted/30 space-y-2"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-sm truncate max-w-[140px]">
                                                    {deal.title}
                                                </span>
                                                <Badge variant="secondary" className="text-xs bg-violet-500/10 text-violet-600">
                                                    Outro
                                                </Badge>
                                            </div>
                                            {deal.contactName && (
                                                <p className="text-xs text-muted-foreground">
                                                    Contato: {deal.contactName}
                                                </p>
                                            )}
                                            <p className="text-sm italic text-muted-foreground border-l-2 border-violet-500/50 pl-2">
                                                "{deal.reason}"
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </CardContent>
                </div>
            </Card>
        </div>
    );
}
