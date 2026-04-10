import { ReportCard } from "./ReportCard";
import { AppointmentMetrics, calcEvolution } from "@/hooks/useReportData";
import { Calendar, CheckCircle, Clock, RefreshCw, XCircle, Users } from "lucide-react";
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
    Concluidos: "#10b981",
    Reagendados: "#8b5cf6",
    Cancelados: "#ef4444",
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

    const completionRate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10"><Calendar className="w-4 h-4 text-primary" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Resumo de Agendamentos</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <ReportCard label="Total" value={data.total} icon={<Calendar className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.total, comparison.total) : undefined} featured />
                    <ReportCard label="Pendentes" value={data.pending} icon={<Clock className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.pending, comparison.pending) : undefined} />
                    <ReportCard label="Confirmados" value={data.confirmed} icon={<CheckCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.confirmed, comparison.confirmed) : undefined} />
                    <ReportCard label="Concluidos" value={data.completed} evolution={comparison ? calcEvolution(data.completed, comparison.completed) : undefined} />
                    <ReportCard label="Reagendados" value={data.rescheduled} icon={<RefreshCw className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.rescheduled, comparison.rescheduled) : undefined} />
                    <ReportCard label="Cancelados" value={data.canceled} icon={<XCircle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.canceled, comparison.canceled) : undefined} />
                </div>
            </section>

            {/* Charts */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-amber-500/10"><Clock className="w-4 h-4 text-amber-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Visualizacao</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Status Donut */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Distribuicao por Status</h4>
                            <p className="text-xs text-muted-foreground mb-4">Agendamentos segmentados por situacao</p>
                            {statusPie.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <defs>
                                                {statusPie.map((d, i) => (
                                                    <linearGradient key={i} id={`appt-pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                                                        <stop offset="0%" stopColor={STATUS_COLORS[d.name] || "#6366f1"} stopOpacity={1} />
                                                        <stop offset="100%" stopColor={STATUS_COLORS[d.name] || "#6366f1"} stopOpacity={0.7} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <Pie data={statusPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}>
                                                {statusPie.map((_, i) => <Cell key={i} fill={`url(#appt-pie-${i})`} />)}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap justify-center gap-2 mt-3">
                                        {statusPie.map(d => (
                                            <span key={d.name} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted/30 font-medium">
                                                <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[d.name] }} />
                                                {d.name}: {d.value}
                                            </span>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                                    <Calendar className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem agendamentos</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Occupancy Chart */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Ocupacao por Profissional</h4>
                            <p className="text-xs text-muted-foreground mb-4">Taxa de ocupacao da agenda</p>
                            {occupancyChart.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={occupancyChart} layout="vertical" margin={{ left: 0, right: 12 }}>
                                        <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} horizontal={false} />
                                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                                                    <p className="text-xs font-medium text-muted-foreground mb-1">{d.fullName}</p>
                                                    <p className="text-sm font-semibold">{d.Ocupacao}% ocupado</p>
                                                </div>
                                            );
                                        }} />
                                        <Bar dataKey="Ocupacao" radius={[0, 6, 6, 0]}>
                                            {occupancyChart.map((d, i) => (
                                                <Cell key={i} fill={d.Ocupacao >= 80 ? "#10b981" : d.Ocupacao >= 50 ? "#f59e0b" : "#ef4444"} />
                                            ))}
                                        </Bar>
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

                    {/* Completion Gauge */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10 flex flex-col items-center justify-center h-full">
                            <h4 className="text-sm font-semibold mb-1">Taxa de Conclusao</h4>
                            <p className="text-xs text-muted-foreground mb-5">Agendamentos concluidos sobre o total</p>
                            <div className="relative w-32 h-32">
                                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="8" />
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="#10b981" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${completionRate * 2.64} 264`} className="transition-all duration-1000 ease-out" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-black tracking-tight">{completionRate}%</span>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-4">
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.completed}</span> de {data.total} agendamentos
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Comparison */}
            {comparison && comparisonData.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-blue-500/10"><Calendar className="w-4 h-4 text-blue-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Comparativo de Periodos</h3>
                    </div>
                    <div className={CARD}>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8, top: 8 }}>
                                <defs>
                                    <linearGradient id="appt-comp-atual" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="appt-comp-ant" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#93c5fd" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                <Bar dataKey="atual" name="Periodo Atual" fill="url(#appt-comp-atual)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="anterior" name="Periodo Anterior" fill="url(#appt-comp-ant)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            {/* Professional Detail Table */}
            {data.byProfessional.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '300ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-purple-500/10"><Users className="w-4 h-4 text-purple-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Detalhamento</h3>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 overflow-hidden shadow-sm">
                        <div className="p-5 border-b border-border/50">
                            <h4 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-purple-500" /> Agendamentos por Profissional</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Volume de agendamentos por profissional</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/50 bg-muted/30">
                                        <th className="text-left p-3 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Profissional</th>
                                        <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Agendamentos</th>
                                        <th className="text-right p-3 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">% do Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.byProfessional.map((prof) => {
                                        const pct = data.total > 0 ? (prof.count / data.total) * 100 : 0;
                                        return (
                                            <tr key={prof.professional_id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                                <td className="p-3 px-5 font-medium">{prof.professional_name}</td>
                                                <td className="p-3 text-right">
                                                    <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-full bg-primary/10 text-primary font-semibold text-sm">{prof.count}</span>
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
