import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, ShoppingCart } from "lucide-react";
import { useUrlTab } from "@/hooks/useUrlTab";
import { useFinancialAccess } from "@/hooks/useFinancialAccess";
import { useSuporteTour } from "@/lib/suporteTours";
import { OrcamentosTab } from "@/components/financeiro/orcamentos/OrcamentosTab";
import { VendasTab } from "@/components/financeiro/vendas/VendasTab";

const Financial = () => {
    const { data: hasAccess, isLoading } = useFinancialAccess();
    const [activeTab, setActiveTab] = useUrlTab("orcamentos");

    useSuporteTour(!isLoading && !!hasAccess);

    if (isLoading) return null;

    if (!hasAccess) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-muted-foreground text-sm text-center">
                    Você não tem permissão para acessar o Financeiro.
                    <br />
                    Peça ao administrador para liberar em Configurações &gt; Permissões.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-4 md:space-y-8 p-4 md:p-8 pt-4 md:pt-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Financeiro</h2>
            </div>

            <div className="space-y-4 md:space-y-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList data-tour="financeiro-tabs" className="grid w-full max-w-md grid-cols-2">
                        <TabsTrigger value="orcamentos" className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 transition-transform duration-300 data-[state=active]:scale-110" />
                            Orçamentos
                        </TabsTrigger>
                        <TabsTrigger value="vendas" className="flex items-center gap-2">
                            <ShoppingCart className="h-4 w-4 shrink-0 transition-transform duration-300 data-[state=active]:scale-110" />
                            Vendas
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {activeTab === "vendas" ? <VendasTab /> : <OrcamentosTab />}
            </div>
        </div>
    );
};

export default Financial;
