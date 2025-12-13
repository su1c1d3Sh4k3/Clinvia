import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Wallet,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    CreditCard,
    BarChart3,
    Receipt,
    FileText,
    Target,
    Users,
} from "lucide-react";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

// Import financial hooks
import {
    useFinancialSummary,
    useRevenues,
    useExpenses,
    useTeamCosts,
    useMarketingCampaigns,
    useRevenueByAgent,
    useRevenueByProfessional,
} from "@/hooks/useFinancial";

// Helpers
const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

const StatusBadge = ({ status }: { status: string }) => {
    const variants: Record<string, { className: string; label: string }> = {
        paid: { className: "bg-green-500/20 text-green-500 border-green-500/30", label: "Pago" },
        pending: { className: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30", label: "Pendente" },
        overdue: { className: "bg-red-500/20 text-red-500 border-red-500/30", label: "Atrasado" },
        cancelled: { className: "bg-gray-500/20 text-gray-500 border-gray-500/30", label: "Cancelado" },
    };

    const variant = variants[status] || variants.pending;
    return <Badge className={`${variant.className} border text-xs`}>{variant.label}</Badge>;
};

// ========================================
// SECTION 1: Balance Cards (5 cards)
// ========================================
const BalanceCardsSection = () => {
    const currentDate = new Date();
    const { data: summary, isLoading } = useFinancialSummary(
        currentDate.getMonth() + 1,
        currentDate.getFullYear()
    );

    const { data: revenues = [] } = useRevenues();
    const { data: expenses = [] } = useExpenses();

    // Calculate summaries
    const received = revenues
        .filter(r => r.status === 'paid' && r.paid_date)
        .reduce((sum, r) => sum + Number(r.amount), 0);

    const futureReceivables = revenues
        .filter(r => r.status === 'pending' || (r.status === 'paid' && !r.paid_date))
        .reduce((sum, r) => sum + Number(r.amount), 0);

    const debited = expenses
        .filter(e => e.status === 'paid' && e.paid_date)
        .reduce((sum, e) => sum + Number(e.amount), 0);

    const futureDebits = expenses
        .filter(e => e.status === 'pending' || (e.status === 'paid' && !e.paid_date))
        .reduce((sum, e) => sum + Number(e.amount), 0);

    const billing = received - debited;

    const cards = [
        {
            title: "Faturamento",
            value: billing,
            icon: Wallet,
            color: billing >= 0 ? "text-primary" : "text-red-500",
            bgColor: billing >= 0 ? "bg-primary/10" : "bg-red-500/10",
            borderColor: billing >= 0 ? "border-primary/30" : "border-red-500/30",
            description: "Receitas - Despesas",
            badge: billing >= 0 ? "↗ Positivo" : "↘ Negativo",
            highlighted: true,
        },
        {
            title: "Recebidos",
            value: received,
            icon: ArrowUpRight,
            color: "text-green-500",
            bgColor: "bg-green-500/10",
            borderColor: "border-green-500/20",
            description: "Este mês",
            highlighted: false,
        },
        {
            title: "Recebimentos Futuros",
            value: futureReceivables,
            icon: Calendar,
            color: "text-blue-500",
            bgColor: "bg-blue-500/10",
            borderColor: "border-blue-500/20",
            description: "Projeção",
            highlighted: false,
        },
        {
            title: "Débitos",
            value: debited,
            icon: ArrowDownRight,
            color: "text-red-500",
            bgColor: "bg-red-500/10",
            borderColor: "border-red-500/20",
            description: "Este mês",
            highlighted: false,
        },
        {
            title: "Débitos Futuros",
            value: futureDebits,
            icon: CreditCard,
            color: "text-orange-500",
            bgColor: "bg-orange-500/10",
            borderColor: "border-orange-500/20",
            description: "A vencer",
            highlighted: false,
        },
    ];

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i}>
                        <CardContent className="p-4">
                            <Skeleton className="h-16 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {cards.map((card, index) => (
                <Card
                    key={index}
                    className={`${card.borderColor} border-2 ${card.highlighted
                        ? 'bg-gradient-to-br from-primary/5 via-transparent to-transparent shadow-lg'
                        : ''
                        }`}
                >
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className={`p-2 rounded-full ${card.bgColor}`}>
                                    <card.icon className={`w-5 h-5 ${card.color}`} />
                                </div>
                                {card.highlighted && card.badge && (
                                    <Badge variant={billing >= 0 ? "default" : "destructive"} className="text-[10px]">
                                        {card.badge}
                                    </Badge>
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                    {card.title}
                                </p>
                                <p className={`text-xl font-bold mt-0.5 ${card.color}`}>
                                    {formatCurrency(card.value)}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{card.description}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

// ========================================
// SECTION 2: Overview Chart (30 days)
// ========================================
const OverviewChartSection = () => {
    const [chartType, setChartType] = useState<'line' | 'bar'>('line');

    const { data: revenues = [] } = useRevenues();
    const { data: expenses = [] } = useExpenses();
    const { data: teamCosts = [] } = useTeamCosts();
    const { data: campaigns = [] } = useMarketingCampaigns();

    const chartData = useMemo(() => {
        const data = [];
        const today = new Date();

        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const dayRevenues = revenues
                .filter(r => r.due_date === dateStr)
                .reduce((sum, r) => sum + Number(r.amount), 0);

            const dayExpenses = expenses
                .filter(e => e.due_date === dateStr)
                .reduce((sum, e) => sum + Number(e.amount), 0);

            const dayTeamCosts = teamCosts
                .filter(t => t.due_date === dateStr)
                .reduce((sum, t) => sum + Number(t.base_salary) + Number(t.commission) + Number(t.bonus) - Number(t.deductions), 0);

            const dayMarketing = campaigns
                .filter(c => c.start_date === dateStr)
                .reduce((sum, c) => sum + Number(c.investment), 0);

            data.push({
                date: date.getDate() + '/' + (date.getMonth() + 1),
                Receitas: dayRevenues,
                Despesas: dayExpenses,
                'Custo Equipe': dayTeamCosts,
                Marketing: dayMarketing,
            });
        }

        return data;
    }, [revenues, expenses, teamCosts, campaigns]);

    const ChartComponent = chartType === 'line' ? LineChart : BarChart;

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-primary" />
                            Visão Geral dos Lançamentos
                        </CardTitle>
                        <CardDescription>Últimos 30 dias - Comparativo de todos os lançamentos</CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setChartType(chartType === 'line' ? 'bar' : 'line')}
                        className="gap-2"
                    >
                        <BarChart3 className="w-4 h-4" />
                        {chartType === 'line' ? 'Ver Barras' : 'Ver Linhas'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                    <ChartComponent data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                        <XAxis
                            dataKey="date"
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={11}
                        />
                        <YAxis
                            stroke="hsl(var(--muted-foreground))"
                            tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                            fontSize={11}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                            }}
                            formatter={(value: number) => formatCurrency(value)}
                        />
                        <Legend />

                        {chartType === 'line' ? (
                            <>
                                <Line type="monotone" dataKey="Receitas" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} />
                                <Line type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                                <Line type="monotone" dataKey="Custo Equipe" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
                                <Line type="monotone" dataKey="Marketing" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                            </>
                        ) : (
                            <>
                                <Bar dataKey="Receitas" fill="#22c55e" />
                                <Bar dataKey="Despesas" fill="#ef4444" />
                                <Bar dataKey="Custo Equipe" fill="#f59e0b" />
                                <Bar dataKey="Marketing" fill="#3b82f6" />
                            </>
                        )}
                    </ChartComponent>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};

