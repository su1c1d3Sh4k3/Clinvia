import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, BarChart3 } from "lucide-react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { useAnnualSales, useMonthlySales } from "@/hooks/useSales";

interface SalesChartsProps {
    month: number;
    year: number;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

export function SalesCharts({ month, year }: SalesChartsProps) {
    const { data: annualData, isLoading: loadingAnnual } = useAnnualSales(year);
    const { data: monthlyData, isLoading: loadingMonthly } = useMonthlySales(month, year);

    const isLoading = loadingAnnual || loadingMonthly;

    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return (
        <Card className="relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl border-border/50 shadow-sm hover:shadow-md hover:border-border/80 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-background/5 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
            <div className="relative z-10">
                <Tabs defaultValue="annual" className="w-full">
                    <div className="p-4 md:p-6 pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <BarChart3 className="w-5 h-5 text-blue-500" />
                                Análise de Vendas
                            </CardTitle>
                            <CardDescription className="mt-1">
                                Acompanhamento de faturamento acumulado
                            </CardDescription>
                        </div>
                        <TabsList className="grid w-full sm:w-auto grid-cols-2 rounded-xl h-10">
                            <TabsTrigger value="annual" className="flex items-center gap-2 rounded-lg text-xs sm:text-sm">
                                <TrendingUp className="h-4 w-4" />
                                <span className="hidden sm:inline">Fat. Anual</span>
                                <span className="sm:hidden">Anual</span>
                            </TabsTrigger>
                            <TabsTrigger value="monthly" className="flex items-center gap-2 rounded-lg text-xs sm:text-sm">
                                <BarChart3 className="h-4 w-4" />
                                <span className="hidden sm:inline">Fat. Mensal</span>
                                <span className="sm:hidden">Mensal</span>
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <CardContent className="pt-6">
                        {isLoading ? (
                            <Skeleton className="h-[350px] w-full" />
                        ) : (
                            <>
                                {/* Gráfico Anual */}
                                <TabsContent value="annual" className="mt-0">
                                    <ResponsiveContainer width="100%" height={350}>
                                        <LineChart data={annualData || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                                            <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                                            <YAxis
                                                stroke="hsl(var(--muted-foreground))"
                                                tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'hsl(var(--card))',
                                                    border: '1px solid hsl(var(--border))',
                                                    borderRadius: '8px',
                                                }}
                                                formatter={(value: number) => formatCurrency(value)}
                                                labelFormatter={(label) => `Mês: ${label}`}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="revenue"
                                                name="Faturamento"
                                                stroke="#22c55e"
                                                strokeWidth={3}
                                                dot={{ fill: '#22c55e', strokeWidth: 2, r: 4 }}
                                                activeDot={{ r: 6 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </TabsContent>

                                {/* Gráfico Mensal */}
                                <TabsContent value="monthly" className="mt-0">
                                    <ResponsiveContainer width="100%" height={350}>
                                        <LineChart data={monthlyData || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                                            <XAxis
                                                dataKey="day"
                                                stroke="hsl(var(--muted-foreground))"
                                                tickFormatter={(day) => `${day}`}
                                            />
                                            <YAxis
                                                stroke="hsl(var(--muted-foreground))"
                                                tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'hsl(var(--card))',
                                                    border: '1px solid hsl(var(--border))',
                                                    borderRadius: '8px',
                                                }}
                                                formatter={(value: number) => formatCurrency(value)}
                                                labelFormatter={(day) => `Dia ${day}/${month}`}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="revenue"
                                                name="Faturamento"
                                                stroke="#3b82f6"
                                                strokeWidth={2}
                                                dot={{ fill: '#3b82f6', r: 3 }}
                                                activeDot={{ r: 5 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </TabsContent>
                            </>
                        )}
                    </CardContent>
                </Tabs>
            </div>
        </Card>
    );
}
