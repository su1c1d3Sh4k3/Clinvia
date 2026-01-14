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
        <Card>
            <Tabs defaultValue="annual" className="w-full">
                <div className="p-6 pb-0">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="annual" className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Faturamento Anual
                        </TabsTrigger>
                        <TabsTrigger value="monthly" className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            Faturamento Mensal
                        </TabsTrigger>
                    </TabsList>
                </div>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        Análise de Vendas
                    </CardTitle>
                    <CardDescription>
                        Acompanhamento de faturamento
                    </CardDescription>
                </CardHeader>
                <CardContent>
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
        </Card>
    );
}
