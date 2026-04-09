import { ReportCard } from "./ReportCard";
import { CrmMetrics, SalesMetrics, ContactMetrics, calcEvolution } from "@/hooks/useReportData";
import { Briefcase, DollarSign, TrendingUp } from "lucide-react";

interface CrmReportProps {
    data: CrmMetrics;
    sales: SalesMetrics;
    contacts: ContactMetrics;
    comparison?: CrmMetrics | null;
    comparisonSales?: SalesMetrics | null;
}

function formatBRL(value: number): string {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CrmReport({ data, sales, contacts, comparison, comparisonSales }: CrmReportProps) {
    const leadsToSalesRate = contacts.totalLeads > 0
        ? Math.round((sales.totalCount / contacts.totalLeads) * 100 * 10) / 10
        : 0;
    const compLeadsToSalesRate = comparisonSales && comparison
        ? (comparison.totalDeals > 0 ? Math.round((comparisonSales.totalCount / comparison.totalDeals) * 100 * 10) / 10 : 0)
        : undefined;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ReportCard
                    label="Total de Negociações"
                    value={data.totalDeals}
                    icon={<Briefcase className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalDeals, comparison.totalDeals) : undefined}
                />
                <ReportCard
                    label="Valor Total"
                    value={data.totalValue}
                    prefix="R$"
                    icon={<DollarSign className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalValue, comparison.totalValue) : undefined}
                />
                <ReportCard
                    label="Taxa Leads → Vendas"
                    value={leadsToSalesRate}
                    suffix="%"
                    icon={<TrendingUp className="w-4 h-4" />}
                    evolution={compLeadsToSalesRate !== undefined ? calcEvolution(leadsToSalesRate, compLeadsToSalesRate) : undefined}
                />
            </div>

            {/* Funnel breakdown */}
            {data.byFunnel.map((funnel) => (
                <div key={funnel.funnel_id} className="rounded-xl border bg-card">
                    <div className="p-4 border-b">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Briefcase className="w-4 h-4" />
                            {funnel.funnel_name}
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="text-left p-3 font-medium">Etapa</th>
                                    <th className="text-right p-3 font-medium">Negociações</th>
                                    <th className="text-right p-3 font-medium">Valor Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {funnel.stages.map((stage) => (
                                    <tr key={stage.stage_id} className="border-b last:border-0 hover:bg-muted/50">
                                        <td className="p-3">{stage.stage_name}</td>
                                        <td className="p-3 text-right font-medium">{stage.count}</td>
                                        <td className="p-3 text-right font-medium">R$ {formatBRL(stage.value)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-muted/30 font-semibold">
                                    <td className="p-3">Total</td>
                                    <td className="p-3 text-right">{funnel.stages.reduce((s, st) => s + st.count, 0)}</td>
                                    <td className="p-3 text-right">R$ {formatBRL(funnel.stages.reduce((s, st) => s + st.value, 0))}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            {data.byFunnel.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                    <Briefcase className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Nenhuma negociação encontrada no período</p>
                </div>
            )}
        </div>
    );
}
