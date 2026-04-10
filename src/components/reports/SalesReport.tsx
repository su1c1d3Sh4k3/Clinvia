import { ReportCard } from "./ReportCard";
import { SalesMetrics, calcEvolution } from "@/hooks/useReportData";
import { ShoppingCart, DollarSign, AlertTriangle } from "lucide-react";
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface SalesReportProps {
    data: SalesMetrics;
    comparison?: SalesMetrics | null;
}

const COLORS = { cash: "#22c55e", installment: "#3b82f6", overdue: "#ef4444" };
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

export function SalesReport({ data, comparison }: SalesReportProps) {
    const paymentPie = [
        { name: "A Vista", value: data.cashRevenue, color: COLORS.cash },
        { name: "Parcelado", value: data.installmentRevenue, color: COLORS.installment },
    ].filter(d => d.value > 0);

    const topProductsChart = data.topProducts.slice(0, 6).map(p => ({
        name: p.name.length > 18 ? p.name.slice(0, 16) + "..." : p.name,
        Receita: p.revenue,
        Quantidade: p.quantity,
    }));

    const comparisonData = comparison ? [
        { name: "Vendas", atual: data.totalCount, anterior: comparison.totalCount },
        { name: "Receita", atual: data.totalRevenue, anterior: comparison.totalRevenue },
        { name: "Ticket Medio", atual: data.averageTicket, anterior: comparison.averageTicket },
        { name: "Inadimplencia", atual: data.overdueAmount, anterior: comparison.overdueAmount },
    ] : [];

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo de Vendas</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ReportCard label="Total de Vendas" value={data.totalCount} icon={<ShoppingCart className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalCount, comparison.totalCount) : undefined} />
                    <ReportCard label="Receita Total" value={data.totalRevenue} prefix="R$" icon={<DollarSign className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalRevenue, comparison.totalRevenue) : undefined} />
                    <ReportCard label="Ticket Medio" value={data.averageTicket} prefix="R$" evolution={comparison ? calcEvolution(data.averageTicket, comparison.averageTicket) : undefined} />
                    <ReportCard label="Inadimplencia" value={data.overdueAmount} prefix="R$" icon={<AlertTriangle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.overdueAmount, comparison.overdueAmount) : undefined} className={data.overdueAmount > 0 ? "border-red-500/20" : ""} />
                </div>
            </section>

            {/* Charts */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Distribuicao</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Payment Distribution Pie */}
                    <div className="rounded-xl border bg-card p-4">
                        <h4 className="text-sm font-semibold mb-4">Formas de Pagamento</h4>
                        {paymentPie.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie data={paymentPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                        {paymentPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">Sem dados</div>
                        )}
                        <div className="flex justify-center gap-6 mt-2 text-xs">
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.cash }} /> A Vista: {data.cashCount}</div>
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.installment }} /> Parcelado: {data.installmentCount}</div>
                        </div>
                    </div>

                    {/* Top Products Bar */}
                    <div className="rounded-xl border bg-card p-4">
                        <h4 className="text-sm font-semibold mb-4">Mais Vendidos (Receita)</h4>
                        {topProductsChart.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={topProductsChart} layout="vertical" margin={{ left: 0, right: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 11, fill: CHART_TEXT }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: CHART_TEXT }} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="Receita" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">Sem dados</div>
                        )}
                    </div>
                </div>
            </section>

            {/* Comparison Chart */}
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

            {/* Top Products Table */}
            {data.topProducts.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detalhamento</h3>
                    <div className="rounded-xl border bg-card">
                        <div className="p-4 border-b">
                            <h4 className="text-sm font-semibold">Produtos e Servicos Mais Vendidos</h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-muted-foreground">
                                        <th className="text-left p-3 font-medium">Nome</th>
                                        <th className="text-center p-3 font-medium">Tipo</th>
                                        <th className="text-right p-3 font-medium">Qtd</th>
                                        <th className="text-right p-3 font-medium">Receita</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topProducts.map((p) => (
                                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                                            <td className="p-3">{p.name}</td>
                                            <td className="p-3 text-center">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${p.type === "product" ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"}`}>
                                                    {p.type === "product" ? "Produto" : "Servico"}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right font-medium">{p.quantity}</td>
                                            <td className="p-3 text-right font-medium">{fBRL(p.revenue)}</td>
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
