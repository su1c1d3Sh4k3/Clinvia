import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BarChart3, LineChart as LineIcon } from "lucide-react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { useOrcamentoMonthly } from "@/hooks/useFinanceiro";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const SERIES = [
    { key: "realizados", name: "Realizados", color: "#3b82f6" },
    { key: "fechados", name: "Fechados", color: "#10b981" },
    { key: "perdidos", name: "Perdidos", color: "#f43f5e" },
    { key: "pendentes", name: "Pendentes", color: "#f59e0b" },
];

function label(mes: string) {
    const [y, m] = mes.split("-");
    return `${MESES[Number(m) - 1]}/${y.slice(2)}`;
}

export function OrcamentoChart() {
    const [mode, setMode] = useState<"linha" | "barra">("linha");
    const { data = [], isLoading } = useOrcamentoMonthly();

    const chartData = data.map((d) => ({
        label: label(d.mes),
        realizados: Number(d.realizados),
        fechados: Number(d.fechados),
        perdidos: Number(d.perdidos),
        pendentes: Number(d.pendentes),
    }));

    return (
        <Card className="relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl border-border/50 shadow-sm transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-background/5 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
            <div className="relative z-10">
                <CardHeader className="pb-3 flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                        <CardTitle className="text-lg">Orçamentos nos últimos 12 meses</CardTitle>
                        <CardDescription className="text-xs">
                            Quantidade de itens orçados por desfecho (um orçamento com 3 itens conta 3).
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border p-0.5 shrink-0">
                        <Button
                            type="button"
                            size="sm"
                            variant={mode === "linha" ? "secondary" : "ghost"}
                            className="h-7 px-2"
                            onClick={() => setMode("linha")}
                            title="Ver em linhas"
                        >
                            <LineIcon className="w-4 h-4" />
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={mode === "barra" ? "secondary" : "ghost"}
                            className="h-7 px-2"
                            onClick={() => setMode("barra")}
                            title="Ver em barras"
                        >
                            <BarChart3 className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-72 w-full" />
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            {mode === "linha" ? (
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{
                                            background: "hsl(var(--background))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: 8,
                                            fontSize: 12,
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    {SERIES.map((s) => (
                                        <Line
                                            key={s.key}
                                            type="monotone"
                                            dataKey={s.key}
                                            name={s.name}
                                            stroke={s.color}
                                            strokeWidth={2}
                                            dot={{ r: 2 }}
                                        />
                                    ))}
                                </LineChart>
                            ) : (
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                                        contentStyle={{
                                            background: "hsl(var(--background))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: 8,
                                            fontSize: 12,
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    {SERIES.map((s) => (
                                        <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} />
                                    ))}
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </div>
        </Card>
    );
}
