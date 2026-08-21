import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Calendar, TrendingUp } from "lucide-react";
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useMyTokenStats, useMyTokenYears, useMyTokenMonthly, useMyTokenDaily } from "@/hooks/useMyTokenUsage";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
};

const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

// Consumo de Tokens (IA n8n + IA do sistema unificados) — custos sempre em R$
export function TokensSection() {
    const currentYear = new Date().getFullYear().toString();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [dailyDays, setDailyDays] = useState("7");

    const { data: stats } = useMyTokenStats();
    const { data: years } = useMyTokenYears();
    const { data: monthly, isLoading: loadingMonthly } = useMyTokenMonthly(selectedYear);
    const { data: daily, isLoading: loadingDaily } = useMyTokenDaily(parseInt(dailyDays));

    const availableYears = (() => {
        const y = [...(years || [])];
        if (!y.includes(currentYear)) y.unshift(currentYear);
        return y;
    })();

    const monthlyMap = new Map<number, number>();
    (monthly || []).forEach((d) => {
        monthlyMap.set(parseInt(d.year_month.split("-")[1]) - 1, d.total_tokens);
    });
    const monthlyChart = MONTH_NAMES.map((name, i) => ({ month: name, tokens: monthlyMap.get(i) || 0 }));

    const dailyChart = (daily || []).map((d) => ({
        date: new Date(d.usage_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        tokens: d.total_tokens,
    }));

    const cards = [
        {
            label: "Total de Tokens",
            icon: <Coins className="w-4 h-4 text-purple-500" />,
            tokens: stats?.total_tokens || 0,
            cost: stats?.total_cost_brl || 0,
            gradient: "from-purple-500/10 via-purple-500/[0.03] to-transparent",
            iconBg: "bg-purple-500/15",
            bar: "bg-purple-500",
        },
        {
            label: "Consumo Mensal",
            icon: <Calendar className="w-4 h-4 text-blue-500" />,
            tokens: stats?.month_tokens || 0,
            cost: stats?.month_cost_brl || 0,
            gradient: "from-blue-500/10 via-blue-500/[0.03] to-transparent",
            iconBg: "bg-blue-500/15",
            bar: "bg-blue-500",
        },
        {
            label: "Consumo Diário",
            icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
            tokens: stats?.today_tokens || 0,
            cost: stats?.today_cost_brl || 0,
            gradient: "from-emerald-500/10 via-emerald-500/[0.03] to-transparent",
            iconBg: "bg-emerald-500/15",
            bar: "bg-emerald-500",
        },
    ];

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Coins className="w-4 h-4 text-purple-500" />
                    Consumo de Tokens da IA
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {cards.map((c) => (
                        <div
                            key={c.label}
                            className={`relative overflow-hidden p-4 rounded-xl border border-border/40 bg-gradient-to-br ${c.gradient} transition-shadow hover:shadow-md`}
                        >
                            <div className={`absolute left-0 top-0 h-full w-1 ${c.bar}`} />
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
                                <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>
                                    {c.icon}
                                </div>
                            </div>
                            <p className="text-2xl font-bold tracking-tight tabular-nums">{brl(c.cost)}</p>
                            <p className="text-xs text-muted-foreground mt-1.5">
                                <span className="font-semibold text-foreground/80 tabular-nums">{formatNumber(c.tokens)}</span> tokens
                            </p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Consumo Mensal */}
                    <div className="rounded-lg border border-border/40 p-3">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                <Coins className="w-4 h-4 text-purple-500" />
                                Consumo Mensal
                            </h4>
                            <Select value={selectedYear} onValueChange={setSelectedYear}>
                                <SelectTrigger className="w-24 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableYears.map((year) => (
                                        <SelectItem key={year} value={year}>{year}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {monthlyChart.some((d) => d.tokens > 0) ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={monthlyChart}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis dataKey="month" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis fontSize={12} tickFormatter={formatNumber} stroke="hsl(var(--muted-foreground))" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                                        formatter={(value: number) => [formatNumber(value), "Tokens"]}
                                    />
                                    <Bar dataKey="tokens" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                                {loadingMonthly ? "Carregando..." : "Sem dados para este período"}
                            </div>
                        )}
                    </div>

                    {/* Consumo Diário */}
                    <div className="rounded-lg border border-border/40 p-3">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-blue-500" />
                                Consumo Diário
                            </h4>
                            <Select value={dailyDays} onValueChange={setDailyDays}>
                                <SelectTrigger className="w-28 h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7">7 dias</SelectItem>
                                    <SelectItem value="15">15 dias</SelectItem>
                                    <SelectItem value="30">30 dias</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {dailyChart.length > 0 ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={dailyChart}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis dataKey="date" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis fontSize={12} tickFormatter={formatNumber} stroke="hsl(var(--muted-foreground))" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                                        formatter={(value: number) => [formatNumber(value), "Tokens"]}
                                    />
                                    <Line type="monotone" dataKey="tokens" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                                {loadingDaily ? "Carregando..." : "Sem dados para este período"}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
