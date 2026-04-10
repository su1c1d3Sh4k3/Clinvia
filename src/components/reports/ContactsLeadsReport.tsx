import { ReportCard } from "./ReportCard";
import { ContactMetrics, calcEvolution } from "@/hooks/useReportData";
import { UserPlus, Target, TrendingUp } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, Cell,
} from "recharts";

interface ContactsLeadsReportProps {
    data: ContactMetrics;
    comparison?: ContactMetrics | null;
}

const FUNNEL_COLORS = ["#3b82f6", "#8b5cf6"];

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

export function ContactsLeadsReport({ data, comparison }: ContactsLeadsReportProps) {
    const barData = [
        { name: "Contatos", Quantidade: data.totalNew },
        { name: "Leads", Quantidade: data.totalLeads },
    ];

    const comparisonData = comparison ? [
        { name: "Novos Contatos", atual: data.totalNew, anterior: comparison.totalNew },
        { name: "Leads", atual: data.totalLeads, anterior: comparison.totalLeads },
        { name: "Conversão %", atual: data.conversionRate, anterior: comparison.conversionRate },
    ] : [];

    const convColor = data.conversionRate >= 50 ? "#10b981" : data.conversionRate >= 25 ? "#f59e0b" : "#ef4444";

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10"><UserPlus className="w-4 h-4 text-primary" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Resumo de Contatos & Leads</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ReportCard label="Novos Contatos" value={data.totalNew} icon={<UserPlus className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalNew, comparison.totalNew) : undefined} featured />
                    <ReportCard label="Contatos para Leads" value={data.totalLeads} icon={<Target className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalLeads, comparison.totalLeads) : undefined} />
                    <ReportCard label="Taxa de Conversão" value={data.conversionRate} suffix="%" icon={<TrendingUp className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.conversionRate, comparison.conversionRate) : undefined} className={data.conversionRate >= 30 ? "border-emerald-500/20 hover:border-emerald-500/40" : ""} />
                </div>
            </section>

            {/* Funnel Visualization */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-purple-500/10"><Target className="w-4 h-4 text-purple-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Funil de Conversão</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Bar Chart */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Contatos vs Leads</h4>
                            <p className="text-xs text-muted-foreground mb-4">Volume captado e convertido no período</p>
                            {data.totalNew > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={barData} margin={{ left: 0, right: 8 }}>
                                        <defs>
                                            <linearGradient id="cl-bar-0" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={FUNNEL_COLORS[0]} stopOpacity={1} />
                                                <stop offset="100%" stopColor={FUNNEL_COLORS[0]} stopOpacity={0.6} />
                                            </linearGradient>
                                            <linearGradient id="cl-bar-1" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={FUNNEL_COLORS[1]} stopOpacity={1} />
                                                <stop offset="100%" stopColor={FUNNEL_COLORS[1]} stopOpacity={0.6} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                        <Bar dataKey="Quantidade" radius={[6, 6, 0, 0]}>
                                            <Cell fill="url(#cl-bar-0)" />
                                            <Cell fill="url(#cl-bar-1)" />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                                    <UserPlus className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem contatos no período</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Conversion Gauge */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10 flex flex-col items-center justify-center h-full">
                            <h4 className="text-sm font-semibold mb-1">Taxa de Conversão</h4>
                            <p className="text-xs text-muted-foreground mb-6">Percentual de contatos convertidos em leads</p>
                            <div className="relative w-40 h-40">
                                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="8" />
                                    <circle cx="50" cy="50" r="42" fill="none" stroke={convColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${data.conversionRate * 2.64} 264`} className="transition-all duration-1000 ease-out" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-4xl font-black tracking-tight">{data.conversionRate}%</span>
                                    <span className="text-xs text-muted-foreground font-medium mt-1">conversão</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-6 text-xs text-muted-foreground">
                                <span className="px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold">{data.totalLeads} leads</span>
                                <span>de</span>
                                <span className="font-semibold">{data.totalNew} contatos</span>
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
                        <h3 className="text-sm font-semibold tracking-tight">Comparativo de Períodos</h3>
                    </div>
                    <div className={CARD}>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8, top: 8 }}>
                                <defs>
                                    <linearGradient id="cl-comp-atual" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="cl-comp-ant" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#93c5fd" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                <Bar dataKey="atual" name="Período Atual" fill="url(#cl-comp-atual)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="anterior" name="Período Anterior" fill="url(#cl-comp-ant)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}
        </div>
    );
}
