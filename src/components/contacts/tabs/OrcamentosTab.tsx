import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Plus } from "lucide-react";
import { useOrcamentos, isOrcamentoExpirado } from "@/hooks/useOrcamentos";
import { usePermissions } from "@/hooks/usePermissions";
import { OrcamentoCard } from "@/components/orcamentos/OrcamentoCard";
import { OrcamentoModal } from "@/components/orcamentos/OrcamentoModal";

interface OrcamentosTabProps {
    contactId: string;
}

export const OrcamentosTab = ({ contactId }: OrcamentosTabProps) => {
    const [modalOpen, setModalOpen] = useState(false);
    const { data: orcamentos, isLoading } = useOrcamentos(contactId);
    const { canCreate } = usePermissions();

    if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

    return (
        <div className="space-y-3">
            {canCreate("orcamentos") && (
                <Button size="sm" className="gap-1 text-xs" onClick={() => setModalOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> Novo orçamento
                </Button>
            )}

            {(!orcamentos || orcamentos.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FileText className="w-10 h-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhum orçamento para este cliente.</p>
                </div>
            ) : (
                orcamentos.map((o) => (
                    <OrcamentoCard key={o.id} orcamento={o} readOnly={isOrcamentoExpirado(o)} />
                ))
            )}

            <OrcamentoModal open={modalOpen} onOpenChange={setModalOpen} contactId={contactId} />
        </div>
    );
};
