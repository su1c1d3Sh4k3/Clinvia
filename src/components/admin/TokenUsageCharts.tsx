import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coins, TrendingUp, DollarSign, Calendar, Volume2 } from "lucide-react";
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useExchangeRate } from "@/hooks/useExchangeRate";

interface TokenUsageChartsProps {
    profileId: string;
}

interface MonthlyData {
    year_month: string;
    total_tokens: number;
    total_cost: number;
}

interface DailyData {
    usage_date: string;
    total_tokens: number;
}

interface CostMonthlyData {
    year_month: string;
    token_cost: number;
    audio_cost: number;
}

interface CostDailyData {
    usage_date: string;
    token_cost: number;
    audio_cost: number;
}

interface TokenStats {
    tokens_total: number;
    tokens_monthly: number;
    approximate_cost_total: number;
    approximate_cost_monthly: number;
    audio_cost_total: number;
    audio_cost_monthly: number;
}

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
};

const formatCurrency = (value: number, convertToReal: (val: number) => string): string => {
    return convertToReal(value);
};

type TabType = "tokens" | "costs";

const TokenUsageCharts = ({ profileId }: TokenUsageChartsProps) => {
    const { convertToReal, rate } = useExchangeRate();
    const [activeTab, setActiveTab] = useState<TabType>("tokens");
    const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);

    // Token consumption data
    const [monthlyData, setMonthlyData] = useState<{ month: string; tokens: number }[]>([]);
    const [dailyData, setDailyData] = useState<{ date: string; tokens: number }[]>([]);

    // Cost data
    const [costMonthlyData, setCostMonthlyData] = useState<{ month: string; tokenCost: number; audioCost: number }[]>([]);
    const [costDailyData, setCostDailyData] = useState<{ date: string; tokenCost: number; audioCost: number }[]>([]);

    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [periodFilter, setPeriodFilter] = useState<string>("30");
    const [loading, setLoading] = useState(true);

    // Calculate total costs (tokens + audio)
    const totalCostTotal = (tokenStats?.approximate_cost_total || 0) + (tokenStats?.audio_cost_total || 0);
    const totalCostMonthly = (tokenStats?.approximate_cost_monthly || 0) + (tokenStats?.audio_cost_monthly || 0);

    // Fetch token stats
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const { data, error } = await (supabase.rpc as any)("admin_get_profile_tokens", {
                    p_user_id: profileId,
                });
                if (!error && data && data.length > 0) {
                    setTokenStats(data[0]);
                }
            } catch (err) {
                console.error("Error fetching token stats:", err);
            }
        };
        fetchStats();
    }, [profileId]);

    // Fetch available years
    useEffect(() => {
        const fetchYears = async () => {
            try {
                const currentYear = new Date().getFullYear().toString();
                const { data, error } = await (supabase.rpc as any)("admin_get_token_years", {
                    p_user_id: profileId,
                });
                if (!error && data) {
                    const years = data.map((d: { year: string }) => d.year);
                    if (!years.includes(currentYear)) years.unshift(currentYear);
                    setAvailableYears(years);
                } else {
                    setAvailableYears([currentYear]);
                }
            } catch (err) {
                setAvailableYears([new Date().getFullYear().toString()]);
            }
        };
        fetchYears();
    }, [profileId]);

    // Fetch monthly token data
    useEffect(() => {
        const fetchMonthly = async () => {
            setLoading(true);
            try {
                const { data, error } = await (supabase.rpc as any)("admin_get_token_monthly_history", {
                    p_user_id: profileId,
                    p_year: selectedYear,
                });

                const monthlyMap = new Map<number, number>();
                if (!error && data) {
                    data.forEach((d: MonthlyData) => {
                        const month = parseInt(d.year_month.split("-")[1]) - 1;
                        monthlyMap.set(month, d.total_tokens);
                    });
                }

                const chartData = MONTH_NAMES.map((name, index) => ({
                    month: name,
                    tokens: monthlyMap.get(index) || 0,
                }));
                setMonthlyData(chartData);
            } catch (err) {
                console.error("Error fetching monthly data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchMonthly();
    }, [profileId, selectedYear]);

    // Fetch daily token data
    useEffect(() => {
        const fetchDaily = async () => {
            try {
                const days = periodFilter === "all" ? null : parseInt(periodFilter);
                const { data, error } = await (supabase.rpc as any)("admin_get_token_usage_history", {
                    p_user_id: profileId,
                    p_days: days,
                });

                if (!error && data) {
                    const chartData = data.map((d: DailyData) => ({
                        date: new Date(d.usage_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                        tokens: d.total_tokens,
                    }));
                    setDailyData(chartData);
                }
            } catch (err) {
                console.error("Error fetching daily data:", err);
            }
        };
        fetchDaily();
    }, [profileId, periodFilter]);

    // Fetch monthly cost data (tokens + audio)
    useEffect(() => {
        const fetchCostMonthly = async () => {
            try {
                const { data, error } = await (supabase.rpc as any)("admin_get_cost_monthly_history", {
                    p_user_id: profileId,
                    p_year: selectedYear,
                });

                const costMap = new Map<number, { tokenCost: number; audioCost: number }>();
                if (!error && data) {
                    data.forEach((d: CostMonthlyData) => {
                        const month = parseInt(d.year_month.split("-")[1]) - 1;
                        costMap.set(month, { tokenCost: d.token_cost, audioCost: d.audio_cost });
                    });
                }

                const chartData = MONTH_NAMES.map((name, index) => ({
                    month: name,
                    tokenCost: costMap.get(index)?.tokenCost || 0,
                    audioCost: costMap.get(index)?.audioCost || 0,
                }));
                setCostMonthlyData(chartData);
            } catch (err) {
                console.error("Error fetching cost monthly data:", err);
            }
        };
        if (activeTab === "costs") fetchCostMonthly();
    }, [profileId, selectedYear, activeTab]);

    // Fetch daily cost data (tokens + audio)
    useEffect(() => {
        const fetchCostDaily = async () => {
            try {
                const days = periodFilter === "all" ? null : parseInt(periodFilter);
                const { data, error } = await (supabase.rpc as any)("admin_get_cost_daily_history", {
                    p_user_id: profileId,
                    p_days: days,
                });

                if (!error && data) {
                    const chartData = data.map((d: CostDailyData) => ({
                        date: new Date(d.usage_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
                        tokenCost: d.token_cost,
                        audioCost: d.audio_cost,
                    }));
                    setCostDailyData(chartData);
                }
            } catch (err) {
                console.error("Error fetching cost daily data:", err);
            }
        };
        if (activeTab === "costs") fetchCostDaily();
    }, [profileId, periodFilter, activeTab]);

    return (
        <div className="space-y-6">
            {/* Stats Cards - Always visible */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gray-900 border-gray-700">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                            <Coins className="w-4 h-4 text-purple-500" />
                            Total de Tokens
                        </div>
                        <div className="text-2xl font-bold text-white">
                            {formatNumber(tokenStats?.tokens_total || 0)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-700">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            Tokens do Mês
                        </div>
                        <div className="text-2xl font-bold text-white">
                            {formatNumber(tokenStats?.tokens_monthly || 0)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-700">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                            <DollarSign className="w-4 h-4 text-green-500" />
                            Custo Total
                        </div>
                        <div className="text-2xl font-bold text-white">
                            {convertToReal(totalCostTotal)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            Tokens: {convertToReal(tokenStats?.approximate_cost_total || 0)} | Áudio: {convertToReal(tokenStats?.audio_cost_total || 0)}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-700">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                            <TrendingUp className="w-4 h-4 text-orange-500" />
                            Custo Mensal
                        </div>
                        <div className="text-2xl font-bold text-white">
                            {convertToReal(totalCostMonthly)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            Tokens: {convertToReal(tokenStats?.approximate_cost_monthly || 0)} | Áudio: {convertToReal(tokenStats?.audio_cost_monthly || 0)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs for Charts */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full">
                <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
                    <TabsTrigger value="tokens" className="flex items-center gap-2">
                        <Coins className="h-4 w-4" />
                        <span>Consumo de Tokens</span>
                    </TabsTrigger>
                    <TabsTrigger value="costs" className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        <span>Custo Gerado</span>
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activeTab === "tokens" ? (
                    <>
                        {/* Monthly Token Bar Chart */}
                        <div className="bg-gray-900 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <Coins className="w-5 h-5 text-purple-500" />
                                    Consumo Mensal
                                </h3>
                                {availableYears.length > 0 && (
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger className="w-24 bg-gray-800 border-gray-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-800 border-gray-700">
                                            {availableYears.map((year) => (
                                                <SelectItem key={year} value={year} className="text-white hover:bg-gray-700">
                                                    {year}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                            {monthlyData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={monthlyData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                                        <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={formatNumber} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                                            labelStyle={{ color: "#fff" }}
                                            formatter={(value: number) => [formatNumber(value), "Tokens"]}
                                        />
                                        <Bar dataKey="tokens" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[250px] text-gray-500">
                                    {loading ? "Carregando..." : "Sem dados para este período"}
                                </div>
                            )}
                        </div>

                        {/* Daily Token Line Chart */}
                        <div className="bg-gray-900 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-blue-500" />
                                    Consumo Diário
                                </h3>
                                <Select value={periodFilter} onValueChange={setPeriodFilter}>
                                    <SelectTrigger className="w-32 bg-gray-800 border-gray-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-700">
                                        <SelectItem value="7" className="text-white hover:bg-gray-700">7 dias</SelectItem>
                                        <SelectItem value="30" className="text-white hover:bg-gray-700">30 dias</SelectItem>
                                        <SelectItem value="all" className="text-white hover:bg-gray-700">Todo período</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {dailyData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={dailyData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} />
                                        <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={formatNumber} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                                            labelStyle={{ color: "#fff" }}
                                            formatter={(value: number) => [formatNumber(value), "Tokens"]}
                                        />
                                        <Line type="monotone" dataKey="tokens" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[250px] text-gray-500">
                                    Sem dados para este período
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Monthly Cost Bar Chart */}
                        <div className="bg-gray-900 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <DollarSign className="w-5 h-5 text-green-500" />
                                    Custo Mensal
                                </h3>
                                {availableYears.length > 0 && (
                                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                                        <SelectTrigger className="w-24 bg-gray-800 border-gray-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-800 border-gray-700">
                                            {availableYears.map((year) => (
                                                <SelectItem key={year} value={year} className="text-white hover:bg-gray-700">
                                                    {year}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                            {costMonthlyData.some(d => d.tokenCost > 0 || d.audioCost > 0) ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={costMonthlyData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                                        <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                                            labelStyle={{ color: "#fff" }}
                                            formatter={(value: number, name: string) => [
                                                `$${value.toFixed(4)}`,
                                                name === "tokenCost" ? "Tokens" : "Áudio"
                                            ]}
                                        />
                                        <Legend formatter={(value) => value === "tokenCost" ? "Tokens" : "Áudio"} />
                                        <Bar dataKey="tokenCost" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="tokenCost" />
                                        <Bar dataKey="audioCost" fill="#22c55e" radius={[4, 4, 0, 0]} name="audioCost" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[250px] text-gray-500">
                                    Sem dados de custo para este período
                                </div>
                            )}
                        </div>

                        {/* Daily Cost Line Chart */}
                        <div className="bg-gray-900 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-orange-500" />
                                    Custo Diário
                                </h3>
                                <Select value={periodFilter} onValueChange={setPeriodFilter}>
                                    <SelectTrigger className="w-32 bg-gray-800 border-gray-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-700">
                                        <SelectItem value="7" className="text-white hover:bg-gray-700">7 dias</SelectItem>
                                        <SelectItem value="30" className="text-white hover:bg-gray-700">30 dias</SelectItem>
                                        <SelectItem value="all" className="text-white hover:bg-gray-700">Todo período</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {costDailyData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={costDailyData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} />
                                        <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                                            labelStyle={{ color: "#fff" }}
                                            formatter={(value: number, name: string) => [
                                                `$${value.toFixed(4)}`,
                                                name === "tokenCost" ? "Tokens" : "Áudio"
                                            ]}
                                        />
                                        <Legend formatter={(value) => value === "tokenCost" ? "Tokens" : "Áudio"} />
                                        <Line type="monotone" dataKey="tokenCost" stroke="#8b5cf6" strokeWidth={2} dot={false} name="tokenCost" />
                                        <Line type="monotone" dataKey="audioCost" stroke="#22c55e" strokeWidth={2} dot={false} name="audioCost" />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-[250px] text-gray-500">
                                    Sem dados de custo para este período
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default TokenUsageCharts;
