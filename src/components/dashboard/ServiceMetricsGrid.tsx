import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    LineChart,
    Line
} from "recharts";
import { TrendingUp, TrendingDown, MessageSquare, Clock, CheckCircle2 } from "lucide-react";

const COLORS = ['#8b5cf6', '#22d3ee', '#22c55e', '#f59e0b', '#ef4444', '#ec4899'];

// Mapeamento de status para português
const STATUS_MAP: Record<string, string> = {
    'pending': 'Pendente',
    'open': 'Aberto',
    'resolved': 'Resolvido'
};

// Linha de métrica individual dentro do card combinado
const MetricRow = ({
    title,
    value,
    data,
    color = "#22d3ee",
    icon: Icon
}: {
    title: string,
    value: number,
    data: { date: string, value: number }[],
    color?: string,
    icon?: React.ElementType
}) => {
    // Pegar últimos 7 dias
    const last7Days = data?.slice(-7) || [];

    // Calcular variação percentual (semana atual vs semana anterior)
    const currentWeek = last7Days.reduce((acc, d) => acc + (d.value || 0), 0);
    const previousWeek = data?.slice(-14, -7).reduce((acc, d) => acc + (d.value || 0), 0) || 0;
    const change = previousWeek > 0 ? Math.round(((currentWeek - previousWeek) / previousWeek) * 100) : 0;
    const isPositive = change >= 0;

    return (
        <div className="flex items-center justify-between py-5 border-b border-border/50 last:border-b-0">
            <div className="flex items-center gap-4">
                {Icon && (
                    <div className="p-3 rounded-xl bg-muted/50">
                        <Icon className="w-6 h-6" style={{ color }} />
                    </div>
                )}
                <div>
                    <p className="text-base text-muted-foreground font-medium">{title}</p>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-4xl font-bold" style={{ color }}>{value}</span>
                        {previousWeek > 0 && (
                            <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                <span>{isPositive ? '+' : ''}{change}%</span>
                            </div>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">últimos 7 dias</p>
                </div>
            </div>

            {/* Sparkline dos últimos 7 dias - Melhorado */}
            {last7Days.length > 0 && (
                <div className="w-36 h-16">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={last7Days}>
                            <defs>
                                <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                                    <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke={color}
                                strokeWidth={3}
                                fill={`url(#gradient-${color.replace('#', '')})`}
                                dot={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

// Card combinado com as 3 métricas
const CombinedMetricsCard = ({
    totalTickets,
    pendingTickets,
    resolvedTickets,
    dailyData
}: {
    totalTickets: number,
    pendingTickets: number,
    resolvedTickets: number,
    dailyData: { date: string, value: number }[]
}) => {
    // Calcular dados por status para cada dia
    const pendingPerDay = dailyData.map(d => ({
        ...d,
        value: Math.round(d.value * (pendingTickets / Math.max(totalTickets, 1)))
    }));

    const resolvedPerDay = dailyData.map(d => ({
        ...d,
        value: Math.round(d.value * (resolvedTickets / Math.max(totalTickets, 1)))
    }));

    return (
        <Card className="h-auto min-h-[480px]">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-muted-foreground">
                    Resumo de Atendimentos
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <MetricRow
                    title="Total de Atendimentos"
                    value={totalTickets}
                    data={dailyData}
                    color="#22d3ee"
                    icon={MessageSquare}
                />
                <MetricRow
                    title="Pendentes"
                    value={pendingTickets}
                    data={pendingPerDay}
                    color="#eab308"
                    icon={Clock}
                />
                <MetricRow
                    title="Resolvidos"
                    value={resolvedTickets}
                    data={resolvedPerDay}
                    color="#22c55e"
                    icon={CheckCircle2}
                />
            </CardContent>
        </Card>
    );
};

// Card com gráfico de linhas sobrepostas - Posicionado ao lado
const MultiLineChartCard = ({
    title,
    data,
    lines
}: {
    title: string,
    data: any[],
    lines: { dataKey: string, name: string, color: string }[]
}) => {
    const hasData = data && data.length > 0;

    return (
        <Card className="h-auto min-h-[480px]">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-muted-foreground">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
                {hasData ? (
                    <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 0 }}>
                            <defs>
                                {lines.map((line) => (
                                    <linearGradient key={line.dataKey} id={`lineGradient-${line.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={line.color} stopOpacity={0.3} />
                                        <stop offset="100%" stopColor={line.color} stopOpacity={0} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.2} vertical={false} />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                                dx={-10}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    borderColor: 'hsl(var(--border))',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    padding: '12px'
                                }}
                            />
                            <Legend
                                verticalAlign="top"
                                height={40}
                                iconType="circle"
                                iconSize={10}
                                wrapperStyle={{ fontSize: '14px' }}
                            />
                            {lines.map((line) => (
                                <Line
                                    key={line.dataKey}
                                    type="monotone"
                                    dataKey={line.dataKey}
                                    name={line.name}
                                    stroke={line.color}
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 6, strokeWidth: 2, stroke: 'white' }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-base">
                        Sem dados
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Card com gráfico radial (Pie Chart)
const RadialChartCard = ({ title, data }: { title: string, data: any[] }) => {
    const hasData = data && data.length > 0;
    const total = data?.reduce((acc, item) => acc + (item.value || 0), 0) || 0;

    return (
        <Card className="h-[340px]">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-muted-foreground">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pb-0">
                {hasData ? (
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                            <defs>
                                {COLORS.map((color, index) => (
                                    <linearGradient key={index} id={`pieGradient-${index}`} x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="45%"
                                innerRadius={45}
                                outerRadius={75}
                                paddingAngle={4}
                                dataKey="value"
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={`url(#pieGradient-${index % COLORS.length})`}
                                    />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    borderColor: 'hsl(var(--border))',
                                    borderRadius: '12px',
                                    fontSize: '14px',
                                    padding: '12px'
                                }}
                                formatter={(value: number, name: string) => [
                                    <span className="font-bold">{value}</span>,
                                    STATUS_MAP[name] || name
                                ]}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={50}
                                iconType="circle"
                                iconSize={12}
                                formatter={(value) => (
                                    <span className="text-sm font-medium ml-1">{STATUS_MAP[value] || value}</span>
                                )}
                            />
                            {/* Centro com total */}
                            <text x="50%" y="42%" textAnchor="middle" className="fill-foreground">
                                <tspan className="text-3xl font-bold">{total}</tspan>
                            </text>
                            <text x="50%" y="52%" textAnchor="middle" className="fill-muted-foreground text-sm">
                                total
                            </text>
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-base">
                        Sem dados
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Card de distribuição com barras horizontais
const DistributionCard = ({
    title,
    items
}: {
    title: string,
    items: { name: string, value: number }[]
}) => {
    const maxValue = Math.max(...(items?.map(i => i.value) || [1]), 1);
    const hasData = items && items.length > 0;

    return (
        <Card className="h-[340px]">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-muted-foreground">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {hasData ? (
                    <div className="space-y-4">
                        {items.slice(0, 5).map((item, index) => (
                            <div key={index} className="space-y-2">
                                <div className="flex justify-between text-base">
                                    <span className="truncate font-medium">{item.name}</span>
                                    <span className="font-bold text-lg" style={{ color: COLORS[index % COLORS.length] }}>
                                        {item.value}
                                    </span>
                                </div>
                                <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-out"
                                        style={{
                                            width: `${(item.value / maxValue) * 100}%`,
                                            background: `linear-gradient(90deg, ${COLORS[index % COLORS.length]}, ${COLORS[index % COLORS.length]}99)`
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-base">
                        Sem dados
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

// Card combinado com dois gauges lado a lado
const DualGaugeCard = ({
    responseTime,
    responseTimeChange,
    quality,
    qualityChange
}: {
    responseTime: number,
    responseTimeChange?: number,
    quality: number,
    qualityChange?: number
}) => {
    // Função para calcular strokeDasharray
    const calcStroke = (value: number, max: number) => {
        const percentage = Math.min((value / max) * 100, 100);
        return `${percentage * 2.51} 251`;
    };

    // Formatar tempo de resposta 
    const formatTime = (seconds: number) => {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${(seconds / 3600).toFixed(1)}h`;
    };

    // Score de tempo - usando escala logarítmica para melhor visualização
    // Tempos menores = círculo mais cheio, tempos maiores = menos cheio
    // Escala: 1min=10, 5min=8, 15min=6, 30min=4, 60min=2, 120min=1
    const calcTimeScore = (seconds: number) => {
        if (seconds <= 0) return 0;
        const minutes = seconds / 60;
        // Inverso logarítmico: quanto menor o tempo, maior o score
        const score = Math.max(0, 10 - (Math.log10(minutes + 1) * 4));
        return Math.min(10, score);
    };
    const timeScore = calcTimeScore(responseTime);

    return (
        <Card className="h-[340px]">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-muted-foreground">
                    Indicadores de Performance
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
                <div className="grid grid-cols-2 gap-6 h-full">
                    {/* Gauge de Tempo de Resposta */}
                    <div className="flex flex-col items-center justify-center">
                        <div className="relative w-32 h-32">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <circle
                                    cx="50" cy="50" r="40"
                                    fill="none"
                                    stroke="hsl(var(--muted))"
                                    strokeWidth="10"
                                    opacity={0.2}
                                />
                                <circle
                                    cx="50" cy="50" r="40"
                                    fill="none"
                                    stroke="#22d3ee"
                                    strokeWidth="10"
                                    strokeLinecap="round"
                                    strokeDasharray={calcStroke(timeScore, 10)}
                                    className="transition-all duration-1000 ease-out"
                                    style={{ filter: 'drop-shadow(0 0 8px #22d3ee60)' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-bold text-cyan-400">
                                    {formatTime(responseTime)}
                                </span>
                                <span className="text-xs text-muted-foreground">Média</span>
                            </div>
                        </div>
                        <p className="text-sm font-medium mt-2 text-center">Tempo de Resposta</p>
                        {responseTimeChange !== undefined && responseTimeChange !== 0 && (
                            <div className={`flex items-center gap-1 text-xs ${responseTimeChange < 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {responseTimeChange < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                <span>{responseTimeChange > 0 ? '+' : ''}{responseTimeChange.toFixed(1)}%</span>
                            </div>
                        )}
                    </div>

                    {/* Gauge de Qualidade */}
                    <div className="flex flex-col items-center justify-center">
                        <div className="relative w-32 h-32">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <circle
                                    cx="50" cy="50" r="40"
                                    fill="none"
                                    stroke="hsl(var(--muted))"
                                    strokeWidth="10"
                                    opacity={0.2}
                                />
                                <circle
                                    cx="50" cy="50" r="40"
                                    fill="none"
                                    stroke="#d946ef"
                                    strokeWidth="10"
                                    strokeLinecap="round"
                                    strokeDasharray={calcStroke(quality, 10)}
                                    className="transition-all duration-1000 ease-out"
                                    style={{ filter: 'drop-shadow(0 0 8px #d946ef60)' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-bold text-fuchsia-500">
                                    {quality > 0 ? quality.toFixed(1) : '—'}
                                </span>
                                <span className="text-xs text-muted-foreground">de 10</span>
                            </div>
                        </div>
                        <p className="text-sm font-medium mt-2 text-center">Qualidade</p>
                        {qualityChange !== undefined && qualityChange !== 0 && (
                            <div className={`flex items-center gap-1 text-xs ${qualityChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {qualityChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                <span>{qualityChange > 0 ? '+' : ''}{qualityChange.toFixed(1)}%</span>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};


export const ServiceMetricsGrid = () => {

    const { data: stats, isLoading: isLoadingStats } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_dashboard_stats');
            if (error) throw error;
            console.log('Dashboard stats:', data);
            return data;
        }
    });

    // Buscar histórico para os gráficos de área
    const { data: history, isLoading: isLoadingHistory } = useQuery({
        queryKey: ['dashboard-history'],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_dashboard_history');
            if (error) throw error;
            console.log('Dashboard history:', data);
            return data;
        }
    });

    // Buscar métricas globais (qualidade e velocidade)
    const { data: globalMetrics } = useQuery({
        queryKey: ['global-metrics'],
        refetchOnWindowFocus: true,
        staleTime: 1000 * 60 * 2,
        queryFn: async () => {
            // 1. Pegar o user_id do usuário logado na tabela team_members
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) return null;

            const { data: teamMember } = await supabase
                .from('team_members')
                .select('user_id')
                .eq('auth_user_id', userData.user.id)
                .maybeSingle();

            // Se não encontrou por auth_user_id, tenta user_id (admin)
            let userId = teamMember?.user_id;
            if (!userId) {
                const { data: adminMember } = await supabase
                    .from('team_members')
                    .select('user_id')
                    .eq('user_id', userData.user.id)
                    .maybeSingle();
                userId = adminMember?.user_id || userData.user.id;
            }

            console.log('Buscando métricas para user_id:', userId);

            // 2. Buscar ai_analysis JOIN conversations WHERE user_id = userId
            // Usando RPC para fazer o JOIN corretamente
            const { data: qualityData, error: qualityError } = await supabase.rpc('get_avg_sentiment_score', {
                owner_id: userId
            });

            console.log('Quality data from RPC:', qualityData, qualityError);

            // Se RPC não existir, fazer query manual via SQL
            let avgQuality = 0;
            if (qualityError) {
                // Fallback: buscar via query direta
                const { data: rawData, error: rawError } = await supabase
                    .from('ai_analysis')
                    .select('sentiment_score, conversations!inner(user_id)')
                    .eq('conversations.user_id', userId)
                    .not('sentiment_score', 'is', null);

                console.log('Fallback query result:', rawData, rawError);

                if (rawData && rawData.length > 0) {
                    avgQuality = rawData.reduce((acc, a) => acc + (Number(a.sentiment_score) || 0), 0) / rawData.length;
                }
            } else {
                avgQuality = qualityData || 0;
            }

            // Buscar tempo de resposta
            const { data: rtData } = await supabase
                .from('response_times')
                .select('response_duration_seconds')
                .not('response_duration_seconds', 'is', null)
                .lt('response_duration_seconds', 86400);

            const avgResponseTime = rtData && rtData.length > 0
                ? rtData.reduce((acc, r) => acc + (r.response_duration_seconds || 0), 0) / rtData.length
                : 0;

            const result = {
                avg_quality: Math.round(avgQuality * 10) / 10,
                avg_response_time_seconds: Math.round(avgResponseTime),
                quality_change: 0,
                response_time_change: 0
            };

            console.log('Global metrics result:', result);
            return result;
        }
    });

    const isLoading = isLoadingStats || isLoadingHistory;

    if (isLoading) {
        return (
            <div className="max-w-[60%] space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="h-[420px] bg-muted/20 rounded-xl animate-pulse" />
                    <div className="h-[420px] bg-muted/20 rounded-xl animate-pulse" />
                </div>
            </div>
        );
    }

    if (!stats) return null;

    // Calcular totais usando os nomes corretos do banco (pending, open, resolved)
    const ticketsByStatus = stats.tickets_by_status || [];
    const totalTickets = ticketsByStatus.reduce((acc: number, s: any) => acc + (s.value || 0), 0);
    const resolvedTickets = ticketsByStatus.find((s: any) => s.name === 'resolved')?.value || 0;
    const pendingTickets = ticketsByStatus.find((s: any) => s.name === 'pending')?.value || 0;
    const openTickets = ticketsByStatus.find((s: any) => s.name === 'open')?.value || 0;

    // Dados do histórico
    const dailyTickets = history?.daily_new_tickets || [];

    // Criar dados para o gráfico de status por dia
    // Usar os valores diários reais e distribuir proporcionalmente
    const statusByDay = dailyTickets.map((d: any) => {
        const dayTotal = d.value || 0;
        // Se não há tickets no total, assumir proporções básicas
        if (totalTickets === 0) {
            return {
                date: d.date,
                pendente: dayTotal,
                aberto: 0,
                resolvido: 0,
            };
        }

        return {
            date: d.date,
            pendente: Math.round(dayTotal * (pendingTickets / totalTickets)) || 0,
            aberto: Math.round(dayTotal * (openTickets / totalTickets)) || 0,
            resolvido: Math.round(dayTotal * (resolvedTickets / totalTickets)) || 0,
        };
    });

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">Painéis de Atendimento</h2>

            {/* Linha 1: Card de métricas (largura fixa) + Gráfico de Linhas (restante) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4">
                    <CombinedMetricsCard
                        totalTickets={totalTickets}
                        pendingTickets={pendingTickets}
                        resolvedTickets={resolvedTickets}
                        dailyData={dailyTickets}
                    />
                </div>
                <div className="lg:col-span-8">
                    <MultiLineChartCard
                        title="Atendimentos por Status (30 dias)"
                        data={statusByDay}
                        lines={[
                            { dataKey: 'pendente', name: 'Pendente', color: '#eab308' },
                            { dataKey: 'aberto', name: 'Aberto', color: '#3b82f6' },
                            { dataKey: 'resolvido', name: 'Resolvido', color: '#22c55e' },
                        ]}
                    />
                </div>
            </div>

            {/* Linha 2: Gráfico Radial + Distribuições + Gauges Combinados */}
            {/* grid de 13 colunas: 3 cards menores (3 cols cada = 23%) + 1 card maior (4 cols = 31%) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(13,1fr)] gap-6">
                <div className="lg:col-span-3">
                    <RadialChartCard
                        title="Atendimento por Fila"
                        data={stats.tickets_by_queue || []}
                    />
                </div>
                <div className="lg:col-span-3">
                    <DistributionCard
                        title="Atendimento por Usuário"
                        items={stats.tickets_by_user || []}
                    />
                </div>
                <div className="lg:col-span-3">
                    <DistributionCard
                        title="Atendimento por Tag"
                        items={stats.clients_by_tag || []}
                    />
                </div>
                <div className="lg:col-span-4">
                    <DualGaugeCard
                        responseTime={globalMetrics?.avg_response_time_seconds || 0}
                        responseTimeChange={globalMetrics?.response_time_change}
                        quality={globalMetrics?.avg_quality || 0}
                        qualityChange={globalMetrics?.quality_change}
                    />
                </div>
            </div>
        </div>
    );
};
