import { useState, useMemo, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Wallet,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Plus,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
    DollarSign,
    Users,
    Target,
    CreditCard,
    BarChart3,
    Receipt,
    Loader2,
    FileText,
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

// Hooks e tipos
import {
    useFinancialSummary,
    useAnnualBalance,
    useRevenues,
    useExpenses,
    useTeamCosts,
    useMarketingCampaigns,
    useRevenueByAgent,
    useRevenueByProfessional,
    useDeleteRevenue,
    useDeleteExpense,
    useDeleteTeamCost,
    useDeleteMarketingCampaign,
} from "@/hooks/useFinancial";
import type {
    Revenue,
    Expense,
    TeamCost,
    MarketingCampaign,
} from "@/types/financial";
import { PaymentMethodLabels, CollaboratorTypeLabels, getOriginLabel } from "@/types/financial";

// Modais
import { RevenueModal } from "@/components/financial/RevenueModal";
import { ExpenseModal } from "@/components/financial/ExpenseModal";
import { TeamCostModal } from "@/components/financial/TeamCostModal";
import { MarketingCampaignModal } from "@/components/financial/MarketingCampaignModal";
import { FinancialReportsModal } from "@/components/financial/FinancialReportsModal";
import PeriodSelector from "@/components/financial/PeriodSelector";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";

// ========================================
// HELPERS
// ========================================

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
        active: { className: "bg-blue-500/20 text-blue-500 border-blue-500/30", label: "Ativa" },
        paused: { className: "bg-orange-500/20 text-orange-500 border-orange-500/30", label: "Pausada" },
        finished: { className: "bg-gray-500/20 text-gray-500 border-gray-500/30", label: "Finalizada" },
    };

    const variant = variants[status] || variants.pending;
    return <Badge className={`${variant.className} border`}>{variant.label}</Badge>;
};

// ========================================
// COMPONENTES
// ========================================

