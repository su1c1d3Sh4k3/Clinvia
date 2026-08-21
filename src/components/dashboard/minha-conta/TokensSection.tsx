import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Calendar, TrendingUp, Send, Wallet } from "lucide-react";
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
    useMyTokenStats, useMyTokenYears, useMyTokenMonthly, useMyTokenDaily,
    useMyMetaSendStats, useMyMetaSendMonthly, useMyMetaSendDaily,
} from "@/hooks/useMyTokenUsage";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
};

const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

interface StatCard {
    label: string;
    icon: JSX.Element;
    count: number;
    unit: string;
    cost: number;
    gradient: string;
    iconBg: string;
    bar: string;
}

// Relatório do Consumo: custo total da conta (tokens da IA + envios Meta em R$),
// cards por período e gráficos mensal/diário com as duas séries
export function TokensSection() {
    const currentYear = new Date().getFullYear().toString();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [dailyDays, setDailyDays] = useState("7");

    const { data: stats } = useMyTokenStats();
    const { data: metaStats } = useMyMetaSendStats();
    const { data: years } = useMyTokenYears();
    const { data: monthly, isLoading: loadingMonthly } = useMyTokenMonthly(selectedYear);
    const { data: daily, isLoading: loadingDaily } = useMyTokenDaily(parseInt(dailyDays));
    const { data: metaMonthly } = useMyMetaSendMonthly(selectedYear);
    const { data: metaDaily } = useMyMetaSendDaily(parseInt(dailyDays));

    const availableYears = (() => {
        const y = [...(years || [])];
        if (!y.includes(currentYear)) y.unshift(currentYear);
        return y;
    })();

    // Gráfico mensal: tokens (IA) + custo Meta por mês
    const monthlyTokensMap = new Map<number, number>();
    (monthly || []).forEach((d) => {
        monthlyTokensMap.set(parseInt(d.year_month.split("-")[1]) - 1, d.total_tokens);
    });
    const monthlyMetaMap = new Map<number, number>();
    (metaMonthly || []).forEach((d) => {
        monthlyMetaMap.set(parseInt(d.year_month.split("-")[1]) - 1, d.cost_brl);
    });
    const monthlyChart = MONTH_NAMES.map((name, i) => ({
        month: name,
        tokens: monthlyTokensMap.get(i) || 0,
        metaCost: monthlyMetaMap.get(i) || 0,
    }));

    // Gráfico diário: união das datas das duas séries
    const dailyMap = new Map<string, { tokens: number; metaCost: number }>();
    (daily || []).forEach((d) => {
        dailyMap.set(d.usage_date, { tokens: d.total_tokens, metaCost: 0 });
    });
    (metaDaily || []).forEach((d) => {
        const e = dailyMap.get(d.usage_date) || { tokens: 0, metaCost: 0 };
        e.metaCost = d.cost_brl;
        dailyMap.set(d.usage_date, e);
    });
    const dailyChart = [...dailyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
            date: new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            tokens: v.tokens,
            metaCost: v.metaCost,
        }));

    const totalConta = (stats?.total_cost_brl || 0) + (metaStats?.total_cost_brl || 0);
    const mesConta = (stats?.month_cost_brl || 0) + (metaStats?.month_cost_brl || 0);
    const hojeConta = (stats?.today_cost_brl || 0) + (metaStats?.today_cost_brl || 0);

    const tokenCards: StatCard[] = [
        {
            label: "Total de Tokens",
            icon: <Coins className="w-4 h-4 text-purple-500" />,
            count: stats?.total_tokens || 0,
            unit: "tokens",
            cost: stats?.total_cost_brl || 0,
            gradient: "from-purple-500/10 via-purple-500/[0.03] to-transparent",
            iconBg: "bg-purple-500/15",
            bar: "bg-purple-500",
        },
        {
            label: "Consumo Mensal",
            icon: <Calendar className="w-4 h-4 text-blue-500" />,
            count: stats?.month_tokens || 0,
            unit: "tokens",
            cost: stats?.month_cost_brl || 0,
            gradient: "from-blue-500/10 via-blue-500/[0.03] to-transparent",
            iconBg: "bg-blue-500/15",
            bar: "bg-blue-500",
        },
        {
            label: "Consumo Diário",
            icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
            count: stats?.today_tokens || 0,
            unit: "tokens",
            cost: stats?.today_cost_brl || 0,
            gradient: "from-emerald-500/10 via-emerald-500/[0.03] to-transparent",
            iconBg: "bg-emerald-500/15",
            bar: "bg-emerald-500",
        },
    ];

    const metaCards: StatCard[] = [
        {
            label: "Custo Total Meta",
            icon: <Send className="w-4 h-4 text-amber-500" />,
            count: metaStats?.total_count || 0,
            unit: "mensagens",
            cost: metaStats?.total_cost_brl || 0,
            gradient: "from-amber-500/10 via-amber-500/[0.03] to-transparent",
            iconBg: "bg-amber-500/15",
            bar: "bg-amber-500",
        },
        {
            label: "Custo Mensal",
            icon: <Calendar className="w-4 h-4 text-orange-500" />,
            count: metaStats?.month_count || 0,
            unit: "mensagens",
            cost: metaStats?.month_cost_brl || 0,
            gradient: "from-orange-500/10 via-orange-500/[0.03] to-transparent",
            iconBg: "bg-orange-500/15",
            bar: "bg-orange-500",
        },
        {
            label: "Custo Diário",
            icon: <TrendingUp className="w-4 h-4 text-rose-500" />,
            count: metaStats?.today_count || 0,
            unit: "mensagens",
            cost: metaStats?.today_cost_brl || 0,
            gradient: "from-rose-500/10 via-rose-500/[0.03] to-transparent",
            iconBg: "bg-rose-500/15",
            bar: "bg-rose-500",
        },
    ];

    const renderCard = (c: StatCard) => (
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
                <span className="font-semibold text-foreground/80 tabular-nums">{formatNumber(c.count)}</span> {c.unit}
            </p>
        </div>
    );

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-purple-500" />
                    Relatório do Consumo
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Custo Total da Conta — ocupa as duas linhas na 1ª coluna */}
                    <div className="relative overflow-hidden p-5 rounded-xl border border-border/40 bg-gradient-to-br from-primary/15 via-primary/[0.05] to-transparent sm:col-span-2 lg:col-span-1 lg:row-span-2 flex flex-col justify-center transition-shadow hover:shadow-md">
                        <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-medium text-muted-foreground">Custo Total da Conta</span>
                            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                                <Wallet className="w-5 h-5 text-primary" />
                            </div>
                        </div>
                        <p className="text-3xl font-bold tracking-tight tabular-nums">{brl(totalConta)}</p>
                        <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                            IA: <span className="font-semibold text-foreground/80">{brl(stats?.total_cost_brl || 0)}</span>
                            {" · "}
                            Meta: <span className="font-semibold text-foreground/80">{brl(metaStats?.total_cost_brl || 0)}</span>
                        </p>
                        <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-2 gap-2">
                            <div>
                                <p className="text-[11px] text-muted-foreground">Mês</p>
                                <p className="text-sm font-semibold tabular-nums">{brl(mesConta)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-muted-foreground">Hoje</p>
                                <p className="text-sm font-semibold tabular-nums">{brl(hojeConta)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Linha 1: tokens da IA */}
                    {tokenCards.map(renderCard)}

                    {/* Linha 2: envios Meta */}
                    {metaCards.map(renderCard)}
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
                        {monthlyChart.some((d) => d.tokens > 0 || d.metaCost > 0) ? (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={monthlyChart}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis dataKey="month" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis yAxisId="tokens" fontSize={12} tickFormatter={formatNumber} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis yAxisId="meta" orientation="right" fontSize={11} tickFormatter={(v: number) => `R$${formatNumber(v)}`} stroke="#f59e0b" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                                        formatter={(value: number, name: string) =>
                                            name === "Custo Meta" ? [brl(value), name] : [formatNumber(value), name]
                                        }
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar yAxisId="tokens" dataKey="tokens" name="Tokens" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                    <Bar yAxisId="meta" dataKey="metaCost" name="Custo Meta" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
                                    <YAxis yAxisId="tokens" fontSize={12} tickFormatter={formatNumber} stroke="hsl(var(--muted-foreground))" />
                                    <YAxis yAxisId="meta" orientation="right" fontSize={11} tickFormatter={(v: number) => `R$${formatNumber(v)}`} stroke="#f59e0b" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                                        formatter={(value: number, name: string) =>
                                            name === "Custo Meta" ? [brl(value), name] : [formatNumber(value), name]
                                        }
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Line yAxisId="tokens" type="monotone" dataKey="tokens" name="Tokens" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                    <Line yAxisId="meta" type="monotone" dataKey="metaCost" name="Custo Meta" stroke="#f59e0b" strokeWidth={2} dot={false} />
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
