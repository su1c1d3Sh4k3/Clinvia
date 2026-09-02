import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ServiceCascadePicker } from "@/components/services/ServiceCascadePicker";
import { ContactPicker } from "@/components/ui/contact-picker";
import { useResponsaveis } from "@/hooks/useResponsaveis";
import {
    Orcamento,
    OrcamentoItemInput,
    useCreateOrcamento,
    useIndicacoes,
    useUpdateOrcamento,
} from "@/hooks/useOrcamentos";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface Line {
    key: string;
    service_client_id: string;
    name: string;
    unit_price: number;
    min_price: number;
}

interface OrcamentoModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Ausente quando o orçamento nasce fora da ficha do cliente (ex.: /financial) — aí o modal pede o contato. */
    contactId?: string;
    /** Quando presente, edita o orçamento (só os itens pendentes). */
    orcamento?: Orcamento | null;
}

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function OrcamentoModal({ open, onOpenChange, contactId, orcamento }: OrcamentoModalProps) {
    const isEditing = !!orcamento;
    const [lines, setLines] = useState<Line[]>([]);
    const [responsavelId, setResponsavelId] = useState("");
    const [indicacao, setIndicacao] = useState("");
    const [validade, setValidade] = useState("");
    const [notes, setNotes] = useState("");
    const [pickedContactId, setPickedContactId] = useState("");
    const needsContactPicker = !contactId && !isEditing;
    const effectiveContactId = contactId || orcamento?.contact_id || pickedContactId;

    const { data: responsaveis = [] } = useResponsaveis();
    const { data: indicacoes = [] } = useIndicacoes(indicacao);
    const createOrcamento = useCreateOrcamento();
    const updateOrcamento = useUpdateOrcamento();

    const decididos = (orcamento?.itens || []).filter((i) => i.status !== "pendente");

    useEffect(() => {
        if (!open) return;
        if (orcamento) {
            setLines(
                orcamento.itens
                    .filter((i) => i.status === "pendente")
                    .map((i, idx) => ({
                        key: `edit-${i.id}-${idx}`,
                        service_client_id: i.service_client_id || "",
                        name: i.service_name,
                        unit_price: Number(i.unit_price),
                        min_price: Number(i.min_price ?? 0),
                    })),
            );
            setResponsavelId(orcamento.responsavel_id);
            setIndicacao(orcamento.indicacao || "");
            setValidade(orcamento.validade || "");
            setNotes(orcamento.notes || "");
        } else {
            setLines([]);
            setResponsavelId("");
            setIndicacao("");
            setValidade("");
            setNotes("");
            setPickedContactId("");
        }
    }, [open, orcamento]);

    const handleAdd = (app: { id: string; name: string; price: number; min_price: number }, quantity: number) => {
        setLines((prev) => [
            ...prev,
            ...Array.from({ length: quantity }, (_, i) => ({
                key: `tmp-${Date.now()}-${prev.length + i}`,
                service_client_id: app.id,
                name: app.name,
                unit_price: Number(app.price || 0),
                min_price: Number(app.min_price || 0),
            })),
        ]);
    };

    const total = lines.reduce((acc, l) => acc + l.unit_price, 0);
    const isPending = createOrcamento.isPending || updateOrcamento.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!effectiveContactId) {
            toast.error("Selecione o cliente do orçamento");
            return;
        }
        if (!responsavelId) {
            toast.error("Selecione o profissional responsável");
            return;
        }
        if (lines.length === 0) {
            toast.error("Adicione pelo menos um serviço");
            return;
        }

        const itens: OrcamentoItemInput[] = lines.map((l) => ({
            service_client_id: l.service_client_id,
            service_name: l.name,
            unit_price: l.unit_price,
            min_price: l.min_price || null,
        }));

        const input = {
            contact_id: effectiveContactId,
            responsavel_id: responsavelId,
            indicacao: indicacao.trim() || null,
            validade: validade || null,
            notes: notes.trim() || null,
            itens,
        };

        try {
            if (isEditing && orcamento) {
                await updateOrcamento.mutateAsync({ id: orcamento.id, input });
                toast.success("Orçamento atualizado!");
            } else {
                await createOrcamento.mutateAsync(input);
                toast.success("Orçamento criado!");
            }
            onOpenChange(false);
        } catch (err: any) {
            console.error("Erro ao salvar orçamento:", err);
            toast.error(err?.message || "Erro ao salvar orçamento");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-lg">
                <DialogHeader className="shrink-0">
                    <DialogTitle>{isEditing ? "Editar Orçamento" : "Novo Orçamento"}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
                        {needsContactPicker && (
                            <div className="space-y-2">
                                <Label>Cliente *</Label>
                                <ContactPicker
                                    value={pickedContactId}
                                    onChange={(id) => setPickedContactId(id)}
                                    placeholder="Busque o cliente por nome ou número..."
                                    modal
                                />
                            </div>
                        )}

                        <div className="border rounded-lg p-3 space-y-3 bg-muted/10 dark:bg-white/5">
                            <Label className="text-sm font-medium">Adicionar Serviço</Label>
                            <ServiceCascadePicker onAdd={handleAdd} showQuantity excludeAvaliacao />
                            <p className="text-[10px] text-muted-foreground">
                                Serviços da categoria Avaliação não entram em orçamento — eles são apenas agendados.
                            </p>
                        </div>

                        {decididos.length > 0 && (
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Itens já decididos (não editáveis)</Label>
                                {decididos.map((i) => (
                                    <div key={i.id} className="flex items-center justify-between gap-2 text-xs px-3 py-2 border rounded-md bg-muted/30">
                                        <span className="truncate">{i.service_name}</span>
                                        <span className="shrink-0 text-muted-foreground">
                                            {fmt(Number(i.unit_price))} · {i.status === "vendido" ? "Vendido" : i.status === "recusado" ? "Recusado" : "Expirado"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {lines.map((line) => (
                            <div key={line.key} className="p-3 border rounded-lg bg-muted/30 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium truncate flex-1">{line.name}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div>
                                    <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                                    <CurrencyInput
                                        value={line.unit_price}
                                        onChange={(val) =>
                                            setLines((prev) =>
                                                prev.map((l) =>
                                                    l.key === line.key ? { ...l, unit_price: Math.max(l.min_price, val) } : l,
                                                ),
                                            )
                                        }
                                        className="h-9"
                                    />
                                    {line.min_price > 0 && (
                                        <span className="text-[9px] text-muted-foreground">Mín: {fmt(line.min_price)}</span>
                                    )}
                                </div>
                            </div>
                        ))}

                        {lines.length > 0 && (
                            <div className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-lg flex justify-between items-center">
                                <span className="font-medium">Valor Total</span>
                                <span className="text-2xl font-bold text-blue-600">{fmt(total)}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Profissional *</Label>
                            <Select value={responsavelId} onValueChange={setResponsavelId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o profissional" />
                                </SelectTrigger>
                                <SelectContent>
                                    {responsaveis.filter((r) => r.active || r.id === responsavelId).map((r) => (
                                        <SelectItem key={r.id} value={r.id}>
                                            {r.name}{r.role ? ` — ${r.role}` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Indicação</Label>
                            <Input
                                value={indicacao}
                                onChange={(e) => setIndicacao(e.target.value)}
                                placeholder="Quem indicou o cliente"
                                list="orcamento-indicacoes"
                                autoComplete="off"
                            />
                            <datalist id="orcamento-indicacoes">
                                {indicacoes.map((i) => (
                                    <option key={i} value={i} />
                                ))}
                            </datalist>
                        </div>

                        <div className="space-y-2">
                            <Label>Validade (opcional)</Label>
                            <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
                            <p className="text-[10px] text-muted-foreground">
                                Depois dessa data os itens pendentes viram “expirado” automaticamente.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Observações</Label>
                            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observações do orçamento..." />
                        </div>
                    </div>

                    <DialogFooter className="pt-4 border-t mt-4 shrink-0">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={isPending || lines.length === 0 || !effectiveContactId}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isEditing ? "Salvar Alterações" : "Criar Orçamento"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
