import { ReportCard } from "./ReportCard";
import { ContactMetrics, calcEvolution } from "@/hooks/useReportData";
import { UserPlus, Target, TrendingUp } from "lucide-react";

interface ContactsLeadsReportProps {
    data: ContactMetrics;
    comparison?: ContactMetrics | null;
}

export function ContactsLeadsReport({ data, comparison }: ContactsLeadsReportProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ReportCard
                    label="Novos Contatos"
                    value={data.totalNew}
                    icon={<UserPlus className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalNew, comparison.totalNew) : undefined}
                />
                <ReportCard
                    label="Contatos → Leads"
                    value={data.totalLeads}
                    icon={<Target className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.totalLeads, comparison.totalLeads) : undefined}
                />
                <ReportCard
                    label="Taxa de Conversão"
                    value={data.conversionRate}
                    suffix="%"
                    icon={<TrendingUp className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.conversionRate, comparison.conversionRate) : undefined}
                />
            </div>
        </div>
    );
}
