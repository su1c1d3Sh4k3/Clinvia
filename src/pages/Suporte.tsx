import { ComponentType } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    LayoutDashboard, MessageSquare, KanbanSquare, Package, FileText, Users, ShieldCheck,
    Calendar, Repeat, Megaphone, Bot, Plug, Settings, Headphones, DollarSign, LucideIcon,
} from "lucide-react";
import { SuporteChatGuide } from "@/components/suporte/SuporteChatGuide";
import { CampaignsGuide } from "@/components/suporte/CampaignsGuide";
import { IaGuide } from "@/components/suporte/IaGuide";
import { InboxGuide } from "@/components/suporte/InboxGuide";
import { CrmGuide } from "@/components/suporte/CrmGuide";
import { AgendaGuide } from "@/components/suporte/AgendaGuide";
import { DashboardGuide } from "@/components/suporte/DashboardGuide";
import { ClientesGuide } from "@/components/suporte/ClientesGuide";
import { ServicosGuide } from "@/components/suporte/ServicosGuide";
import { ConexoesGuide } from "@/components/suporte/ConexoesGuide";
import { EquipeGuide } from "@/components/suporte/EquipeGuide";
import { ConfiguracoesGuide } from "@/components/suporte/ConfiguracoesGuide";
import { RecorrenciaGuide } from "@/components/suporte/RecorrenciaGuide";
import { OrcamentosGuide } from "@/components/suporte/OrcamentosGuide";
import { FinanceiroGuide } from "@/components/suporte/FinanceiroGuide";
import { useUrlTab } from "@/hooks/useUrlTab";

interface GuideTab {
    value: string;
    label: string;
    icon: LucideIcon;
    component: ComponentType;
}

/** Ordem espelha a sidebar do sistema. */
const GUIDE_TABS: GuideTab[] = [
    { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, component: DashboardGuide },
    { value: "inbox", label: "Inbox", icon: MessageSquare, component: InboxGuide },
    { value: "crm", label: "CRM", icon: KanbanSquare, component: CrmGuide },
    { value: "servicos", label: "Serviços", icon: Package, component: ServicosGuide },
    { value: "orcamentos", label: "Orçamentos", icon: FileText, component: OrcamentosGuide },
    { value: "clientes", label: "Clientes", icon: Users, component: ClientesGuide },
    { value: "equipe", label: "Equipe", icon: ShieldCheck, component: EquipeGuide },
    { value: "agenda", label: "Agenda", icon: Calendar, component: AgendaGuide },
    { value: "recorrencia", label: "Recorrência", icon: Repeat, component: RecorrenciaGuide },
    { value: "campanhas", label: "Campanhas", icon: Megaphone, component: CampaignsGuide },
    { value: "ia", label: "IA", icon: Bot, component: IaGuide },
    { value: "conexoes", label: "Conexões", icon: Plug, component: ConexoesGuide },
    { value: "financeiro", label: "Financeiro", icon: DollarSign, component: FinanceiroGuide },
    { value: "configuracoes", label: "Configurações", icon: Settings, component: ConfiguracoesGuide },
    { value: "atendimento", label: "Falar com o suporte", icon: Headphones, component: SuporteChatGuide },
];

/**
 * Página Suporte — manual interativo do sistema.
 * Cada aba documenta uma ferramenta, na mesma ordem da sidebar.
 */
export default function Suporte() {
    const [tab, setTab] = useUrlTab("dashboard");
    return (
        <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
            <div className="mb-4">
                <h1 className="text-2xl font-bold">Suporte</h1>
                <p className="text-sm text-muted-foreground">
                    Manuais interativos das ferramentas do sistema — aprenda no seu ritmo, com exemplos e simulações.
                </p>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="mb-4 flex w-full justify-start overflow-x-auto flex-nowrap">
                    {GUIDE_TABS.map((t) => (
                        <TabsTrigger key={t.value} value={t.value} className="shrink-0 gap-1.5">
                            <t.icon className="h-4 w-4" />
                            {t.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {GUIDE_TABS.map((t) => (
                    <TabsContent key={t.value} value={t.value}>
                        <t.component />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
