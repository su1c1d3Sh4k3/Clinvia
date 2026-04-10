import { ReportCard } from "./ReportCard";
import { AppointmentMetrics, calcEvolution } from "@/hooks/useReportData";
import { Calendar, CheckCircle, Clock, RefreshCw, XCircle, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface AppointmentsReportProps {
    data: AppointmentMetrics;
    comparison?: AppointmentMetrics | null;
}

const STATUS_COLORS: Record<string, string> = {
    Pendentes: "#f59e0b",
    Confirmados: "#3b82f6",
    Concluidos: "#22c55e",
    Reagendados: "#8b5cf6",
    Cancelados: "#ef4444",
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

export function AppointmentsReport({ data, comparison }: AppointmentsReportProps) {
    const statusPie = [
        { name: "Pendentes", value: data.pending },
        { name: "Confirmados", value: data.confirmed },
        { name: "Concluidos", value: data.completed },
        { name: "Reagendados", value: data.rescheduled },
        { name: "Cancelados", value: data.canceled },
    ].filter(d => d.value > 0);

    const comparisonData = comparison ? [
        { name: "Total", atual: data.total, anterior: comparison.total },
        { name: "Pendentes", atual: data.pending, anterior: comparison.pending },
        { name: "Confirmados", atual: data.confirmed, anterior: comparison.confirmed },
        { name: "Concluidos", atual: data.completed, anterior: comparison.completed },
        { name: "Reagendados", atual: data.rescheduled, anterior: comparison.rescheduled },
        { name: "Cancelados", atual: data.canceled, anterior: comparison.canceled },
    ] : [];

    const occupancyChart = data.occupancyByProfessional.slice(0, 8).map(p => ({
        name: p.professional_name.length > 14 ? p.professional_name.slice(0, 12) + "..." : p.professional_name,
        Ocupacao: p.occupancy,
        fullName: p.professional_name,
    }));

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo de Agendamentos</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <ReportCard label="Total" value={data.total} icon={<Calendar className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.total, comparison.total) : undefined} />
                    <ReportCard label="Pendentes" value={data.pending} icon={<Clock className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.pending, comparison.pending) : undefined} />
                    <ReportCard label="Confirmados" value={data.confirmed} icon={<CheckCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.confirmed, comparison.confirmed) : undefined} />
                    <ReportCard label="Concluidos" value={data.completed} evolution={comparison ? calcEvolution(data.completed, comparison.completed) : undefined} />
                    <ReportCard label="Reagendados" value={data.rescheduled} icon={<RefreshCw className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.rescheduled, comparison.rescheduled) : undefined} />
                    <ReportCard label="Cancelados" value={data.canceled} icon={<XCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.canceled, comparison.canceled) : undefined} />
                </div>
            </section>

            {/* Charts */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Visualizacao</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status Donut */}
                    <div className="rounded-xl border bg-card p-4">
                        <h4 className="text-sm font-semibold mb-4">Distribuicao por Status</h4>
                        {statusPie.length > 0 ? (
                            <>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={statusPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {statusPie.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.name] || "#6366f1"} />)}
                                        </Pie>
                                        <Tooltip content={<ChartTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
                                    {statusPie.map(d => (
                                        <div key={d.name} className="flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[d.name] }} />
                                            {d.name}: {d.value}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">Sem agendamentos</div>
                        )}
                    </div>

                    {/* Occupancy Chart */}
                    <div className="rounded-xl border bg-card p-4">
                        <h4 className="text-sm font-semibold mb-4">Ocupacao por Profissional</h4>
                        {occupancyChart.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={occupancyChart} layout="vertical" margin={{ left: 0, right: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: CHART_TEXT }} unit="%" />
                                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: CHART_TEXT }} />
                                    <Tooltip content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0].payload;
                                        return (
                                            <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-popover-foreground">
                                                <p className="text-xs font-medium text-muted-foreground mb-1">{d.fullName}</p>
                                                <p className="text-sm font-semibold">{d.Ocupacao}% ocupado</p>
                                            </div>
                                        );
                                    }} />
                                    <Bar dataKey="Ocupacao" radius={[0, 4, 4, 0]}>
                                        {occupancyChart.map((d, i) => (
                                            <Cell key={i} fill={d.Ocupacao >= 80 ? "#22c55e" : d.Ocupacao >= 50 ? "#f59e0b" : "#ef4444"} />
                                        ))}
                                    </Bar>
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

            {/* Professional Detail Table */}
            {data.byProfessional.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detalhamento</h3>
                    <div className="rounded-xl border bg-card">
                        <div className="p-4 border-b">
                            <h4 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Agendamentos por Profissional</h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-muted-foreground">
                                        <th className="text-left p-3 font-medium">Profissional</th>
                                        <th className="text-right p-3 font-medium">Agendamentos</th>
                                        <th className="text-right p-3 font-medium">% do Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.byProfessional.map((prof) => (
                                        <tr key={prof.professional_id} className="border-b last:border-0 hover:bg-muted/50">
                                            <td className="p-3">{prof.professional_name}</td>
                                            <td className="p-3 text-right font-medium">{prof.count}</td>
                                            <td className="p-3 text-right text-muted-foreground">
                                                {data.total > 0 ? ((prof.count / data.total) * 100).toFixed(1) : 0}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
