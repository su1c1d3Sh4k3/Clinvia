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
    Resolvidos: "#22c55e",
    Fechados: "#64748b",
};
const CHART_GRID = "rgba(148,163,184,0.1)";
const CHART_TEXT = "#64748b";

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
        Tickets: a.count,
    }));

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo de Atendimento</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <ReportCard label="Total de Tickets" value={data.total} icon={<MessageSquare className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.total, comparison.total) : undefined} />
                    <ReportCard label="Abertos" value={data.open} icon={<AlertCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.open, comparison.open) : undefined} />
                    <ReportCard label="Pendentes" value={data.pending} evolution={comparison ? calcEvolution(data.pending, comparison.pending) : undefined} />
                    <ReportCard label="Resolvidos" value={data.resolved} icon={<CheckCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.resolved, comparison.resolved) : undefined} />
                    <ReportCard label="Fechados" value={data.closed} evolution={comparison ? calcEvolution(data.closed, comparison.closed) : undefined} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <ReportCard label="Tempo Medio de Resolucao" value={data.avgResolutionHours !== null ? `${data.avgResolutionHours}h` : "N/A"} icon={<Clock className="w-4 h-4" />} evolution={comparison?.avgResolutionHours != null && data.avgResolutionHours != null ? calcEvolution(data.avgResolutionHours, comparison.avgResolutionHours!) : undefined} />
                    <ReportCard label="Taxa de Resolucao" value={data.total > 0 ? `${((data.resolved / data.total) * 100).toFixed(1)}` : "0"} suffix="%" icon={<CheckCircle className="w-4 h-4" />} />
                </div>
            </section>

            {/* Charts */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Distribuicao de Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status Donut */}
                    <div className="rounded-xl border bg-card p-4">
                        <h4 className="text-sm font-semibold mb-4">Status dos Tickets</h4>
                        {statusPie.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie data={statusPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                        {statusPie.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.name] || "#6366f1"} />)}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">Sem tickets</div>
                        )}
                    </div>

                    {/* Agents Bar Chart */}
                    <div className="rounded-xl border bg-card p-4">
                        <h4 className="text-sm font-semibold mb-4">Tickets por Atendente</h4>
                        {agentChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={agentChartData} margin={{ left: 0, right: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal />
                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: CHART_TEXT }} interval={0} angle={-20} textAnchor="end" height={50} />
                                    <YAxis tick={{ fontSize: 11, fill: CHART_TEXT }} allowDecimals={false} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="Tickets" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">Sem dados</div>
                        )}
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

            {/* Queue Table */}
            {queues.byQueue.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detalhamento por Fila</h3>
                    <div className="rounded-xl border bg-card">
                        <div className="p-4 border-b">
                            <h4 className="text-sm font-semibold flex items-center gap-2"><Layers className="w-4 h-4" /> Conversas por Fila</h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-muted-foreground">
                                        <th className="text-left p-3 font-medium">Fila</th>
                                        <th className="text-right p-3 font-medium">Conversas</th>
                                        <th className="text-right p-3 font-medium">% do Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queues.byQueue.map((q, i) => {
                                        const total = queues.byQueue.reduce((s, q) => s + q.count, 0);
                                        return (
                                            <tr key={q.queue_id || i} className="border-b last:border-0 hover:bg-muted/50">
                                                <td className="p-3">{q.queue_name}</td>
                                                <td className="p-3 text-right font-medium">{q.count}</td>
                                                <td className="p-3 text-right text-muted-foreground">
                                                    {total > 0 ? ((q.count / total) * 100).toFixed(1) : 0}%
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
