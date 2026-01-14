import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Trophy, TrendingUp, Package, Briefcase, ShoppingCart } from "lucide-react";

// Componentes de vendas
import { SalesCards } from "@/components/sales/SalesCards";
import { SalesCharts } from "@/components/sales/SalesCharts";
import { SalesByPersonTables } from "@/components/sales/SalesByPersonTables";

// Hooks
import { useTopSellers } from "@/hooks/useSales";

const MONTHS = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

// ========================================
// TOP SELLERS TABLE COMPONENT
// ========================================
function TopSellersTable({ month, year }: { month: number; year: number }) {
    const { data: topSellers = [], isLoading } = useTopSellers(month, year);

    if (isLoading) {
        return <Skeleton className="h-96 w-full" />;
    }

    const maxQuantity = topSellers.length > 0 ? topSellers[0].total_quantity : 1;

    return (
        <Card className="border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent">
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                        <Trophy className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                        <span className="text-xl">Mais Vendidos</span>
                        <CardDescription className="mt-1">
                            Top 10 produtos e serviços por quantidade vendida
                        </CardDescription>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {topSellers.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-lg font-medium">Nenhuma venda encontrada</p>
                        <p className="text-sm mt-1">Registre vendas para ver o ranking</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="w-16 text-center font-bold">#</TableHead>
                                    <TableHead className="font-bold">Categoria</TableHead>
                                    <TableHead className="font-bold">Item</TableHead>
                                    <TableHead className="text-center font-bold">Quantidade</TableHead>
                                    <TableHead className="text-right font-bold">Valor Total</TableHead>
                                    <TableHead className="w-48">Performance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {topSellers.map((item, index) => {
                                    const performancePercent = (item.total_quantity / maxQuantity) * 100;
                                    const isTop3 = index < 3;

                                    return (
                                        <TableRow
                                            key={item.product_id}
                                            className={isTop3 ? "bg-emerald-500/5" : ""}
                                        >
                                            <TableCell className="text-center">
                                                {index === 0 ? (
                                                    <span className="text-2xl">🥇</span>
                                                ) : index === 1 ? (
                                                    <span className="text-2xl">🥈</span>
                                                ) : index === 2 ? (
                                                    <span className="text-2xl">🥉</span>
                                                ) : (
                                                    <span className="text-lg font-bold text-muted-foreground">
                                                        {index + 1}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        item.product_type === 'product'
                                                            ? "border-blue-500/50 text-blue-500"
                                                            : "border-purple-500/50 text-purple-500"
                                                    }
                                                >
                                                    {item.product_type === 'product' ? (
                                                        <><Package className="w-3 h-3 mr-1" /> Produto</>
                                                    ) : (
                                                        <><Briefcase className="w-3 h-3 mr-1" /> Serviço</>
                                                    )}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                {item.product_name}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={`font-bold text-lg ${isTop3 ? "text-emerald-500" : ""}`}>
                                                    {item.total_quantity}
                                                </span>
                                                <span className="text-muted-foreground text-sm ml-1">un.</span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className={`font-semibold ${isTop3 ? "text-emerald-500" : "text-green-500"}`}>
                                                    {formatCurrency(item.total_value)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${isTop3
                                                                    ? "bg-gradient-to-r from-emerald-500 to-green-400"
                                                                    : "bg-gradient-to-r from-blue-500 to-cyan-400"
                                                                }`}
                                                            style={{ width: `${performancePercent}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-muted-foreground w-10">
                                                        {performancePercent.toFixed(0)}%
                                                    </span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ========================================
// MAIN COMPONENT: SALES DASHBOARD
// ========================================
export function SalesDashboard() {
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Filtros de Período */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm font-medium text-muted-foreground">Período:</span>
                </div>
                <div className="flex items-center gap-3">
                    <Select
                        value={String(selectedMonth)}
                        onValueChange={(value) => setSelectedMonth(parseInt(value))}
                    >
                        <SelectTrigger className="w-[140px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MONTHS.map((month) => (
                                <SelectItem key={month.value} value={String(month.value)}>
                                    {month.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select
                        value={String(selectedYear)}
                        onValueChange={(value) => setSelectedYear(parseInt(value))}
                    >
                        <SelectTrigger className="w-[100px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {YEARS.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                    {year}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Cards de Resumo */}
            <SalesCards month={selectedMonth} year={selectedYear} />

            {/* Gráficos */}
            <SalesCharts month={selectedMonth} year={selectedYear} />

            {/* Tabela Mais Vendidos - DESTAQUE */}
            <TopSellersTable month={selectedMonth} year={selectedYear} />

            {/* Faturamento por Pessoa */}
            <SalesByPersonTables month={selectedMonth} year={selectedYear} />
        </div>
    );
}
