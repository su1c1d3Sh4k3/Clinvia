import { ReportCard } from "./ReportCard";
import { ContactMetrics, calcEvolution } from "@/hooks/useReportData";
import { UserPlus, Target, TrendingUp } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, FunnelChart, Funnel, LabelList, Cell,
} from "recharts";

interface ContactsLeadsReportProps {
    data: ContactMetrics;
    comparison?: ContactMetrics | null;
}

const CHART_GRID = "rgba(148,163,184,0.1)";
const CHART_TEXT = "#64748b";
const FUNNEL_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e"];

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-popover-foreground">
            {label && <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>}
            {payload.map((e: any, i: number) => (
                <p key={i} className="text-sm" style={{ color: e.color || e.payload?.fill }}>
                    <span className="font-medium">{e.name}:</span> {e.value}
                </p>
            ))}
        </div>
    );
};

export function ContactsLeadsReport({ data, comparison }: ContactsLeadsReportProps) {
    const funnelData = [
        { name: "Contatos", value: data.totalNew, fill: FUNNEL_COLORS[0] },
        { name: "Leads", value: data.totalLeads, fill: FUNNEL_COLORS[1] },
    ];

    const comparisonData = comparison ? [
        { name: "Novos Contatos", atual: data.totalNew, anterior: comparison.totalNew },
        { name: "Leads", atual: data.totalLeads, anterior: comparison.totalLeads },
        { name: "Conversao %", atual: data.conversionRate, anterior: comparison.conversionRate },
    ] : [];

    const barData = [
        { name: "Contatos", Quantidade: data.totalNew },
        { name: "Leads", Quantidade: data.totalLeads },
    ];

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo de Contatos & Leads</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ReportCard label="Novos Contatos" value={data.totalNew} icon={<UserPlus className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalNew, comparison.totalNew) : undefined} />
                    <ReportCard label="Contatos para Leads" value={data.totalLeads} icon={<Target className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalLeads, comparison.totalLeads) : undefined} />
                    <ReportCard label="Taxa de Conversao" value={data.conversionRate} suffix="%" icon={<TrendingUp className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.conversionRate, comparison.conversionRate) : undefined} className={data.conversionRate >= 30 ? "border-green-500/20" : ""} />
                </div>
            </section>

            {/* Funnel Visualization */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Funil de Conversao</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-xl border bg-card p-4">
                        <h4 className="text-sm font-semibold mb-4">Contatos vs Leads</h4>
                        {data.totalNew > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={barData} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: CHART_TEXT }} />
                                    <YAxis tick={{ fontSize: 11, fill: CHART_TEXT }} allowDecimals={false} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="Quantidade" radius={[4, 4, 0, 0]}>
                                        <Cell fill={FUNNEL_COLORS[0]} />
                                        <Cell fill={FUNNEL_COLORS[1]} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">Sem contatos no periodo</div>
                        )}
                    </div>

                    {/* Conversion Indicator */}
                    <div className="rounded-xl border bg-card p-4 flex flex-col items-center justify-center">
                        <h4 className="text-sm font-semibold mb-6">Taxa de Conversao</h4>
                        <div className="relative w-36 h-36">
                            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="10" />
                                <circle cx="50" cy="50" r="42" fill="none" stroke="#22c55e" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${data.conversionRate * 2.64} 264`} />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-bold">{data.conversionRate}%</span>
                                <span className="text-xs text-muted-foreground">conversao</span>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-4 text-center">
                            {data.totalLeads} leads de {data.totalNew} contatos
                        </p>
                    </div>
                </div>
            </section>

            {/* Comparison */}
            {comparison && comparisonData.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Comparativo de Periodos</h3>
                    <div className="rounded-xl border bg-card p-4">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_TEXT }} />
                                <YAxis tick={{ fontSize: 11, fill: CHART_TEXT }} allowDecimals={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="atual" name="Periodo Atual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="anterior" name="Periodo Anterior" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}
        </div>
    );
}
