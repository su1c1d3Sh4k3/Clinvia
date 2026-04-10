import { ReportCard } from "./ReportCard";
import { FinancialMetrics, calcEvolution } from "@/hooks/useReportData";
import { DollarSign, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface FinancialReportProps {
    data: FinancialMetrics;
    comparison?: FinancialMetrics | null;
}

const COLORS = {
    received: "#22c55e",
    pending: "#3b82f6",
    overdue: "#ef4444",
    revenue: "#8b5cf6",
};
const CHART_GRID = "rgba(148,163,184,0.1)";
const CHART_TEXT = "#64748b";

function fBRL(v: number) {
    return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-popover-foreground">
            {label && <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>}
            {payload.map((e: any, i: number) => (
                <p key={i} className="text-sm" style={{ color: e.color || e.payload?.fill }}>
                    <span className="font-medium">{e.name}:</span> {fBRL(e.value)}
                </p>
            ))}
        </div>
    );
};

export function FinancialReport({ data, comparison }: FinancialReportProps) {
    const breakdownPie = [
        { name: "Recebido", value: data.totalReceived, color: COLORS.received },
        { name: "A Receber", value: data.totalPending, color: COLORS.pending },
        { name: "Inadimplente", value: data.totalOverdue, color: COLORS.overdue },
    ].filter(d => d.value > 0);

    const barData = [
        { name: "Recebido", valor: data.totalReceived, fill: COLORS.received },
        { name: "A Receber", valor: data.totalPending, fill: COLORS.pending },
        { name: "Inadimplente", valor: data.totalOverdue, fill: COLORS.overdue },
    ];

    const comparisonData = comparison ? [
        { name: "Receita", atual: data.totalRevenue, anterior: comparison.totalRevenue },
        { name: "Recebido", atual: data.totalReceived, anterior: comparison.totalReceived },
        { name: "A Receber", atual: data.totalPending, anterior: comparison.totalPending },
        { name: "Inadimplente", atual: data.totalOverdue, anterior: comparison.totalOverdue },
    ] : [];

    const receivedPct = data.totalRevenue > 0 ? Math.round((data.totalReceived / data.totalRevenue) * 100) : 0;

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo Financeiro</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ReportCard label="Receita Total" value={data.totalRevenue} prefix="R$" icon={<DollarSign className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalRevenue, comparison.totalRevenue) : undefined} />
                    <ReportCard label="Recebido" value={data.totalReceived} prefix="R$" icon={<TrendingUp className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalReceived, comparison.totalReceived) : undefined} className="border-green-500/20" />
                    <ReportCard label="A Receber" value={data.totalPending} prefix="R$" icon={<Clock className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalPending, comparison.totalPending) : undefined} className="border-blue-500/20" />
                    <ReportCard label="Inadimplente" value={data.totalOverdue} prefix="R$" icon={<AlertTriangle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalOverdue, comparison.totalOverdue) : undefined} className={data.totalOverdue > 0 ? "border-red-500/20" : ""} />
                </div>
            </section>

            {/* Charts */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Composicao da Receita</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Breakdown Donut */}
                    <div className="rounded-xl border bg-card p-4">
                        <h4 className="text-sm font-semibold mb-4">Distribuicao por Status</h4>
                        {breakdownPie.length > 0 ? (
                            <>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={breakdownPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {breakdownPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                                        </Pie>
                                        <Tooltip content={<ChartTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs">
                                    {breakdownPie.map(d => (
                                        <div key={d.name} className="flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                                            {d.name}: {fBRL(d.value)}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">Sem dados financeiros</div>
                        )}
                    </div>

                    {/* Collection Rate */}
                    <div className="rounded-xl border bg-card p-4 flex flex-col items-center justify-center">
                        <h4 className="text-sm font-semibold mb-6">Taxa de Recebimento</h4>
                        <div className="relative w-36 h-36">
                            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="10" />
                                <circle cx="50" cy="50" r="42" fill="none" stroke={COLORS.received} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${receivedPct * 2.64} 264`} />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-bold">{receivedPct}%</span>
                                <span className="text-xs text-muted-foreground">recebido</span>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-4 text-center">
                            {fBRL(data.totalReceived)} de {fBRL(data.totalRevenue)}
                        </p>
                    </div>
                </div>
            </section>

            {/* Comparison */}
            {comparison && comparisonData.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Comparativo de Periodos</h3>
                    <div className="rounded-xl border bg-card p-4">
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: CHART_TEXT }} />
                                <YAxis tick={{ fontSize: 11, fill: CHART_TEXT }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
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
