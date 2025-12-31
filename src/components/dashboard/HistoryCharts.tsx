import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend
} from "recharts";

// Card de gráfico de área com gradiente moderno
const ModernAreaChart = ({
    title,
    data,
    dataKey = "value",
    color = "#8b5cf6",
    gradientId = "areaGradient"
}: {
    title: string,
    data: any[],
    dataKey?: string,
    color?: string,
    gradientId?: string
}) => {
    return (
        <div className="rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 p-6 hover:border-border transition-all duration-300 h-[320px]">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
            <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        stroke="hsl(var(--muted))"
                        strokeOpacity={0.3}
                    />
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
                        }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                        labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
                    />
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        strokeWidth={2.5}
                        fill={`url(#${gradientId})`}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: 'white' }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

// Card de gráfico combinado com barras e linha
const CombinedChart = ({
    title,
    data
}: {
    title: string,
    data: any[]
}) => {
    return (
        <div className="rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 p-6 hover:border-border transition-all duration-300 h-[400px]">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
            <ResponsiveContainer width="100%" height="90%">
                <BarChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="barGradient1" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.6} />
                        </linearGradient>
                        <linearGradient id="barGradient2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={1} />
                            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.6} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 3"
                        stroke="hsl(var(--muted))"
                        strokeOpacity={0.3}
                    />
                    <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
                        }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                        labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.1 }}
                    />
                    <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12 }}
                    />
                    <Bar
                        name="Novos Contatos"
                        dataKey="new_contacts"
                        fill="url(#barGradient1)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                    />
                    <Bar
                        name="Atendimentos"
                        dataKey="new_tickets"
                        fill="url(#barGradient2)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

// Cards de resumo rápido
const QuickStatCard = ({
    label,
    value,
    subtext,
    color = "#8b5cf6"
}: {
    label: string,
    value: string | number,
    subtext?: string,
    color?: string
}) => {
    return (
        <div className="rounded-2xl bg-white dark:bg-card/50 backdrop-blur-sm border border-border/50 p-5 hover:border-border transition-all duration-300">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
            <p className="text-3xl font-bold" style={{ color }}>{value}</p>
            {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
        </div>
    );
};

export const HistoryCharts = () => {
    const { data: metrics, isLoading } = useQuery({
        queryKey: ['dashboard-history'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_dashboard_history');
            if (error) throw error;
            return data;
        }
    });

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-[320px] bg-muted/20 rounded-2xl animate-pulse" />
                    <div className="h-[320px] bg-muted/20 rounded-2xl animate-pulse" />
                </div>
            </div>
        );
    }

    if (!metrics) return null;

    // Calcular totais para as estatísticas rápidas
    const totalNewContacts = metrics.daily_new_contacts?.reduce((acc: number, d: any) => acc + (d.value || 0), 0) || 0;
    const totalNewTickets = metrics.daily_new_tickets?.reduce((acc: number, d: any) => acc + (d.value || 0), 0) || 0;
    const avgDaily = metrics.daily_new_tickets?.length > 0
        ? Math.round(totalNewTickets / metrics.daily_new_tickets.length)
        : 0;

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight">Leads e Atendimentos</h2>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <QuickStatCard
                    label="Novos Contatos"
                    value={totalNewContacts}
                    subtext="Últimos 30 dias"
                    color="#8b5cf6"
                />
                <QuickStatCard
                    label="Atendimentos"
                    value={totalNewTickets}
                    subtext="Últimos 30 dias"
                    color="#22d3ee"
                />
                <QuickStatCard
                    label="Média Diária"
                    value={avgDaily}
                    subtext="Atendimentos/dia"
                    color="#22c55e"
                />
                <QuickStatCard
                    label="Pico"
                    value={Math.max(...(metrics.daily_new_tickets?.map((d: any) => d.value || 0) || [0]))}
                    subtext="Maior dia do período"
                    color="#f59e0b"
                />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ModernAreaChart
                    title="Novos Contatos (Últimos 30 dias)"
                    data={metrics.daily_new_contacts || []}
                    color="#8b5cf6"
                    gradientId="contactsGradient"
                />
                <ModernAreaChart
                    title="Atendimentos (Últimos 30 dias)"
                    data={metrics.daily_new_tickets || []}
                    color="#22d3ee"
                    gradientId="ticketsGradient"
                />
            </div>

            {/* Combined Monthly Chart */}
            <CombinedChart
                title="Evolução Mensal (Últimos 12 meses)"
                data={metrics.monthly_combined || []}
            />
        </div>
    );
};
