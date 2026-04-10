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
    received: "#10b981",
    pending: "#3b82f6",
    overdue: "#ef4444",
};

function fBRL(v: number) {
    return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CARD = "relative group rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 p-6 hover:shadow-md hover:border-border/80 transition-all duration-300";

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
            {label && <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>}
            <div className="space-y-1.5">
                {payload.map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color || e.payload?.fill }} />
                        <span className="text-muted-foreground">{e.name}:</span>
                        <span className="font-semibold">{fBRL(e.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export function FinancialReport({ data, comparison }: FinancialReportProps) {
    const breakdownPie = [
        { name: "Recebido", value: data.totalReceived, color: COLORS.received },
        { name: "A Receber", value: data.totalPending, color: COLORS.pending },
        { name: "Inadimplente", value: data.totalOverdue, color: COLORS.overdue },
    ].filter(d => d.value > 0);

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
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10"><DollarSign className="w-4 h-4 text-primary" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Resumo Financeiro</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ReportCard label="Receita Total" value={data.totalRevenue} prefix="R$" icon={<DollarSign className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalRevenue, comparison.totalRevenue) : undefined} featured />
                    <ReportCard label="Recebido" value={data.totalReceived} prefix="R$" icon={<TrendingUp className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalReceived, comparison.totalReceived) : undefined} className="border-emerald-500/20 hover:border-emerald-500/40" />
                    <ReportCard label="A Receber" value={data.totalPending} prefix="R$" icon={<Clock className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalPending, comparison.totalPending) : undefined} className="border-blue-500/20 hover:border-blue-500/40" />
                    <ReportCard label="Inadimplente" value={data.totalOverdue} prefix="R$" icon={<AlertTriangle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalOverdue, comparison.totalOverdue) : undefined} className={data.totalOverdue > 0 ? "border-red-500/20 hover:border-red-500/40" : ""} />
                </div>
            </section>

            {/* Charts */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10"><TrendingUp className="w-4 h-4 text-emerald-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Composicao da Receita</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Breakdown Donut */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Distribuicao por Status</h4>
                            <p className="text-xs text-muted-foreground mb-4">Receita segmentada por situacao de pagamento</p>
                            {breakdownPie.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <defs>
                                                {breakdownPie.map((d, i) => (
                                                    <linearGradient key={i} id={`fin-pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                                                        <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                                                        <stop offset="100%" stopColor={d.color} stopOpacity={0.7} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <Pie data={breakdownPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}>
                                                {breakdownPie.map((_, i) => <Cell key={i} fill={`url(#fin-pie-${i})`} />)}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap justify-center gap-4 mt-3 text-xs">
                                        {breakdownPie.map(d => (
                                            <div key={d.name} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30">
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                                                <span className="text-muted-foreground">{d.name}:</span>
                                                <span className="font-semibold">{fBRL(d.value)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                                    <DollarSign className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem dados financeiros</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Collection Rate Gauge */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10 flex flex-col items-center justify-center h-full">
                            <h4 className="text-sm font-semibold mb-1">Taxa de Recebimento</h4>
                            <p className="text-xs text-muted-foreground mb-6">Percentual da receita efetivamente recebida</p>
                            <div className="relative w-40 h-40">
                                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="8" />
                                    <circle cx="50" cy="50" r="42" fill="none" stroke={COLORS.received} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${receivedPct * 2.64} 264`} className="transition-all duration-1000 ease-out" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-4xl font-black tracking-tight">{receivedPct}%</span>
                                    <span className="text-xs text-muted-foreground font-medium mt-1">recebido</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-6 text-xs text-muted-foreground">
                                <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">{fBRL(data.totalReceived)}</span>
                                <span>de</span>
                                <span className="font-semibold">{fBRL(data.totalRevenue)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Comparison */}
            {comparison && comparisonData.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-blue-500/10"><TrendingUp className="w-4 h-4 text-blue-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Comparativo de Periodos</h3>
                    </div>
                    <div className={CARD}>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8, top: 8 }}>
                                <defs>
                                    <linearGradient id="fin-bar-atual" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="fin-bar-anterior" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#93c5fd" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                <Bar dataKey="atual" name="Periodo Atual" fill="url(#fin-bar-atual)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="anterior" name="Periodo Anterior" fill="url(#fin-bar-anterior)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}
        </div>
    );
}
