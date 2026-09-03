import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";
import { CRM_STAGES, TERMINAL_STAGES, STAGE_COLORS } from "@/types/crm-client";
import { PeriodPicker, useCrmPeriod } from "./PeriodPicker";
import { useCrmStageMovement } from "@/hooks/useCrmDashboard";

const ACTIVE_STAGES = CRM_STAGES.filter((s) => !TERMINAL_STAGES.includes(s as any));

export function MonitoramentoSection() {
    const periodState = useCrmPeriod();
    const { data, isLoading } = useCrmStageMovement(periodState.range);

    const chartData = useMemo(
        () =>
            ACTIVE_STAGES.map((stage) => ({
                stage,
                total: data?.find((d) => d.stage === stage)?.total ?? 0,
            })),
        [data]
    );

    const isEmpty = !isLoading && (!data || data.length === 0);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Monitoramento CRM</h3>
                <PeriodPicker {...periodState} />
            </div>

            <Card className="rounded-2xl border border-border/50 shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        Negociações que entraram em cada etapa no período
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground py-16 text-center">Carregando...</p>
                    ) : isEmpty ? (
                        <p className="text-sm text-muted-foreground py-16 text-center">
                            Nenhuma negociação mudou de etapa no período
                        </p>
                    ) : (
                        <div className="h-[320px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 20, right: 8, left: -16, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                                    <XAxis
                                        dataKey="stage"
                                        tick={{ fontSize: 10 }}
                                        interval={0}
                                        angle={-35}
                                        textAnchor="end"
                                    />
                                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip
                                        formatter={(value: number) => [value, "Negociações"]}
                                        contentStyle={{
                                            borderRadius: 8,
                                            fontSize: 12,
                                            border: "1px solid hsl(var(--border))",
                                        }}
                                    />
                                    <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48}>
                                        {chartData.map((d) => (
                                            <Cell key={d.stage} fill={STAGE_COLORS[d.stage] || "#8b5cf6"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