// Seção 1: Cards de Balanço
const BalanceCards = ({ startDate, endDate }: { startDate?: string; endDate?: string }) => {
    // Use provided period or default to current month
    const currentDate = new Date();
    const defaultStart = startDate || new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = endDate || new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data: summary, isLoading } = useFinancialSummary(
        currentDate.getMonth() + 1,
        currentDate.getFullYear()
    );

    // Fetch filtered data for calculations
    const { data: revenues = [] } = useRevenues(startDate, endDate);
    const { data: expenses = [] } = useExpenses(startDate, endDate);

    // Calculate summaries from filtered data
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

    // Calcular faturamento (receitas - despesas)
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i}>
                        <CardContent className="p-6">
                            <Skeleton className="h-20 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {cards.map((card, index) => (
                <Card
                    key={index}
                    className={`${card.borderColor} border-2 ${card.highlighted
                        ? 'bg-gradient-to-br from-primary/5 via-transparent to-transparent shadow-lg'
                        : ''
                        }`}
                >
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className={`p-3 rounded-full ${card.bgColor}`}>
                                    <card.icon className={`w-6 h-6 ${card.color}`} />
                                </div>
                                {card.highlighted && card.badge && (
                                    <Badge variant={billing >= 0 ? "default" : "destructive"} className="text-xs">
                                        {card.badge}
                                    </Badge>
                                )}
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">
                                    {card.title}
                                </p>
                                <p className={`text-2xl font-bold mt-1 ${card.color}`}>
                                    {formatCurrency(card.value)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

// Seção 2: Gráfico Anual
const AnnualChart = () => {
    const { data: annualData, isLoading } = useAnnualBalance();

    return (
        <Card>
            <Tabs defaultValue="revenue" className="w-full">
                <div className="p-6 pb-0">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="revenue" className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Faturamento Mensal
                        </TabsTrigger>
                        <TabsTrigger value="comparison" className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            Receitas x Despesas
                        </TabsTrigger>
                    </TabsList>
                </div>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        Balanço Anual
                    </CardTitle>
                    <CardDescription>
                        Análise financeira dos últimos 12 meses
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-[350px] w-full" />
                    ) : (
                        <>
                            <TabsContent value="revenue" className="mt-0">
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
                                        />
                                        <Legend />
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

                            <TabsContent value="comparison" className="mt-0">
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
                                        />
                                        <Legend />
                                        <Line
                                            type="monotone"
                                            dataKey="revenue"
                                            name="Receitas"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            dot={{ fill: '#22c55e' }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="expenses"
                                            name="Despesas"
                                            stroke="#ef4444"
                                            strokeWidth={2}
                                            dot={{ fill: '#ef4444' }}
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
};

// Componente de Visão Geral - Gráfico 30 dias
interface OverviewChartProps {
    revenues: Revenue[];
    expenses: Expense[];
    teamCosts: TeamCost[];
    campaigns: MarketingCampaign[];
}

const OverviewChart = ({ revenues, expenses, teamCosts, campaigns }: OverviewChartProps) => {
    const [chartType, setChartType] = useState<'line' | 'bar'>('line');

    // Safety check
    const safeRevenues = revenues || [];
    const safeExpenses = expenses || [];
    const safeTeamCosts = teamCosts || [];
    const safeCampaigns = campaigns || [];

    // Gerar dados dos últimos 30 dias
    const getLast30DaysData = () => {
        const data = [];
        const today = new Date();

        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            // Somar valores por tipo naquele dia
            const dayRevenues = safeRevenues
                .filter(r => r.due_date === dateStr)
                .reduce((sum, r) => sum + Number(r.amount), 0);

            const dayExpenses = safeExpenses
                .filter(e => e.due_date === dateStr)
                .reduce((sum, e) => sum + Number(e.amount), 0);

            const dayTeamCosts = safeTeamCosts
                .filter(t => t.due_date === dateStr)
                .reduce((sum, t) => sum + Number(t.base_salary) + Number(t.commission) + Number(t.bonus) - Number(t.deductions), 0);

            const dayMarketing = safeCampaigns
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
    };

    const chartData = getLast30DaysData();
    const ChartComponent = chartType === 'line' ? LineChart : BarChart;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Últimos 30 Dias</h4>
                    <p className="text-xs text-muted-foreground mt-1">Comparativo de todos os lançamentos</p>
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

            <ResponsiveContainer width="100%" height={400}>
                <ChartComponent data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
                    <XAxis
                        dataKey="date"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                    />
                    <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                        fontSize={12}
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
                            <Line
                                type="monotone"
                                dataKey="Receitas"
                                stroke="#22c55e"
                                strokeWidth={2}
                                dot={{ fill: '#22c55e' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="Despesas"
                                stroke="#ef4444"
                                strokeWidth={2}
                                dot={{ fill: '#ef4444' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="Custo Equipe"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                dot={{ fill: '#f59e0b' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="Marketing"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ fill: '#3b82f6' }}
                            />
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
        </div>
    );
};

// Seção 3: Lançamentos
const TransactionsSection = ({ startDate, endDate }: { startDate?: string; endDate?: string }) => {
    const [activeTab, setActiveTab] = useState("revenues");
    const { data: userRole } = useUserRole();
    const isSupervisor = userRole === 'supervisor';

    // Modal states
    const [revenueModalOpen, setRevenueModalOpen] = useState(false);
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [teamCostModalOpen, setTeamCostModalOpen] = useState(false);
    const [marketingModalOpen, setMarketingModalOpen] = useState(false);

    // Edit states
    const [editingRevenue, setEditingRevenue] = useState<Revenue | null>(null);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [editingTeamCost, setEditingTeamCost] = useState<TeamCost | null>(null);
    const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);

    // Delete confirmation
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);

    // Pagination state
    const [pageSize, setPageSize] = useState(5);
    const [currentPage, setCurrentPage] = useState(1);

    // Reset page when tab changes
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    // Data queries with filters
    const { data: revenues = [], isLoading: loadingRevenues } = useRevenues(startDate, endDate);
    const { data: expenses = [], isLoading: loadingExpenses } = useExpenses(startDate, endDate);
    const { data: teamCosts = [], isLoading: loadingTeam } = useTeamCosts(startDate, endDate);
    const { data: campaigns = [], isLoading: loadingMarketing } = useMarketingCampaigns(startDate, endDate);

    // Paginated data
    const paginatedRevenues = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return revenues.slice(start, start + pageSize);
    }, [revenues, currentPage, pageSize]);

    const paginatedExpenses = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return expenses.slice(start, start + pageSize);
    }, [expenses, currentPage, pageSize]);

    const paginatedTeamCosts = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return teamCosts.slice(start, start + pageSize);
    }, [teamCosts, currentPage, pageSize]);

    const paginatedCampaigns = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return campaigns.slice(start, start + pageSize);
    }, [campaigns, currentPage, pageSize]);

    // Get total pages for current tab
    const getTotalPages = () => {
        switch (activeTab) {
            case 'revenues': return Math.ceil(revenues.length / pageSize);
            case 'expenses': return Math.ceil(expenses.length / pageSize);
            case 'team': return Math.ceil(teamCosts.length / pageSize);
            case 'marketing': return Math.ceil(campaigns.length / pageSize);
            default: return 1;
        }
    };

    const totalPages = getTotalPages();

    // Delete mutations
    const deleteRevenue = useDeleteRevenue();
    const deleteExpense = useDeleteExpense();
    const deleteTeamCost = useDeleteTeamCost();
    const deleteCampaign = useDeleteMarketingCampaign();

    // Calcular totais
    const totals = {
        overview: 0, // Visão geral não exibe total
        revenues: revenues.reduce((sum, item) => sum + Number(item.amount), 0),
        expenses: expenses.reduce((sum, item) => sum + Number(item.amount), 0),
        team: teamCosts.reduce((sum, item) => sum + Number(item.base_salary) + Number(item.commission) + Number(item.bonus) - Number(item.deductions), 0),
        marketing: campaigns.reduce((sum, item) => sum + Number(item.investment), 0),
    };

    const totalLabels: Record<string, { label: string; color: string }> = {
        overview: { label: "Visão Geral", color: "text-primary" },
        revenues: { label: "Receita total", color: "text-green-500" },
        expenses: { label: "Despesa total", color: "text-red-500" },
        team: { label: "Custo total", color: "text-amber-500" },
        marketing: { label: "Investimento total", color: "text-blue-500" },
    };

    const currentTotal = totals[activeTab as keyof typeof totals];
    const currentLabel = totalLabels[activeTab];

    const handleNewClick = () => {
        switch (activeTab) {
            case "revenues":
                setEditingRevenue(null);
                setRevenueModalOpen(true);
                break;
            case "expenses":
                setEditingExpense(null);
                setExpenseModalOpen(true);
                break;
            case "team":
                setEditingTeamCost(null);
                setTeamCostModalOpen(true);
                break;
            case "marketing":
                setEditingCampaign(null);
                setMarketingModalOpen(true);
                break;
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;

        switch (deleteTarget.type) {
            case "revenue":
                await deleteRevenue.mutateAsync(deleteTarget.id);
                break;
            case "expense":
                await deleteExpense.mutateAsync(deleteTarget.id);
                break;
            case "team":
                await deleteTeamCost.mutateAsync(deleteTarget.id);
                break;
            case "marketing":
                await deleteCampaign.mutateAsync(deleteTarget.id);
                break;
        }
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
    };

    const isLoading = loadingRevenues || loadingExpenses || loadingTeam || loadingMarketing;

    return (
        <>
            <Card>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="p-6 pb-0">
                        <TabsList className="grid w-full grid-cols-5">
                            <TabsTrigger value="revenues">Receitas</TabsTrigger>
                            <TabsTrigger value="expenses">Despesas</TabsTrigger>
                            <TabsTrigger value="team">Custo com Equipe</TabsTrigger>
                            <TabsTrigger value="marketing">Marketing</TabsTrigger>
                            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                        </TabsList>
                    </div>
                    <CardHeader className="pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Receipt className="w-5 h-5 text-purple-500" />
                                    Lançamentos
                                </CardTitle>
                                <CardDescription>
                                    Gerencie receitas, despesas, custos e campanhas
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-4">
                                {activeTab !== 'overview' && (
                                    <>
                                        {/* Pagination Page Size Selector */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground">Exibir:</span>
                                            <Select
                                                value={String(pageSize)}
                                                onValueChange={(value) => {
                                                    setPageSize(Number(value));
                                                    setCurrentPage(1);
                                                }}
                                            >
                                                <SelectTrigger className="w-[70px] h-8">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="5">5</SelectItem>
                                                    <SelectItem value="10">10</SelectItem>
                                                    <SelectItem value="20">20</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-muted-foreground">{currentLabel.label}</p>
                                            <p className={`text-xl font-bold ${currentLabel.color}`}>
                                                {formatCurrency(currentTotal)}
                                            </p>
                                        </div>
                                        <Button className="gap-2" onClick={handleNewClick}>
                                            <Plus className="w-4 h-4" />
                                            Novo Lançamento
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* Pagination Navigation */}
                        {activeTab !== 'overview' && totalPages > 1 && (
                            <div className="flex items-center justify-end gap-2 mt-4">
                                <span className="text-sm text-muted-foreground">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-64 w-full" />
                        ) : (
                            <>
                                {/* Visão Geral - NEW */}
                                <TabsContent value="overview" className="mt-0">
                                    <OverviewChart
                                        revenues={revenues}
                                        expenses={expenses}
                                        teamCosts={teamCosts}
                                        campaigns={campaigns}
                                    />
                                </TabsContent>

                                {/* Receitas */}
                                <TabsContent value="revenues" className="mt-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Categoria</TableHead>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Pagamento</TableHead>
                                                <TableHead>Vencimento</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {revenues.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                                        Nenhuma receita cadastrada
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedRevenues.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">
                                                            {item.category?.name || '-'}
                                                        </TableCell>
                                                        <TableCell>{item.item}</TableCell>
                                                        <TableCell className="text-green-500 font-semibold">
                                                            {formatCurrency(Number(item.amount))}
                                                        </TableCell>
                                                        <TableCell>{PaymentMethodLabels[item.payment_method]}</TableCell>
                                                        <TableCell>{new Date(item.due_date).toLocaleDateString('pt-BR')}</TableCell>
                                                        <TableCell><StatusBadge status={item.status} /></TableCell>
                                                        <TableCell className="text-right">
                                                            {!isSupervisor && (
                                                                <div className="flex justify-end gap-2">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => {
                                                                            setEditingRevenue(item);
                                                                            setRevenueModalOpen(true);
                                                                        }}
                                                                    >
                                                                        <Pencil className="w-4 h-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="text-destructive"
                                                                        onClick={() => {
                                                                            setDeleteTarget({ type: 'revenue', id: item.id, name: item.item });
                                                                            setDeleteDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TabsContent>

                                {/* Despesas */}
                                <TabsContent value="expenses" className="mt-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Categoria</TableHead>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Pagamento</TableHead>
                                                <TableHead>Vencimento</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {expenses.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                                        Nenhuma despesa cadastrada
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedExpenses.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">
                                                            {item.category?.name || '-'}
                                                        </TableCell>
                                                        <TableCell>{item.item}</TableCell>
                                                        <TableCell className="text-red-500 font-semibold">
                                                            {formatCurrency(Number(item.amount))}
                                                        </TableCell>
                                                        <TableCell>{PaymentMethodLabels[item.payment_method]}</TableCell>
                                                        <TableCell>{new Date(item.due_date).toLocaleDateString('pt-BR')}</TableCell>
                                                        <TableCell><StatusBadge status={item.status} /></TableCell>
                                                        <TableCell className="text-right">
                                                            {!isSupervisor && (
                                                                <div className="flex justify-end gap-2">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => {
                                                                            setEditingExpense(item);
                                                                            setExpenseModalOpen(true);
                                                                        }}
                                                                    >
                                                                        <Pencil className="w-4 h-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="text-destructive"
                                                                        onClick={() => {
                                                                            setDeleteTarget({ type: 'expense', id: item.id, name: item.item });
                                                                            setDeleteDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TabsContent>

                                {/* Custo com Equipe */}
                                <TabsContent value="team" className="mt-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tipo</TableHead>
                                                <TableHead>Colaborador</TableHead>
                                                <TableHead>Salário</TableHead>
                                                <TableHead>Comissão</TableHead>
                                                <TableHead>Total</TableHead>
                                                <TableHead>Referência</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {teamCosts.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                                                        Nenhum custo com equipe cadastrado
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedTeamCosts.map((item) => {
                                                    const total = Number(item.base_salary) + Number(item.commission) + Number(item.bonus) - Number(item.deductions);
                                                    const collaboratorName = item.team_member?.name || item.professional?.name || '-';
                                                    return (
                                                        <TableRow key={item.id}>
                                                            <TableCell>
                                                                <Badge variant="outline">{CollaboratorTypeLabels[item.collaborator_type]}</Badge>
                                                            </TableCell>
                                                            <TableCell className="font-medium">{collaboratorName}</TableCell>
                                                            <TableCell>{formatCurrency(Number(item.base_salary))}</TableCell>
                                                            <TableCell className="text-amber-500">{formatCurrency(Number(item.commission))}</TableCell>
                                                            <TableCell className="font-semibold">{formatCurrency(total)}</TableCell>
                                                            <TableCell>{`${String(item.reference_month).padStart(2, '0')}/${item.reference_year}`}</TableCell>
                                                            <TableCell><StatusBadge status={item.status} /></TableCell>
                                                            <TableCell className="text-right">
                                                                {!isSupervisor && (
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => {
                                                                                setEditingTeamCost(item);
                                                                                setTeamCostModalOpen(true);
                                                                            }}
                                                                        >
                                                                            <Pencil className="w-4 h-4" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="text-destructive"
                                                                            onClick={() => {
                                                                                setDeleteTarget({ type: 'team', id: item.id, name: collaboratorName });
                                                                                setDeleteDialogOpen(true);
                                                                            }}
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </TabsContent>

                                {/* Marketing */}
                                <TabsContent value="marketing" className="mt-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Origem</TableHead>
                                                <TableHead>Campanha</TableHead>
                                                <TableHead>Investimento</TableHead>
                                                <TableHead>Leads</TableHead>
                                                <TableHead>Conversões</TableHead>
                                                <TableHead>Custo/Lead</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {campaigns.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                                                        Nenhuma campanha cadastrada
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedCampaigns.map((item) => {
                                                    const costPerLead = item.leads_count > 0 ? Number(item.investment) / item.leads_count : 0;
                                                    return (
                                                        <TableRow key={item.id}>
                                                            <TableCell>
                                                                <Badge variant="outline" className="font-semibold">
                                                                    {getOriginLabel(item.origin)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="font-medium">{item.name}</TableCell>
                                                            <TableCell className="text-blue-500 font-semibold">
                                                                {formatCurrency(Number(item.investment))}
                                                            </TableCell>
                                                            <TableCell>{item.leads_count}</TableCell>
                                                            <TableCell>{item.conversions_count}</TableCell>
                                                            <TableCell>{formatCurrency(costPerLead)}</TableCell>
                                                            <TableCell><StatusBadge status={item.status} /></TableCell>
                                                            <TableCell className="text-right">
                                                                {!isSupervisor && (
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => {
                                                                                setEditingCampaign(item);
                                                                                setMarketingModalOpen(true);
                                                                            }}
                                                                        >
                                                                            <Pencil className="w-4 h-4" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="text-destructive"
                                                                            onClick={() => {
                                                                                setDeleteTarget({ type: 'marketing', id: item.id, name: item.name });
                                                                                setDeleteDialogOpen(true);
                                                                            }}
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </TabsContent>
                            </>
                        )}
                    </CardContent>
                </Tabs>
            </Card>

            {/* Modais */}
            <RevenueModal
                open={revenueModalOpen}
                onOpenChange={setRevenueModalOpen}
                revenue={editingRevenue}
            />
            <ExpenseModal
                open={expenseModalOpen}
                onOpenChange={setExpenseModalOpen}
                expense={editingExpense}
            />
            <TeamCostModal
                open={teamCostModalOpen}
                onOpenChange={setTeamCostModalOpen}
                teamCost={editingTeamCost}
            />
            <MarketingCampaignModal
                open={marketingModalOpen}
                onOpenChange={setMarketingModalOpen}
                campaign={editingCampaign}
            />

            {/* Dialog de confirmação de exclusão */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir "{deleteTarget?.name}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {(deleteRevenue.isPending || deleteExpense.isPending || deleteTeamCost.isPending || deleteCampaign.isPending) && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

// Seção 4: Retorno por Pessoa
const ReturnByPersonSection = () => {
    const { data: agentRevenue = [], isLoading: loadingAgents } = useRevenueByAgent();
    const { data: professionalRevenue = [], isLoading: loadingProfessionals } = useRevenueByProfessional();

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Por Atendente */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-cyan-500" />
                        Receitas por Atendente
                    </CardTitle>
                    <CardDescription>
                        Valores lançados por cada atendente
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingAgents ? (
                        <Skeleton className="h-32 w-full" />
                    ) : agentRevenue.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                            Nenhum dado disponível
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Atendente</TableHead>
                                    <TableHead>Valor Gerado</TableHead>
                                    <TableHead>Comissão</TableHead>
                                    <TableHead>Transações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {agentRevenue.map((agent) => (
                                    <TableRow key={agent.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-8 h-8">
                                                    <AvatarImage src={agent.photo || undefined} />
                                                    <AvatarFallback className="bg-cyan-500/20 text-cyan-500">
                                                        {agent.name.split(' ').map(n => n[0]).join('')}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{agent.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-green-500 font-semibold">
                                            {formatCurrency(Number(agent.revenue))}
                                        </TableCell>
                                        <TableCell>
                                            {agent.commissionRate ? (
                                                <div className="flex flex-col">
                                                    <span className="text-muted-foreground text-xs">{agent.commissionRate}%</span>
                                                    <span className="text-orange-500 font-medium">{formatCurrency(Number(agent.commissionTotal || 0))}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{agent.transactions} transações</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Por Profissional */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-fuchsia-500" />
                        Receitas por Profissional
                    </CardTitle>
                    <CardDescription>
                        Valores de atendimentos por profissional
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingProfessionals ? (
                        <Skeleton className="h-32 w-full" />
                    ) : professionalRevenue.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                            Nenhum dado disponível
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Profissional</TableHead>
                                    <TableHead>Valor Gerado</TableHead>
                                    <TableHead>Comissão</TableHead>
                                    <TableHead>Agendamentos</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {professionalRevenue.map((prof) => (
                                    <TableRow key={prof.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-8 h-8">
                                                    <AvatarImage src={prof.photo || undefined} />
                                                    <AvatarFallback className="bg-fuchsia-500/20 text-fuchsia-500">
                                                        {prof.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{prof.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-green-500 font-semibold">
                                            {formatCurrency(Number(prof.revenue))}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="text-orange-500 font-semibold">
                                                    {formatCurrency(prof.commissionTotal || 0)}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    ({prof.commissionRate || 0}%)
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{prof.appointments} agendamentos</TableCell>
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
// PÁGINA PRINCIPAL
// ========================================

const Financial = () => {
    const { data: userRole } = useUserRole();
    const navigate = useNavigate();
    const currentDate = new Date();
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    // Redirecionar agentes para página principal
    useEffect(() => {
        if (userRole === 'agent') {
            navigate('/', { replace: true });
        }
    }, [userRole, navigate]);

    // Period filter state
    const [periodMode, setPeriodMode] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
    const [currentPeriod, setCurrentPeriod] = useState<Date>(new Date());
    const [reportsModalOpen, setReportsModalOpen] = useState(false);

    // Calculate date range based on period
    const { startDate, endDate } = useMemo(() => {
        const year = currentPeriod.getFullYear();
        const month = currentPeriod.getMonth();

        switch (periodMode) {
            case 'monthly':
                return {
                    startDate: new Date(year, month, 1).toISOString().split('T')[0],
                    endDate: new Date(year, month + 1, 0).toISOString().split('T')[0],
                };

            case 'quarterly':
                const quarter = Math.floor(month / 3);
                return {
                    startDate: new Date(year, quarter * 3, 1).toISOString().split('T')[0],
                    endDate: new Date(year, (quarter + 1) * 3, 0).toISOString().split('T')[0],
                };

            case 'yearly':
                return {
                    startDate: new Date(year, 0, 1).toISOString().split('T')[0],
                    endDate: new Date(year, 11, 31).toISOString().split('T')[0],
                };
        }
    }, [periodMode, currentPeriod]);

    return (
        <div className="flex-1 space-y-8 p-8 pt-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20">
                        <Wallet className="w-8 h-8 text-green-500" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Financeiro</h2>
                        <p className="text-muted-foreground">Controle de receitas, despesas e análises financeiras</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        onClick={() => setReportsModalOpen(true)}
                        className="gap-2"
                    >
                        <FileText className="w-4 h-4" />
                        Relatórios Financeiros
                    </Button>
                    <PeriodSelector
                        mode={periodMode}
                        currentPeriod={currentPeriod}
                        onModeChange={setPeriodMode}
                        onPeriodChange={setCurrentPeriod}
                    />
                </div>
            </div>

            {/* Seção 1: Balanço Mensal */}
            <section>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    Balanço Mensal
                </h3>
                <BalanceCards startDate={startDate} endDate={endDate} />
            </section>

            {/* Seção 2: Balanço Anual */}
            <section>
                <AnnualChart />
            </section>

            {/* Seção 3: Lançamentos */}
            <section>
                <TransactionsSection startDate={startDate} endDate={endDate} />
            </section>

            {/* Seção 4: Retorno por Pessoa */}
            <section>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    Retorno por Profissional
                </h3>
                <ReturnByPersonSection />
            </section>

            {/* Financial Reports Modal */}
            <FinancialReportsModal
                open={reportsModalOpen}
                onOpenChange={setReportsModalOpen}
            />
        </div>
    );
};

export default Financial;
