import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
    Wallet,
    TrendingUp,
    Package,
    Calendar,
    CalendarCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSalesSummary, useAnnualRevenue, useTopProductService, useSalesProjection } from "@/hooks/useSales";
import { SaleCategoryLabels } from "@/types/sales";

interface SalesCardsProps {
    month: number;
    year: number;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

export function SalesCards({ month, year }: SalesCardsProps) {
    const { data: summary, isLoading: loadingSummary } = useSalesSummary(month, year);
    const { data: annualRevenue, isLoading: loadingAnnual } = useAnnualRevenue(year);
    const { data: topProduct, isLoading: loadingTop } = useTopProductService(month, year);
    const { data: projection, isLoading: loadingProjection } = useSalesProjection(year);

    // % de vendas do período com agendamento concluído
    const { data: schedStats, isLoading: loadingSched } = useQuery({
        queryKey: ["sales-scheduling-pct", month, year],
        queryFn: async () => {
            const mm = String(month).padStart(2, "0");
            const lastDay = new Date(year, month, 0).getDate();
            const { data, error } = await supabase
                .from("sales" as any)
                .select("id, appointment:appointments!sales_appointment_id_fkey(status)")
                .gte("sale_date", `${year}-${mm}-01`)
                .lte("sale_date", `${year}-${mm}-${String(lastDay).padStart(2, "0")}`);
            if (error) throw error;
            const rows = (data || []) as any[];
            const total = rows.length;
            const completed = rows.filter((s) => s.appointment?.status === "completed").length;
            return { total, completed, pct: total > 0 ? (completed / total) * 100 : 0 };
        },
    });

    const isLoading = loadingSummary || loadingAnnual || loadingTop || loadingProjection || loadingSched;

    const monthlyRevenue = (summary?.monthly_revenue || 0) + (summary?.monthly_pending || 0);

    const cards = [
        {
            title: "Faturamento Anual",
            value: annualRevenue || 0,
            icon: Wallet,
            color: "text-primary",
            bgColor: "bg-primary/10",
            glowColor: "from-primary/10",
            description: `Janeiro a Dezembro ${year}`,
            highlighted: true,
        },
        {
            title: "Faturamento Mensal",
            value: monthlyRevenue,
            icon: TrendingUp,
            color: "text-green-500",
            bgColor: "bg-green-500/10",
            glowColor: "from-green-500/10",
            description: `${summary?.total_sales_count || 0} vendas`,
        },
        {
            title: "Mais Vendido",
            value: topProduct ? topProduct.total_revenue : 0,
            icon: Package,
            color: "text-blue-500",
            bgColor: "bg-blue-500/10",
            glowColor: "from-blue-500/10",
            description: topProduct?.name || "Nenhum produto",
            badge: topProduct ? SaleCategoryLabels[topProduct.type as keyof typeof SaleCategoryLabels] : undefined,
        },
        {
            title: "Projeção",
            value: projection?.projected_revenue || 0,
            icon: Calendar,
            color: "text-orange-500",
            bgColor: "bg-orange-500/10",
            glowColor: "from-orange-500/10",
            description: `${projection?.pending_installments || 0} parcelas pendentes`,
        },
        {
            title: "% Agendamentos",
            value: 0,
            displayValue: `${(schedStats?.pct || 0).toFixed(0)}%`,
            icon: CalendarCheck,
            color: "text-purple-500",
            bgColor: "bg-purple-500/10",
            glowColor: "from-purple-500/10",
            description: `${schedStats?.completed || 0} de ${schedStats?.total || 0} vendas com agendamento concluído`,
        },
    ] as Array<{
        title: string;
        value: number;
        displayValue?: string;
        icon: any;
        color: string;
        bgColor: string;
        glowColor: string;
        description: string;
        highlighted?: boolean;
        badge?: string;
    }>;

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i}>
                        <CardContent className="p-6">
                            <Skeleton className="h-20 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-6">
            {cards.map((card, index) => (
                <Card
                    key={index}
                    className={`relative group overflow-hidden rounded-2xl bg-white dark:bg-card border border-border/50 shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-300 ${card.highlighted ? 'border-primary/50' : ''}`}
                >
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.glowColor} via-transparent to-background/5 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl`} />
                    <div className="relative z-10">
                        <CardContent className="p-4 md:p-6">
                            <div className="flex flex-col gap-2 md:gap-3">
                                <div className="flex items-center justify-between">
                                    <div className={`p-2 md:p-3 rounded-xl ${card.bgColor} backdrop-blur-sm`}>
                                        <card.icon className={`w-4 h-4 md:w-5 md:h-5 ${card.color}`} />
                                    </div>
                                    {card.badge && (
                                        <Badge variant="outline" className="text-[10px] md:text-xs bg-background/50">
                                            {card.badge}
                                        </Badge>
                                    )}
                                </div>
                                <div className="mt-1">
                                    <p className="text-[11px] md:text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                        {card.title}
                                    </p>
                                    <p className={`text-lg sm:text-xl md:text-2xl font-bold mt-1 ${card.color} tracking-tight`}>
                                        {card.displayValue ?? formatCurrency(card.value)}
                                    </p>
                                    <p className="text-[10px] md:text-xs text-muted-foreground mt-1.5 hidden sm:block truncate opacity-80">
                                        {card.description}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </div>
                </Card>
            ))}
        </div>
    );
}
