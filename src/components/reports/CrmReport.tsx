import { ReportCard } from "./ReportCard";
import { CrmMetrics, SalesMetrics, ContactMetrics, calcEvolution } from "@/hooks/useReportData";
import { Briefcase, DollarSign, TrendingUp } from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, Cell,
} from "recharts";

interface CrmReportProps {
    data: CrmMetrics;
    sales: SalesMetrics;
    contacts: ContactMetrics;
    comparison?: CrmMetrics | null;
    comparisonSales?: SalesMetrics | null;
}

const STAGE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#14b8a6", "#ec4899", "#6366f1"];

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
                        <span className="font-semibold">{typeof e.value === "number" && e.value >= 100 ? fBRL(e.value) : e.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export function CrmReport({ data, sales, contacts, comparison, comparisonSales }: CrmReportProps) {
    const leadsToSalesRate = contacts.totalLeads > 0
        ? Math.round((sales.totalCount / contacts.totalLeads) * 100 * 10) / 10
        : 0;
    const compLeadsToSalesRate = comparisonSales && comparison
        ? (comparison.totalDeals > 0 ? Math.round((comparisonSales.totalCount / comparison.totalDeals) * 100 * 10) / 10 : 0)
        : undefined;

    const comparisonData = comparison ? [
        { name: "Negociacoes", atual: data.totalDeals, anterior: comparison.totalDeals },
        { name: "Valor (R$)", atual: data.totalValue, anterior: comparison.totalValue },
    ] : [];

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10"><Briefcase className="w-4 h-4 text-primary" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Resumo do CRM</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ReportCard label="Total de Negociacoes" value={data.totalDeals} icon={<Briefcase className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalDeals, comparison.totalDeals) : undefined} featured />
                    <ReportCard label="Valor Total" value={data.totalValue} prefix="R$" icon={<DollarSign className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalValue, comparison.totalValue) : undefined} />
                    <ReportCard label="Taxa Leads para Vendas" value={leadsToSalesRate} suffix="%" icon={<TrendingUp className="w-4 h-4" />} evolution={compLeadsToSalesRate !== undefined ? calcEvolution(leadsToSalesRate, compLeadsToSalesRate) : undefined} />
                </div>
            </section>

            {/* Funnel Charts */}
            {data.byFunnel.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-purple-500/10"><Briefcase className="w-4 h-4 text-purple-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Funis de Vendas</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-6">
                        {data.byFunnel.map((funnel, funnelIdx) => {
                            const stageChart = funnel.stages.map((s, i) => ({
                                name: s.stage_name.length > 16 ? s.stage_name.slice(0, 14) + "..." : s.stage_name,
                                fullName: s.stage_name,
                                Negociacoes: s.count,
                                Valor: s.value,
                                color: STAGE_COLORS[i % STAGE_COLORS.length],
                            }));
                            const totalDeals = funnel.stages.reduce((s, st) => s + st.count, 0);
                            const totalValue = funnel.stages.reduce((s, st) => s + st.value, 0);

                            return (
                                <div key={funnel.funnel_id} className="rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                                    <div className="p-5 border-b border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-primary/10"><Briefcase className="w-3.5 h-3.5 text-primary" /></div>
                                                {funnel.funnel_name}
                                            </h4>
                                            <div className="flex items-center gap-3 text-xs">
                                                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold">{totalDeals} negociacoes</span>
                                                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">{fBRL(totalValue)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        {stageChart.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {/* Stage Bar Chart */}
                                                <div>
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <BarChart data={stageChart} margin={{ left: 0, right: 8 }}>
                                                            <defs>
                                                                {stageChart.map((d, i) => (
                                                                    <linearGradient key={i} id={`crm-stage-${funnelIdx}-${i}`} x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                                                                        <stop offset="100%" stopColor={d.color} stopOpacity={0.6} />
                                                                    </linearGradient>
                                                                ))}
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-15} textAnchor="end" height={45} axisLine={false} tickLine={false} />
                                                            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} axisLine={false} tickLine={false} />
                                                            <Tooltip content={({ active, payload }) => {
                                                                if (!active || !payload?.length) return null;
                                                                const d = payload[0].payload;
                                                                return (
                                                                    <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                                                                        <p className="text-xs font-medium text-muted-foreground mb-2">{d.fullName}</p>
                                                                        <p className="text-sm"><span className="text-muted-foreground">Negociacoes:</span> <span className="font-semibold">{d.Negociacoes}</span></p>
                                                                        <p className="text-sm"><span className="text-muted-foreground">Valor:</span> <span className="font-semibold">{fBRL(d.Valor)}</span></p>
                                                                    </div>
                                                                );
                                                            }} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                                            <Bar dataKey="Negociacoes" radius={[6, 6, 0, 0]}>
                                                                {stageChart.map((_, i) => <Cell key={i} fill={`url(#crm-stage-${funnelIdx}-${i})`} />)}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                {/* Stage Table */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="border-b border-border/50 bg-muted/20">
                                                                <th className="text-left p-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Etapa</th>
                                                                <th className="text-right p-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Qtd</th>
                                                                <th className="text-right p-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Valor</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {funnel.stages.map((stage, i) => (
                                                                <tr key={stage.stage_id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                                                    <td className="p-2.5 flex items-center gap-2">
                                                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STAGE_COLORS[i % STAGE_COLORS.length] }} />
                                                                        <span className="font-medium">{stage.stage_name}</span>
                                                                    </td>
                                                                    <td className="p-2.5 text-right">
                                                                        <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-muted/50 font-semibold text-xs">{stage.count}</span>
                                                                    </td>
                                                                    <td className="p-2.5 text-right font-semibold">{fBRL(stage.value)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Comparison */}
            {comparison && comparisonData.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-blue-500/10"><TrendingUp className="w-4 h-4 text-blue-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Comparativo de Periodos</h3>
                    </div>
                    <div className={CARD}>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8, top: 8 }}>
                                <defs>
                                    <linearGradient id="crm-comp-atual" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="crm-comp-ant" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#93c5fd" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                <Bar dataKey="atual" name="Periodo Atual" fill="url(#crm-comp-atual)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="anterior" name="Periodo Anterior" fill="url(#crm-comp-ant)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            {data.byFunnel.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-in fade-in duration-500">
                    <div className="p-4 rounded-2xl bg-muted/30 mb-4">
                        <Briefcase className="w-12 h-12 opacity-30" />
                    </div>
                    <p className="text-sm font-medium">Nenhuma negociacao encontrada no periodo</p>
                    <p className="text-xs mt-1">Tente ajustar o periodo ou os filtros selecionados</p>
                </div>
            )}
        </div>
    );
}
