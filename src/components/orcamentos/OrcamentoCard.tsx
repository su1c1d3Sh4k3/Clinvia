import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { CheckCircle2, Clock, Pencil, ShoppingCart, Trash2, XCircle } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
    Orcamento,
    OrcamentoItemStatus,
    hasPendentes,
    isOrcamentoExpirado,
    orcamentoTotal,
    useDeleteOrcamento,
} from "@/hooks/useOrcamentos";
import { OrcamentoModal } from "./OrcamentoModal";
import { LancarVendaWizard } from "./LancarVendaWizard";
import { toast } from "sonner";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string) => new Date(d.includes("T") ? d : `${d}T00:00:00`).toLocaleDateString("pt-BR");

function StatusIcon({ status }: { status: OrcamentoItemStatus }) {
    if (status === "vendido") return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
    if (status === "recusado") return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
    if (status === "expirado") return <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />;
    return <Clock className="w-4 h-4 text-amber-500 shrink-0" />;
}

const STATUS_LABEL: Record<OrcamentoItemStatus, string> = {
    pendente: "Pendente",
    vendido: "Vendido",
    recusado: "Recusado",
    expirado: "Expirado",
};

interface OrcamentoCardProps {
    orcamento: Orcamento;
    /** Esconde os botões (ex.: orçamento expirado ou recorte só-leitura) */
    readOnly?: boolean;
}

export function OrcamentoCard({ orcamento, readOnly }: OrcamentoCardProps) {
    const [editOpen, setEditOpen] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const { canCreate, canEdit, canDelete } = usePermissions();
    const deleteOrcamento = useDeleteOrcamento();

    const expirado = isOrcamentoExpirado(orcamento);
    const pendentes = hasPendentes(orcamento);
    const todosPendentes = orcamento.itens.every((i) => i.status === "pendente");
    const bloqueado = readOnly || expirado;

    const podeVender = !bloqueado && pendentes && canCreate("sales");
    const podeEditar = !bloqueado && pendentes && canEdit("orcamentos");
    const podeExcluir = !bloqueado && todosPendentes && canDelete("orcamentos");

    const handleDelete = async () => {
        try {
            await deleteOrcamento.mutateAsync(orcamento.id);
            toast.success("Orçamento excluído");
        } catch (err: any) {
            toast.error(err?.message || "Erro ao excluir orçamento");
        }
    };

    return (
        <>
            <div className="border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm font-medium">Orçamento de {fmtDate(orcamento.created_at)}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                            {orcamento.responsavel?.name || "Sem profissional"}
                            {orcamento.responsavel?.role ? ` — ${orcamento.responsavel.role}` : ""}
                        </p>
                    </div>
                    <span className="text-sm font-semibold text-green-600 shrink-0">{fmt(orcamentoTotal(orcamento))}</span>
                </div>

                <div className="space-y-1">
                    {orcamento.itens.map((i) => (
                        <div key={i.id} className="flex items-center gap-2 text-xs">
                            <StatusIcon status={i.status} />
                            <span className="truncate flex-1">{i.service_name}</span>
                            <span className="text-muted-foreground shrink-0">{fmt(Number(i.unit_price))}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0 w-16 text-right">{STATUS_LABEL[i.status]}</span>
                        </div>
                    ))}
                </div>

                {(orcamento.indicacao || orcamento.validade || orcamento.notes) && (
                    <div className="text-[11px] text-muted-foreground space-y-0.5 border-t pt-2">
                        {orcamento.indicacao && <p>Indicação: {orcamento.indicacao}</p>}
                        {orcamento.validade && (
                            <p className={expirado ? "text-destructive" : ""}>
                                Validade: {fmtDate(orcamento.validade)}{expirado ? " (expirado)" : ""}
                            </p>
                        )}
                        {orcamento.notes && <p className="whitespace-pre-wrap">{orcamento.notes}</p>}
                    </div>
                )}

                {(podeVender || podeEditar || podeExcluir) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {podeVender && (
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setWizardOpen(true)}>
                                <ShoppingCart className="w-3 h-3" /> Lançar venda
                            </Button>
                        )}
                        {podeEditar && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditOpen(true)}>
                                <Pencil className="w-3 h-3" /> Editar
                            </Button>
                        )}
                        {podeExcluir && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                                onClick={() => setConfirmDelete(true)}
                            >
                                <Trash2 className="w-3 h-3" /> Excluir
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {editOpen && (
                <OrcamentoModal
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    contactId={orcamento.contact_id}
                    orcamento={orcamento}
                />
            )}

            {wizardOpen && (
                <LancarVendaWizard open={wizardOpen} onOpenChange={setWizardOpen} orcamento={orcamento} />
            )}

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O orçamento e todos os seus itens serão apagados. Essa ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
