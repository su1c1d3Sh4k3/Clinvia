import { useState, useEffect } from "react";
import { ServiceMetricsGrid } from "@/components/dashboard/ServiceMetricsGrid";
import { HistoryCharts } from "@/components/dashboard/HistoryCharts";
import { TeamPerformanceTable } from "@/components/dashboard/TeamPerformanceTable";
import { NotificationsBoard } from "@/components/dashboard/NotificationsBoard";
import { FinancialDashboard } from "@/components/dashboard/FinancialDashboard";
import { LeadsFunnelPanel } from "@/components/dashboard/LeadsFunnelPanel";
import { OpportunitiesSection } from "@/components/OpportunitiesSection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Headphones, Users, DollarSign } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useFinancialAccess } from "@/hooks/useFinancialAccess";
import { cn } from "@/lib/utils";

type DashboardTab = "atendimentos" | "leads" | "financeiro";

const Dashboard = () => {
    const { data: userRole } = useUserRole();
    const { data: financialAccess } = useFinancialAccess();
    const [activeTab, setActiveTab] = useState<DashboardTab>("leads");

    const canViewFinancial = userRole === 'admin' || (userRole === 'supervisor' && financialAccess !== false);

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
                        userRole === 'agent' ? "grid-cols-1" : canViewFinancial ? "grid-cols-3" : "grid-cols-2"
                    )}>
                        {userRole !== 'agent' && (
                            <TabsTrigger value="atendimentos" className="flex items-center gap-2">
                                <Headphones className="h-4 w-4" />
                                <span className="hidden sm:inline">Atendimentos</span>
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="leads" className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <span className="hidden sm:inline">Negócios</span>
                        </TabsTrigger>
                        {canViewFinancial && (
                            <TabsTrigger value="financeiro" className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4" />
                                <span className="hidden sm:inline">Financeiro</span>
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
                        <LeadsFunnelPanel />
                    </div>
                )}

                {activeTab === "financeiro" && canViewFinancial && (
                    <FinancialDashboard />
                )}
            </div>
        </div>
    );
};

export default Dashboard;
