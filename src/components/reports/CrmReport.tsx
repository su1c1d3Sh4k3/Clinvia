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

const STAGE_COLORS = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#ec4899", "#6366f1"];
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
                    <span className="font-medium">{e.name}:</span> {typeof e.value === "number" && e.value >= 100 ? fBRL(e.value) : e.value}
                </p>
            ))}
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
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo do CRM</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ReportCard label="Total de Negociacoes" value={data.totalDeals} icon={<Briefcase className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalDeals, comparison.totalDeals) : undefined} />
                    <ReportCard label="Valor Total" value={data.totalValue} prefix="R$" icon={<DollarSign className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalValue, comparison.totalValue) : undefined} />
                    <ReportCard label="Taxa Leads para Vendas" value={leadsToSalesRate} suffix="%" icon={<TrendingUp className="w-4 h-4" />} evolution={compLeadsToSalesRate !== undefined ? calcEvolution(leadsToSalesRate, compLeadsToSalesRate) : undefined} />
                </div>
            </section>

            {/* Funnel Charts */}
            {data.byFunnel.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Funis de Vendas</h3>
                    <div className="grid grid-cols-1 gap-6">
                        {data.byFunnel.map((funnel) => {
                            const stageChart = funnel.stages.map((s, i) => ({
                                name: s.stage_name.length > 16 ? s.stage_name.slice(0, 14) + "..." : s.stage_name,
                                fullName: s.stage_name,
                                Negociacoes: s.count,
                                Valor: s.value,
                                color: STAGE_COLORS[i % STAGE_COLORS.length],
                            }));

                            return (
                                <div key={funnel.funnel_id} className="rounded-xl border bg-card">
                                    <div className="p-4 border-b">
                                        <h4 className="text-sm font-semibold flex items-center gap-2">
                                            <Briefcase className="w-4 h-4" />
                                            {funnel.funnel_name}
                                            <span className="text-xs text-muted-foreground font-normal ml-auto">
                                                {funnel.stages.reduce((s, st) => s + st.count, 0)} negociacoes | {fBRL(funnel.stages.reduce((s, st) => s + st.value, 0))}
                                            </span>
                                        </h4>
                                    </div>
                                    <div className="p-4">
                                        {stageChart.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Stage Bar Chart */}
                                                <ResponsiveContainer width="100%" height={200}>
                                                    <BarChart data={stageChart} margin={{ left: 0, right: 8 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                                                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: CHART_TEXT }} interval={0} angle={-15} textAnchor="end" height={45} />
                                                        <YAxis tick={{ fontSize: 11, fill: CHART_TEXT }} allowDecimals={false} />
                                                        <Tooltip content={({ active, payload }) => {
                                                            if (!active || !payload?.length) return null;
                                                            const d = payload[0].payload;
                                                            return (
                                                                <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-popover-foreground">
                                                                    <p className="text-xs font-medium text-muted-foreground mb-1">{d.fullName}</p>
                                                                    <p className="text-sm"><span className="font-medium">Negociacoes:</span> {d.Negociacoes}</p>
                                                                    <p className="text-sm"><span className="font-medium">Valor:</span> {fBRL(d.Valor)}</p>
                                                                </div>
                                                            );
                                                        }} />
                                                        <Bar dataKey="Negociacoes" radius={[4, 4, 0, 0]}>
                                                            {stageChart.map((d, i) => <Cell key={i} fill={d.color} />)}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                                {/* Stage Table */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="border-b text-muted-foreground">
                                                                <th className="text-left p-2 font-medium">Etapa</th>
                                                                <th className="text-right p-2 font-medium">Qtd</th>
                                                                <th className="text-right p-2 font-medium">Valor</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {funnel.stages.map((stage, i) => (
                                                                <tr key={stage.stage_id} className="border-b last:border-0 hover:bg-muted/50">
                                                                    <td className="p-2 flex items-center gap-2">
                                                                        <div className="w-2 h-2 rounded-full" style={{ background: STAGE_COLORS[i % STAGE_COLORS.length] }} />
                                                                        {stage.stage_name}
                                                                    </td>
                                                                    <td className="p-2 text-right font-medium">{stage.count}</td>
                                                                    <td className="p-2 text-right font-medium">{fBRL(stage.value)}</td>
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
                <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Comparativo de Periodos</h3>
                    <div className="rounded-xl border bg-card p-4">
                        <ResponsiveContainer width="100%" height={260}>
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

            {data.byFunnel.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Nenhuma negociacao encontrada no periodo</p>
                </div>
            )}
        </div>
    );
}
