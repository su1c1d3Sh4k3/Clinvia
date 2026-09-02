import { useEffect, useMemo } from "react";
import { useUrlTab } from "@/hooks/useUrlTab";
import { MonitoramentoTab } from "@/components/dashboard/monitoramento/MonitoramentoTab";
import { MinhaContaTab } from "@/components/dashboard/minha-conta/MinhaContaTab";
import { SalesDashboard } from "@/components/dashboard/SalesDashboard";
import { CrmDashboard } from "@/components/dashboard/crm/CrmDashboard";
import { AgendamentosDashboard } from "@/components/dashboard/agendamentos/AgendamentosDashboard";
import { CampanhasDashboard } from "@/components/dashboard/campanhas/CampanhasDashboard";
import { RecorrenciaDashboard } from "@/components/dashboard/recorrencia/RecorrenciaDashboard";
import { SatisfacaoDashboard } from "@/components/dashboard/satisfacao/SatisfacaoDashboard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Headphones, Users, ShoppingCart, CalendarDays, Megaphone, RefreshCcw, Smile, Wallet, LucideIcon } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useDashboardTabAccess } from "@/hooks/useDashboardTabAccess";
import { useSuporteTour } from "@/lib/suporteTours";

type DashboardTab = "monitoramento" | "crm" | "vendas" | "agendamentos" | "campanhas" | "recorrencia" | "satisfacao" | "minha-conta";

const TABS: { value: DashboardTab; label: string; icon: LucideIcon; tour?: string; render: () => JSX.Element }[] = [
    { value: "minha-conta", label: "Minha Conta", icon: Wallet, tour: "dash-minha-conta", render: () => <MinhaContaTab /> },
    { value: "monitoramento", label: "Monitoramento", icon: Headphones, render: () => <MonitoramentoTab /> },
    { value: "crm", label: "CRM", icon: Users, render: () => <CrmDashboard /> },
    { value: "vendas", label: "Vendas", icon: ShoppingCart, render: () => <SalesDashboard /> },
    { value: "agendamentos", label: "Agendamentos", icon: CalendarDays, render: () => <AgendamentosDashboard /> },
    { value: "campanhas", label: "Campanhas", icon: Megaphone, render: () => <CampanhasDashboard /> },
    { value: "recorrencia", label: "Recorrência", icon: RefreshCcw, render: () => <RecorrenciaDashboard /> },
    { value: "satisfacao", label: "Satisfação", icon: Smile, render: () => <SatisfacaoDashboard /> },
];

const Dashboard = () => {
    const { data: userRole } = useUserRole();
    const { canSeeTab, isReady } = useDashboardTabAccess();
    const [urlTab, setActiveTab] = useUrlTab("crm");
    const activeTab = urlTab as DashboardTab;

    useSuporteTour(!!userRole);

    const visibleTabs = useMemo(
        () => (isReady ? TABS.filter(t => canSeeTab(t.value)) : []),
        [isReady, canSeeTab]
    );

    // Se a aba da URL não é permitida, cai na primeira liberada
    useEffect(() => {
        if (!isReady || visibleTabs.length === 0) return;
        if (!visibleTabs.some(t => t.value === activeTab)) {
            setActiveTab(visibleTabs[0].value);
        }
    }, [isReady, visibleTabs, activeTab]);

    const current = visibleTabs.find(t => t.value === activeTab);

    return (
        <div className="flex-1 space-y-4 md:space-y-8 p-4 md:p-8 pt-4 md:pt-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
            </div>

            {!isReady ? null : visibleTabs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Você não tem permissão para ver nenhuma aba do Dashboard.
                </div>
            ) : (
                <div className="space-y-4 md:space-y-6">
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)} className="w-full">
                        <TabsList
                            data-tour="dash-tabs"
                            className="grid w-full max-w-[89.6rem] mx-auto"
                            style={{ gridTemplateColumns: `repeat(${Math.max(visibleTabs.length, 1)}, minmax(0, 1fr))` }}
                        >
                            {visibleTabs.map(({ value, label, icon: Icon, tour }) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    data-tour={tour}
                                    className="flex items-center gap-2"
                                >
                                    <Icon className="h-4 w-4 shrink-0 transition-transform duration-300 data-[state=active]:scale-110" />
                                    <span className="hidden sm:inline">{label}</span>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    {current?.render()}
                </div>
            )}
        </div>
    );
};

export default Dashboard;
