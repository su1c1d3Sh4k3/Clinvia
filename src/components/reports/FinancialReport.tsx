import { ReportCard } from "./ReportCard";
import { FinancialMetrics, calcEvolution } from "@/hooks/useReportData";
import { DollarSign, TrendingUp, Clock, AlertTriangle } from "lucide-react";

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
                    icon={<DollarSign className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalRevenue, comparison.totalRevenue) : undefined}
                />
                <ReportCard
                    label="Recebido"
                    value={data.totalReceived}
                    prefix="R$"
                    icon={<TrendingUp className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalReceived, comparison.totalReceived) : undefined}
                    className="border-green-500/20"
                />
                <ReportCard
                    label="A Receber"
                    value={data.totalPending}
                    prefix="R$"
                    icon={<Clock className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalPending, comparison.totalPending) : undefined}
                    className="border-blue-500/20"
                />
                <ReportCard
                    label="Inadimplente"
                    value={data.totalOverdue}
                    prefix="R$"
                    icon={<AlertTriangle className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalOverdue, comparison.totalOverdue) : undefined}
                    className={data.totalOverdue > 0 ? "border-red-500/20" : ""}
                />
            </div>
        </div>
    );
}
