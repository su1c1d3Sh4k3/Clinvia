import { ReportCard } from "./ReportCard";
import { SalesMetrics, calcEvolution } from "@/hooks/useReportData";
import { ShoppingCart, DollarSign, CreditCard, Banknote, Package, AlertTriangle } from "lucide-react";

interface SalesReportProps {
    data: SalesMetrics;
    comparison?: SalesMetrics | null;
}

function formatBRL(value: number): string {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SalesReport({ data, comparison }: SalesReportProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ReportCard
                    label="Total de Vendas"
                    value={data.totalCount}
                    icon={<ShoppingCart className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalCount, comparison.totalCount) : undefined}
                />
                <ReportCard
                    label="Receita Total"
                    value={data.totalRevenue}
                    prefix="R$"
                    icon={<DollarSign className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalRevenue, comparison.totalRevenue) : undefined}
                />
                <ReportCard
                    label="Ticket Médio"
                    value={data.averageTicket}
                    prefix="R$"
                    evolution={comparison ? calcEvolution(data.averageTicket, comparison.averageTicket) : undefined}
                />
                <ReportCard
                    label="Inadimplência"
                    value={data.overdueAmount}
                    prefix="R$"
                    icon={<AlertTriangle className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.overdueAmount, comparison.overdueAmount) : undefined}
                />
            </div>

            {/* Payment type breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-4 space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Banknote className="w-4 h-4" />
                        À Vista
                    </h3>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground text-sm">Vendas</span>
                        <span className="font-medium">{data.cashCount}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground text-sm">Receita</span>
                        <span className="font-medium">R$ {formatBRL(data.cashRevenue)}</span>
                    </div>
                    {data.totalCount > 0 && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground text-sm">% das vendas</span>
                            <span className="font-medium">{((data.cashCount / data.totalCount) * 100).toFixed(1)}%</span>
                        </div>
                    )}
                </div>
                <div className="rounded-xl border bg-card p-4 space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Parcelado
                    </h3>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground text-sm">Vendas</span>
                        <span className="font-medium">{data.installmentCount}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground text-sm">Receita</span>
                        <span className="font-medium">R$ {formatBRL(data.installmentRevenue)}</span>
                    </div>
                    {data.totalCount > 0 && (
                        <div className="flex justify-between">
                            <span className="text-muted-foreground text-sm">% das vendas</span>
                            <span className="font-medium">{((data.installmentCount / data.totalCount) * 100).toFixed(1)}%</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Top Products/Services */}
            {data.topProducts.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <div className="p-4 border-b">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Mais Vendidos
                        </h3>
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
                                                {p.type === "product" ? "Produto" : "Serviço"}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right font-medium">{p.quantity}</td>
                                        <td className="p-3 text-right font-medium">R$ {formatBRL(p.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
