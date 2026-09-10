import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useServiceDisplayNames } from "@/hooks/useServiceDisplayNames";
import { useOrcamentoBranding } from "@/hooks/useOrcamentoBranding";
import { Orcamento, fetchOrcamentoParaPdf } from "@/hooks/useOrcamentos";
import { exportOrcamentoPdf } from "@/lib/orcamentoPdf";
import { formatPhoneNumber } from "@/utils/formatters";

interface ExportOrcamentoButtonProps {
    /** Orçamento já carregado (aba do cliente). */
    orcamento?: Orcamento;
    /** Só o id (Financeiro): itens e cliente são buscados no clique. */
    orcamentoId?: string;
    clienteNome?: string;
    clienteTelefone?: string | null;
    className?: string;
    /** Só o ícone, para caber na coluna de ação da tabela. */
    iconOnly?: boolean;
}

/**
 * Exporta o orçamento em PDF. Fica fora dos gates de permissão de venda/edição
 * de propósito: o documento pode ser reenviado ao paciente mesmo depois de
 * expirado ou já vendido.
 */
export function ExportOrcamentoButton({
    orcamento,
    orcamentoId,
    clienteNome,
    clienteTelefone,
    className,
    iconOnly,
}: ExportOrcamentoButtonProps) {
    const [busy, setBusy] = useState(false);
    const { resolveServiceName } = useServiceDisplayNames();
    const { data: branding } = useOrcamentoBranding();

    const handleClick = async () => {
        setBusy(true);
        try {
            let orc = orcamento;
            let nome = clienteNome ?? "";
            let telefone = clienteTelefone ?? null;

            if (!orc) {
                if (!orcamentoId) throw new Error("Orçamento não identificado.");
                const fetched = await fetchOrcamentoParaPdf(orcamentoId);
                orc = fetched.orcamento;
                nome = nome || fetched.clienteNome;
                telefone = telefone ?? fetched.clienteTelefone;
            }

            // Decisão do user: o PDF é o documento que vai para a mão do paciente,
            // então lista só o que ainda está em aberto.
            const pendentes = orc.itens.filter((i) => i.status === "pendente");
            if (pendentes.length === 0) {
                toast.error("Este orçamento não tem itens pendentes para exportar.");
                return;
            }

            await exportOrcamentoPdf(
                {
                    id: orc.id,
                    criadoEm: orc.created_at,
                    validade: orc.validade,
                    indicacao: orc.indicacao,
                    notes: orc.notes,
                    clienteNome: nome,
                    clienteTelefone: telefone ? formatPhoneNumber(telefone) : null,
                    profissional: orc.responsavel?.name ?? null,
                    profissionalCargo: orc.responsavel?.role ?? null,
                    criadoPor: orc.criado_por?.name ?? null,
                    itens: pendentes.map((i) => ({
                        nome: resolveServiceName(i.service_client_id, i.service_name),
                        valor: Number(i.unit_price),
                    })),
                },
                branding || {},
            );
        } catch (err: any) {
            toast.error(err?.message || "Não foi possível gerar o PDF.");
        } finally {
            setBusy(false);
        }
    };

    const Icon = busy ? Loader2 : FileDown;

    return (
        <Button
            size="sm"
            variant="outline"
            className={className ?? "h-7 text-xs gap-1"}
            onClick={handleClick}
            disabled={busy}
            title="Exportar orçamento em PDF"
        >
            <Icon className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
            {!iconOnly && "Exportar PDF"}
        </Button>
    );
}
