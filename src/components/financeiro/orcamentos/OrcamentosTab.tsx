import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ClientProfileModal } from "@/components/contacts/ClientProfileModal";
import { OrcamentoModal } from "@/components/orcamentos/OrcamentoModal";
import { PeriodFilter, resolvePeriod, type PeriodKey } from "@/components/financeiro/PeriodFilter";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrcamentoCards } from "@/hooks/useFinanceiro";
import { OrcamentoCards } from "./OrcamentoCards";
import { OrcamentoChart } from "./OrcamentoChart";
import { OrcamentosTable } from "./OrcamentosTable";
import { OrcamentosPorProfissional } from "./OrcamentosPorProfissional";
import { RankingServicosOrcados } from "./RankingServicosOrcados";

export function OrcamentosTab() {
    const [period, setPeriod] = useState<PeriodKey>("todo");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [criarOpen, setCriarOpen] = useState(false);
    const [selectedContact, setSelectedContact] = useState<{ id: string; push_name: string } | null>(null);

    const { data: role } = useUserRole();
    const { canCreate } = usePermissions();
    const podeCriar = role === "admin" || canCreate("orcamentos");

    const range = resolvePeriod(period, customStart, customEnd);
    const { data: cards, isLoading } = useOrcamentoCards(range.start, range.end);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3" data-tour="financeiro-filtro">
                <PeriodFilter
                    period={period}
                    onPeriodChange={setPeriod}
                    customStart={customStart}
                    customEnd={customEnd}
                    onCustomStartChange={setCustomStart}
                    onCustomEndChange={setCustomEnd}
                />
                {podeCriar && (
                    <Button onClick={() => setCriarOpen(true)} data-tour="financeiro-criar-orcamento">
                        <Plus className="w-4 h-4 mr-2" />
                        Criar orçamento
                    </Button>
                )}
            </div>

            <div data-tour="financeiro-cards">
                <OrcamentoCards data={cards} isLoading={isLoading} />
            </div>

            <div data-tour="financeiro-grafico">
                <OrcamentoChart />
            </div>

            <div data-tour="financeiro-tabela">
                <OrcamentosTable onOpenContact={setSelectedContact} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-tour="financeiro-rankings">
                <OrcamentosPorProfissional />
                <RankingServicosOrcados />
            </div>

            <OrcamentoModal open={criarOpen} onOpenChange={setCriarOpen} />

            <ClientProfileModal
                open={!!selectedContact}
                onOpenChange={(open) => !open && setSelectedContact(null)}
                contact={selectedContact}
                defaultTab="orcamentos"
            />
        </div>
    );
}
