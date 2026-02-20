import { useState, useEffect } from "react";
import { ServiceMetricsGrid } from "@/components/dashboard/ServiceMetricsGrid";
import { HistoryCharts } from "@/components/dashboard/HistoryCharts";
import { TeamPerformanceTable } from "@/components/dashboard/TeamPerformanceTable";
import { NotificationsBoard } from "@/components/dashboard/NotificationsBoard";
import { SalesDashboard } from "@/components/dashboard/SalesDashboard";
import { MacroFunnelsPanel } from "@/components/dashboard/MacroFunnelsPanel";
import { OpportunitiesSection } from "@/components/OpportunitiesSection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Headphones, Users, ShoppingCart } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useFinancialAccess } from "@/hooks/useFinancialAccess";
import { cn } from "@/lib/utils";

type DashboardTab = "atendimentos" | "leads" | "vendas";

const Dashboard = () => {
    const { data: userRole } = useUserRole();
    const { data: financialAccess } = useFinancialAccess();
    const [activeTab, setActiveTab] = useState<DashboardTab>("leads");

    const canViewSales = userRole === 'admin' || (userRole === 'supervisor' && financialAccess !== false);

    // Forçar aba "leads" para agentes
    useEffect(() => {
        if (userRole === 'agent') {
            setActiveTab("leads");
        }
    }, [userRole]);

    return (
        <div className="flex-1 space-y-4 md:space-y-8 p-4 md:p-8 pt-4 md:pt-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
            </div>

            <div className="space-y-4 md:space-y-6">
                <NotificationsBoard />

                {/* Dashboard Tabs - Agentes só veem Painel de Negócios */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)} className="w-full">
                    <TabsList className={cn(
                        "grid w-full max-w-2xl mx-auto",
                        userRole === 'agent' ? "grid-cols-1" : canViewSales ? "grid-cols-3" : "grid-cols-2"
                    )}>
                        {userRole !== 'agent' && (
                            <TabsTrigger
                                value="atendimentos"
                                className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_rgba(0,177,242,0.3)] transition-all duration-300"
                            >
                                <Headphones className="h-4 w-4 transition-transform duration-300 data-[state=active]:scale-110" />
                                <span className="hidden sm:inline">Atendimentos</span>
                            </TabsTrigger>
                        )}
                        <TabsTrigger
                            value="leads"
                            className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_rgba(0,177,242,0.3)] transition-all duration-300"
                        >
                            <Users className="h-4 w-4 transition-transform duration-300 data-[state=active]:scale-110" />
                            <span className="hidden sm:inline">Negócios</span>
                        </TabsTrigger>
                        {canViewSales && (
                            <TabsTrigger
                                value="vendas"
                                className="flex items-center gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_rgba(0,177,242,0.3)] transition-all duration-300"
                            >
                                <ShoppingCart className="h-4 w-4 transition-transform duration-300 data-[state=active]:scale-110" />
                                <span className="hidden sm:inline">Vendas</span>
                            </TabsTrigger>
                        )}
                    </TabsList>
                </Tabs>

                {/* Tab Content */}
                {activeTab === "atendimentos" && userRole !== 'agent' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <ServiceMetricsGrid />
                        <HistoryCharts />
                        <TeamPerformanceTable />
                    </div>
                )}

                {activeTab === "leads" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <OpportunitiesSection compact={true} />
                        <MacroFunnelsPanel />
                    </div>
                )}

                {activeTab === "vendas" && canViewSales && (
                    <SalesDashboard />
                )}
            </div>
        </div>
    );
};

export default Dashboard;

