import { ReportCard } from "./ReportCard";
import { SalesMetrics, calcEvolution } from "@/hooks/useReportData";
import { ShoppingCart, DollarSign, AlertTriangle, Package } from "lucide-react";
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface SalesReportProps {
    data: SalesMetrics;
    comparison?: SalesMetrics | null;
}

const COLORS = { cash: "#10b981", installment: "#3b82f6", overdue: "#ef4444" };

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

export function SalesReport({ data, comparison }: SalesReportProps) {
    const paymentPie = [
        { name: "A Vista", value: data.cashRevenue, color: COLORS.cash },
        { name: "Parcelado", value: data.installmentRevenue, color: COLORS.installment },
    ].filter(d => d.value > 0);

    const topProductsChart = data.topProducts.slice(0, 6).map(p => ({
        name: p.name.length > 18 ? p.name.slice(0, 16) + "..." : p.name,
        fullName: p.name,
        Receita: p.revenue,
        Quantidade: p.quantity,
    }));

    const comparisonData = comparison ? [
        { name: "Vendas", atual: data.totalCount, anterior: comparison.totalCount },
        { name: "Receita", atual: data.totalRevenue, anterior: comparison.totalRevenue },
        { name: "Ticket Médio", atual: data.averageTicket, anterior: comparison.averageTicket },
        { name: "Inadimplência", atual: data.overdueAmount, anterior: comparison.overdueAmount },
    ] : [];

    return (
        <div className="space-y-8">
            {/* KPIs */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-primary/10"><ShoppingCart className="w-4 h-4 text-primary" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Resumo de Vendas</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ReportCard label="Total de Vendas" value={data.totalCount} icon={<ShoppingCart className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalCount, comparison.totalCount) : undefined} featured />
                    <ReportCard label="Receita Total" value={data.totalRevenue} prefix="R$" icon={<DollarSign className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.totalRevenue, comparison.totalRevenue) : undefined} />
                    <ReportCard label="Ticket Médio" value={data.averageTicket} prefix="R$" evolution={comparison ? calcEvolution(data.averageTicket, comparison.averageTicket) : undefined} />
                    <ReportCard label="Inadimplência" value={data.overdueAmount} prefix="R$" icon={<AlertTriangle className="w-4 h-4" />} evolution={comparison ? calcEvolution(data.overdueAmount, comparison.overdueAmount) : undefined} className={data.overdueAmount > 0 ? "border-red-500/20 hover:border-red-500/40" : ""} />
                </div>
            </section>

            {/* Charts */}
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms', animationFillMode: 'backwards' }}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10"><DollarSign className="w-4 h-4 text-emerald-500" /></div>
                    <h3 className="text-sm font-semibold tracking-tight">Distribuição</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Payment Pie */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Formas de Pagamento</h4>
                            <p className="text-xs text-muted-foreground mb-4">Distribuição entre à vista e parcelado</p>
                            {paymentPie.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <PieChart>
                                            <defs>
                                                {paymentPie.map((d, i) => (
                                                    <linearGradient key={i} id={`sales-pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                                                        <stop offset="0%" stopColor={d.color} stopOpacity={1} />
                                                        <stop offset="100%" stopColor={d.color} stopOpacity={0.7} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <Pie data={paymentPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}>
                                                {paymentPie.map((_, i) => <Cell key={i} fill={`url(#sales-pie-${i})`} />)}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex justify-center gap-4 mt-3 text-xs">
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="text-muted-foreground">A Vista:</span>
                                            <span className="font-semibold">{data.cashCount}</span>
                                        </div>
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10">
                                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                                            <span className="text-muted-foreground">Parcelado:</span>
                                            <span className="font-semibold">{data.installmentCount}</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                                    <DollarSign className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem dados</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Top Products */}
                    <div className={CARD}>
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        <div className="relative z-10">
                            <h4 className="text-sm font-semibold mb-1">Mais Vendidos</h4>
                            <p className="text-xs text-muted-foreground mb-4">Top produtos e serviços por receita</p>
                            {topProductsChart.length > 0 ? (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={topProductsChart} layout="vertical" margin={{ left: 0, right: 12 }}>
                                        <defs>
                                            <linearGradient id="sales-bar-prod" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                                                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.6} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="rounded-xl border border-border/50 bg-card/95 backdrop-blur-md px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
                                                    <p className="text-xs font-medium text-muted-foreground mb-2">{d.fullName || d.name}</p>
                                                    <p className="text-sm"><span className="text-muted-foreground">Receita:</span> <span className="font-semibold">{fBRL(d.Receita)}</span></p>
                                                    <p className="text-sm"><span className="text-muted-foreground">Qtd:</span> <span className="font-semibold">{d.Quantidade}</span></p>
                                                </div>
                                            );
                                        }} />
                                        <Bar dataKey="Receita" fill="url(#sales-bar-prod)" radius={[0, 6, 6, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
                                    <Package className="w-10 h-10 mb-2 opacity-20" />
                                    <p className="text-sm">Sem dados</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Comparison */}
            {comparison && comparisonData.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-blue-500/10"><ShoppingCart className="w-4 h-4 text-blue-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Comparativo de Períodos</h3>
                    </div>
                    <div className={CARD}>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={comparisonData} margin={{ left: 8, right: 8, top: 8 }}>
                                <defs>
                                    <linearGradient id="sales-comp-atual" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                                    </linearGradient>
                                    <linearGradient id="sales-comp-ant" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#93c5fd" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.4} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.08} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.08 }} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                                <Bar dataKey="atual" name="Período Atual" fill="url(#sales-comp-atual)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="anterior" name="Período Anterior" fill="url(#sales-comp-ant)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            {/* Top Products Table */}
            {data.topProducts.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '300ms', animationFillMode: 'backwards' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-lg bg-purple-500/10"><Package className="w-4 h-4 text-purple-500" /></div>
                        <h3 className="text-sm font-semibold tracking-tight">Detalhamento</h3>
                    </div>
                    <div className="rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 overflow-hidden shadow-sm">
                        <div className="p-5 border-b border-border/50">
                            <h4 className="text-sm font-semibold">Produtos e Serviços Mais Vendidos</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Ranking completo por receita gerada</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border/50 bg-muted/30">
                                        <th className="text-left p-3 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Nome</th>
                                        <th className="text-center p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tipo</th>
                                        <th className="text-right p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Qtd</th>
                                        <th className="text-right p-3 px-5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Receita</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.topProducts.map((p, i) => (
                                        <tr key={p.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="p-3 px-5 font-medium">{p.name}</td>
                                            <td className="p-3 text-center">
                                                <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${p.type === "product" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-purple-500/10 text-purple-600 dark:text-purple-400"}`}>
                                                    {p.type === "product" ? "Produto" : "Serviço"}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right font-semibold">{p.quantity}</td>
                                            <td className="p-3 px-5 text-right font-semibold">{fBRL(p.revenue)}</td>
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
