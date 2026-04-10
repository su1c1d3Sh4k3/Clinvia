import { ReportCard } from "./ReportCard";
import { TicketMetrics, QueueMetrics, calcEvolution } from "@/hooks/useReportData";
import { MessageSquare, Clock, CheckCircle, AlertCircle, Users, Layers } from "lucide-react";
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface AttendanceReportProps {
    data: TicketMetrics;
    queues: QueueMetrics;
    comparison?: TicketMetrics | null;
    comparisonQueues?: QueueMetrics | null;
}

const STATUS_COLORS: Record<string, string> = {
    Abertos: "#f59e0b",
    Pendentes: "#f97316",
    Resolvidos: "#10b981",
    Fechados: "#64748b",
};
const STATUS_BG: Record<string, string> = {
    Abertos: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    Pendentes: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    Resolvidos: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    Fechados: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

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
                        <span className="font-semibold">{e.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export function AttendanceReport({ data, queues, comparison }: AttendanceReportProps) {
    const statusData = [
        { name: "Abertos", value: data.open },
        { name: "Pendentes", value: data.pending },
        { name: "Resolvidos", value: data.resolved },
        { name: "Fechados", value: data.closed },
    ];
    const statusPie = statusData.filter(d => d.value > 0);

    const comparisonData = comparison ? [
        { name: "Total", atual: data.total, anterior: comparison.total },
        { name: "Abertos", atual: data.open, anterior: comparison.open },
        { name: "Pendentes", atual: data.pending, anterior: comparison.pending },
        { name: "Resolvidos", atual: data.resolved, anterior: comparison.resolved },
        { name: "Fechados", atual: data.closed, anterior: comparison.closed },
    ] : [];

    const agentChartData = data.byAgent.slice(0, 8).map(a => ({
        name: a.agent_name.length > 14 ? a.agent_name.slice(0, 12) + "..." : a.agent_name,
        fullName: a.agent_name,
        Tickets: a.count,
    }));

    const resolutionRate = data.total > 0 ? Math.round((data.resolved / data.total) * 100) : 0;

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10"><MessageSquare className="w-4 h-4 text-primary" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Resumo de Atendimento</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <ReportCard label="Total de Tickets" value={data.total} icon={<MessageSquare className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.total, comparison.total) : undefined} featured />
                    <ReportCard label="Abertos" value={data.open} icon={<AlertCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.open, comparison.open) : undefined} />
                    <ReportCard label="Pendentes" value={data.pending} evolution={comparison ? calcEvolution(data.pending, comparison.pending) : undefined} />
                    <ReportCard label="Resolvidos" value={data.resolved} icon={<CheckCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.resolved, comparison.resolved) : undefined} />
                    <ReportCard label="Fechados" value={data.closed} evolution={comparison ? calcEvolution(data.closed, comparison.closed) : undefined} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <ReportCard label="Tempo Médio de Resolução" value={data.avgResolutionHours !== null ? `${data.avgResolutionHours}h` : "N/A"} icon={<Clock className="w-4 h-4" />} evolution={comparison?.avgResolutionHours != null && data.avgResolutionHours != null ? calcEvolution(data.avgResolutionHours, comparison.avgResolutionHours!) : undefined} />
                    <ReportCard label="Taxa de Resolução" value={data.total > 0 ? `${((data.resolved / data.total) * 100).toFixed(1)}` : "0"} suffix="%" icon={<CheckCircle className="w-4 h-4" />} />
                </div>
            </section>

            {/* Charts */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-amber-500/10"><AlertCircle className="w-4 h-4 text-amber-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Distribuição de Status</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Status Donut */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Status dos Tickets</h4>
                            <p className="text-xs text-muted-foreground mb-4">Visão geral por situação</p>
                            {statusPie.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <defs>
                                                {statusPie.map((d, i) => (
                                                    <linearGradient key={i} id={`att-pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                                                        <stop offset="0%" stopColor={STATUS_COLORS[d.name] || "#6366f1"} stopOpacity={1} />
                                                        <stop offset="100%" stopColor={STATUS_COLORS[d.name] || "#6366f1"} stopOpacity={0.7} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <Pie data={statusPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}>
                                                {statusPie.map((_, i) => <Cell key={i} fill={`url(#att-pie-${i})`} />)}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap justify-center gap-2 mt-3">
                                        {statusPie.map(d => (
                                            <span key={d.name} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BG[d.name] || ""}`}>
                                                <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[d.name] }} />
                                                {d.name}: {d.value}
                                            </span>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                                    <MessageSquare className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem tickets</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Agents Bar Chart */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Tickets por Atendente</h4>
                            <p className="text-xs text-muted-foreground mb-4">Volume de atendimentos por agente</p>
                            {agentChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={agentChartData} margin={{ left: 0, right: 8 }}>
                                        <defs>
                                            <linearGradient id="att-bar-agent" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-20} textAnchor="end" height={50} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                        <Tooltip content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                                                    <p className="text-xs font-medium text-muted-foreground mb-1">{d.fullName || d.name}</p>
                                                    <p className="text-sm font-semibold">{d.Tickets} tickets</p>
                                                </div>
                                            );
                                        }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                        <Bar dataKey="Tickets" fill="url(#att-bar-agent)" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                                    <Users className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem dados</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Resolution Gauge */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10 flex flex-col items-center justify-center h-full">
                            <h4 className="text-sm font-semibold mb-1">Taxa de Resolução</h4>
                            <p className="text-xs text-muted-foreground mb-5">Tickets resolvidos sobre o total</p>
                            <div className="relative w-32 h-32">
                                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="8" />
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="#10b981" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${resolutionRate * 2.64} 264`} className="transition-all duration-1000 ease-out" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-black tracking-tight">{resolutionRate}%</span>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-4">
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.resolved}</span> de {data.total} tickets
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Comparison */}
            {comparison && comparisonData.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-blue-500/10"><MessageSquare className="w-4 h-4 text-blue-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Comparativo de Períodos</h3>
                    </div>
                    <div className={CARD}>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8, top: 8 }}>
                                <defs>
                                    <linearGradient id="att-comp-atual" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="att-comp-ant" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#93c5fd" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                <Bar dataKey="atual" name="Período Atual" fill="url(#att-comp-atual)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="anterior" name="Período Anterior" fill="url(#att-comp-ant)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            {/* Queue Table */}
            {queues.byQueue.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '300ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-purple-500/10"><Layers className="w-4 h-4 text-purple-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Detalhamento por Fila</h3>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 overflow-hidden shadow-sm">
                        <div className="p-5 border-b border-border/50">
                            <h4 className="text-sm font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-purple-500" /> Conversas por Fila</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Distribuição de atendimentos entre as filas</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/50 bg-muted/30">
                                        <th className="text-left p-3 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fila</th>
                                        <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Conversas</th>
                                        <th className="text-right p-3 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">% do Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queues.byQueue.map((q, i) => {
                                        const total = queues.byQueue.reduce((s, q) => s + q.count, 0);
                                        const pct = total > 0 ? (q.count / total) * 100 : 0;
                                        return (
                                            <tr key={q.queue_id || i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                                <td className="p-3 px-5 font-medium">{q.queue_name}</td>
                                                <td className="p-3 text-right">
                                                    <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-full bg-primary/10 text-primary font-semibold text-sm">{q.count}</span>
                                                </td>
                                                <td className="p-3 px-5 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                                            <div className="h-full rounded-full bg-primary/60 transition-all duration-700" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="text-muted-foreground text-xs w-10 text-right">{pct.toFixed(1)}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
