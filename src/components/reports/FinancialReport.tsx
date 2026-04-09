import { ReportCard } from "./ReportCard";
import { FinancialMetrics, calcEvolution } from "@/hooks/useReportData";
import { DollarSign, TrendingDown, TrendingUp, Users } from "lucide-react";

interface FinancialReportProps {
    data: FinancialMetrics;
    comparison?: FinancialMetrics | null;
}

export function FinancialReport({ data, comparison }: FinancialReportProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ReportCard
                    label="Receita Total"
                    value={data.totalRevenue}
                    prefix="R$"
                    icon={<TrendingUp className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalRevenue, comparison.totalRevenue) : undefined}
                />
                <ReportCard
                    label="Despesas Totais"
                    value={data.totalExpenses}
                    prefix="R$"
                    icon={<TrendingDown className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalExpenses, comparison.totalExpenses) : undefined}
                />
                <ReportCard
                    label="Custo da Equipe"
                    value={data.teamCosts}
                    prefix="R$"
                    icon={<Users className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.teamCosts, comparison.teamCosts) : undefined}
                />
                <ReportCard
                    label="Lucro Líquido"
                    value={data.netProfit}
                    prefix="R$"
                    icon={<DollarSign className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.netProfit, comparison.netProfit) : undefined}
                    className={data.netProfit >= 0 ? "border-green-500/20" : "border-red-500/20"}
                />
            </div>
        </div>
    );
}
