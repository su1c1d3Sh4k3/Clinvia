import { useState, useEffect } from "react";
import { MonitoramentoTab } from "@/components/dashboard/monitoramento/MonitoramentoTab";
import { NotificationsBoard } from "@/components/dashboard/NotificationsBoard";
import { SalesDashboard } from "@/components/dashboard/SalesDashboard";
import { CrmDashboard } from "@/components/dashboard/crm/CrmDashboard";
import { AgendamentosDashboard } from "@/components/dashboard/agendamentos/AgendamentosDashboard";
import { CampanhasDashboard } from "@/components/dashboard/campanhas/CampanhasDashboard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Headphones, Users, ShoppingCart, CalendarDays, Megaphone } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useFinancialAccess } from "@/hooks/useFinancialAccess";
import { cn } from "@/lib/utils";

type DashboardTab = "monitoramento" | "crm" | "vendas" | "agendamentos" | "campanhas";

const Dashboard = () => {
    const { data: userRole } = useUserRole();
    const { data: financialAccess } = useFinancialAccess();
    const [activeTab, setActiveTab] = useState<DashboardTab>("crm");

    const canViewSales = userRole === 'admin' || (userRole === 'supervisor' && financialAccess !== false);

    // Forçar aba "crm" para agentes
    useEffect(() => {
        if (userRole === 'agent') {
            setActiveTab("crm");
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
                        "grid w-full max-w-3xl mx-auto",
                        userRole === 'agent' ? "grid-cols-1" : canViewSales ? "grid-cols-5" : "grid-cols-4"
                    )}>
                        {userRole !== 'agent' && (
                            <TabsTrigger
                                value="monitoramento"
                                className="flex items-center gap-2"
                            >
                                <Headphones className="h-4 w-4 shrink-0 transition-transform duration-300 data-[state=active]:scale-110" />
                                <span className="hidden sm:inline truncate">Monitoramento</span>
                            </TabsTrigger>
                        )}
                        <TabsTrigger
                            value="crm"
                            className="flex items-center gap-2"
                        >
                            <Users className="h-4 w-4 shrink-0 transition-transform duration-300 data-[state=active]:scale-110" />
                            <span className="hidden sm:inline">CRM</span>
                        </TabsTrigger>
                        {canViewSales && (
                            <TabsTrigger
                                value="vendas"
                                className="flex items-center gap-2"
                            >
                                <ShoppingCart className="h-4 w-4 shrink-0 transition-transform duration-300 data-[state=active]:scale-110" />
                                <span className="hidden sm:inline">Vendas</span>
                            </TabsTrigger>
                        )}
                        {userRole !== 'agent' && (
                            <TabsTrigger
                                value="agendamentos"
                                className="flex items-center gap-2"
                            >
                                <CalendarDays className="h-4 w-4 shrink-0 transition-transform duration-300 data-[state=active]:scale-110" />
                                <span className="hidden sm:inline truncate">Agendamentos</span>
                            </TabsTrigger>
                        )}
                        {userRole !== 'agent' && (
                            <TabsTrigger
                                value="campanhas"
                                className="flex items-center gap-2"
                            >
                                <Megaphone className="h-4 w-4 shrink-0 transition-transform duration-300 data-[state=active]:scale-110" />
                                <span className="hidden sm:inline">Campanhas</span>
                            </TabsTrigger>
                        )}
                    </TabsList>
                </Tabs>

                {/* Tab Content */}
                {activeTab === "monitoramento" && userRole !== 'agent' && (
                    <MonitoramentoTab />
                )}

                {activeTab === "crm" && <CrmDashboard />}

                {activeTab === "vendas" && canViewSales && (
                    <SalesDashboard />
                )}

                {activeTab === "agendamentos" && userRole !== 'agent' && (
                    <AgendamentosDashboard />
                )}

                {activeTab === "campanhas" && userRole !== 'agent' && (
                    <CampanhasDashboard />
                )}
            </div>
        </div>
    );
};

export default Dashboard;

