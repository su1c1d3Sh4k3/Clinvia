import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
    Wallet,
    TrendingUp,
    Package,
    Calendar,
} from "lucide-react";
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

    const isLoading = loadingSummary || loadingAnnual || loadingTop || loadingProjection;

    const monthlyRevenue = (summary?.monthly_revenue || 0) + (summary?.monthly_pending || 0);

    const cards = [
        {
            title: "Faturamento Anual",
            value: annualRevenue || 0,
            icon: Wallet,
            color: "text-primary",
            bgColor: "bg-primary/10",
            borderColor: "border-primary/30",
            description: `Janeiro a Dezembro ${year}`,
            highlighted: true,
        },
        {
            title: "Faturamento Mensal",
            value: monthlyRevenue,
            icon: TrendingUp,
            color: "text-green-500",
            bgColor: "bg-green-500/10",
            borderColor: "border-green-500/20",
            description: `${summary?.total_sales_count || 0} vendas`,
        },
        {
            title: "Mais Vendido",
            value: topProduct ? topProduct.total_revenue : 0,
            icon: Package,
            color: "text-blue-500",
            bgColor: "bg-blue-500/10",
            borderColor: "border-blue-500/20",
            description: topProduct?.name || "Nenhum produto",
            badge: topProduct ? SaleCategoryLabels[topProduct.type as keyof typeof SaleCategoryLabels] : undefined,
        },
        {
            title: "Projeção",
            value: projection?.projected_revenue || 0,
            icon: Calendar,
            color: "text-orange-500",
            bgColor: "bg-orange-500/10",
            borderColor: "border-orange-500/20",
            description: `${projection?.pending_installments || 0} parcelas pendentes`,
        },
    ];

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
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
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
            {cards.map((card, index) => (
                <Card
                    key={index}
                    className={`${card.borderColor} border-2 ${card.highlighted
                        ? 'bg-gradient-to-br from-primary/5 via-transparent to-transparent shadow-lg'
                        : ''
                        }`}
                >
                    <CardContent className="p-3 md:p-6">
                        <div className="flex flex-col gap-2 md:gap-3">
                            <div className="flex items-center justify-between">
                                <div className={`p-2 md:p-3 rounded-full ${card.bgColor}`}>
                                    <card.icon className={`w-4 h-4 md:w-6 md:h-6 ${card.color}`} />
                                </div>
                                {card.badge && (
                                    <Badge variant="outline" className="text-[10px] md:text-xs">
                                        {card.badge}
                                    </Badge>
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] md:text-sm text-muted-foreground font-medium uppercase tracking-wide">
                                    {card.title}
                                </p>
                                <p className={`text-sm sm:text-lg md:text-2xl font-bold mt-1 ${card.color}`}>
                                    {formatCurrency(card.value)}
                                </p>
                                <p className="text-[10px] md:text-xs text-muted-foreground mt-1 hidden sm:block truncate">
                                    {card.description}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