// ========================================
// SECTION 3: Summary Tables (4 cards)
// ========================================
const SummaryTablesSection = () => {
    const { data: revenues = [], isLoading: loadingRevenues } = useRevenues();
    const { data: expenses = [], isLoading: loadingExpenses } = useExpenses();
    const { data: agentRevenue = [], isLoading: loadingAgents } = useRevenueByAgent();
    const { data: professionalRevenue = [], isLoading: loadingProfessionals } = useRevenueByProfessional();

    // Get last 5 revenues
    const lastRevenues = useMemo(() => {
        return [...revenues]
            .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
            .slice(0, 5);
    }, [revenues]);

    // Get last 5 expenses
    const lastExpenses = useMemo(() => {
        return [...expenses]
            .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
            .slice(0, 5);
    }, [expenses]);

    // Get last 5 professionals by update
    const lastProfessionals = useMemo(() => {
        return [...professionalRevenue].slice(0, 5);
    }, [professionalRevenue]);

    // Get last 5 agents by update
    const lastAgents = useMemo(() => {
        return [...agentRevenue].slice(0, 5);
    }, [agentRevenue]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Últimas Receitas */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Receipt className="w-4 h-4 text-green-500" />
                        Últimas Receitas
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingRevenues ? (
                        <Skeleton className="h-32 w-full" />
                    ) : lastRevenues.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4 text-sm">Nenhum dado</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs">Item</TableHead>
                                    <TableHead className="text-xs">Valor</TableHead>
                                    <TableHead className="text-xs">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lastRevenues.map((rev) => (
                                    <TableRow key={rev.id}>
                                        <TableCell className="text-xs font-medium truncate max-w-[80px]" title={rev.description}>
                                            {rev.description}
                                        </TableCell>
                                        <TableCell className="text-xs text-green-500 font-semibold">
                                            {formatCurrency(Number(rev.amount))}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={rev.status} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Últimas Despesas */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <FileText className="w-4 h-4 text-red-500" />
                        Últimas Despesas
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingExpenses ? (
                        <Skeleton className="h-32 w-full" />
                    ) : lastExpenses.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4 text-sm">Nenhum dado</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs">Item</TableHead>
                                    <TableHead className="text-xs">Valor</TableHead>
                                    <TableHead className="text-xs">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lastExpenses.map((exp) => (
                                    <TableRow key={exp.id}>
                                        <TableCell className="text-xs font-medium truncate max-w-[80px]" title={exp.description}>
                                            {exp.description}
                                        </TableCell>
                                        <TableCell className="text-xs text-red-500 font-semibold">
                                            {formatCurrency(Number(exp.amount))}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={exp.status} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Receitas por Profissional */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Target className="w-4 h-4 text-fuchsia-500" />
                        Receitas por Profissional
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingProfessionals ? (
                        <Skeleton className="h-32 w-full" />
                    ) : lastProfessionals.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4 text-sm">Nenhum dado</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs">Profissional</TableHead>
                                    <TableHead className="text-xs">Valor</TableHead>
                                    <TableHead className="text-xs">Comissão</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lastProfessionals.map((prof) => (
                                    <TableRow key={prof.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Avatar className="w-6 h-6">
                                                    <AvatarImage src={prof.photo || undefined} />
                                                    <AvatarFallback className="bg-fuchsia-500/20 text-fuchsia-500 text-[10px]">
                                                        {prof.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="text-xs font-medium truncate max-w-[60px]">{prof.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-green-500 font-semibold">
                                            {formatCurrency(Number(prof.revenue))}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-orange-500 font-semibold">
                                                    {formatCurrency(prof.commissionTotal || 0)}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    ({prof.commissionRate || 0}%)
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Receitas por Atendente */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="w-4 h-4 text-cyan-500" />
                        Receitas por Atendente
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingAgents ? (
                        <Skeleton className="h-32 w-full" />
                    ) : lastAgents.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4 text-sm">Nenhum dado</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs">Atendente</TableHead>
                                    <TableHead className="text-xs">Valor</TableHead>
                                    <TableHead className="text-xs">Comissão</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lastAgents.map((agent) => (
                                    <TableRow key={agent.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Avatar className="w-6 h-6">
                                                    <AvatarImage src={agent.photo || undefined} />
                                                    <AvatarFallback className="bg-cyan-500/20 text-cyan-500 text-[10px]">
                                                        {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="text-xs font-medium truncate max-w-[60px]">{agent.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-green-500 font-semibold">
                                            {formatCurrency(Number(agent.revenue))}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {agent.transactions} trans.
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

// ========================================
// MAIN COMPONENT
// ========================================
export const FinancialDashboard = () => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Section 1: Balance Cards */}
            <BalanceCardsSection />

            {/* Section 2: Overview Chart */}
            <OverviewChartSection />

            {/* Section 3: Summary Tables */}
            <SummaryTablesSection />
        </div>
    );
};
