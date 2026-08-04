import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, User, Split, X, CalendarPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateSale, useUpdateSale } from "@/hooks/useSales";
import { useTeamMembers, useProfessionals } from "@/hooks/useFinancial";
import type { Sale, PaymentType } from "@/types/sales";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ServiceCascadePicker } from "@/components/services/ServiceCascadePicker";
import { AppointmentModal } from "@/components/scheduling/AppointmentModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const CREATE_APPOINTMENT = "_create";

interface ServiceLineItem {
    id: string; // temp id (create) ou sale.id (edição)
    serviceClientId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    minPrice: number;
    scheduled: boolean;
    appointmentId: string; // "" = nenhum; CREATE_APPOINTMENT = criar novo
    iaScheduling: boolean;
    iaContactDays: number;
}

interface SaleModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fixedContactId?: string; // Trava o cliente vindo do contexto da conversa
    sale?: Sale | null; // Venda existente (modo edição)
}

export function SaleModal({ open, onOpenChange, fixedContactId, sale }: SaleModalProps) {
    const isEditing = !!sale?.id;

    const [contactId, setContactId] = useState("");
    const [lines, setLines] = useState<ServiceLineItem[]>([]);

    // Pagamento
    const [paymentType, setPaymentType] = useState<PaymentType>("cash");
    const [installments, setInstallments] = useState(2);
    const [interestRate, setInterestRate] = useState(0);
    const [cashAmount, setCashAmount] = useState(0);
    const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
    const [teamMemberId, setTeamMemberId] = useState("");
    const [professionalId, setProfessionalId] = useState("");
    const [notes, setNotes] = useState("");

    // Fila de agendamentos a criar após salvar as vendas
    const [apptQueue, setApptQueue] = useState<{ serviceClientId: string }[]>([]);
    const [apptModalOpen, setApptModalOpen] = useState(false);

    const { data: teamMembers = [] } = useTeamMembers();
    const { data: professionals = [] } = useProfessionals();

    // Agendamentos futuros do contato (para vincular à venda)
    const { data: futureAppointments = [] } = useQuery({
        queryKey: ["contact-future-appointments", contactId],
        enabled: !!contactId && open,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("appointments")
                .select("id, service_name, professional_name, start_time, status, service_id")
                .eq("contact_id", contactId)
                .eq("type", "appointment")
                .in("status", ["pending", "confirmed", "waiting", "rescheduled"])
                .gte("start_time", new Date().toISOString())
                .order("start_time", { ascending: true });
            if (error) throw error;
            return (data || []) as any[];
        },
    });

    const createSale = useCreateSale();
    const updateSale = useUpdateSale();

    useEffect(() => {
        if (!open) return;
        setApptQueue([]);
        setApptModalOpen(false);
        if (sale) {
            setContactId(sale.contact_id || "");
            setLines([{
                id: sale.id,
                serviceClientId: sale.service_client_id || "",
                name: sale.product_name,
                quantity: sale.quantity,
                unitPrice: sale.unit_price,
                minPrice: 0,
                scheduled: !!sale.scheduled,
                appointmentId: sale.appointment_id || "",
                iaScheduling: !!sale.ia_scheduling,
                iaContactDays: sale.ia_contact_days ?? 30,
            }]);
            setPaymentType(sale.payment_type);
            setInstallments(sale.installments > 1 ? sale.installments : 2);
            setInterestRate(sale.interest_rate || 0);
            setCashAmount(sale.cash_amount || 0);
            setSaleDate(sale.sale_date);
            setTeamMemberId(sale.team_member_id || "");
            setProfessionalId(sale.professional_id || "");
            setNotes(sale.notes || "");
        } else {
            setContactId(fixedContactId || "");
            setLines([]);
            setPaymentType("cash");
            setInstallments(2);
            setInterestRate(0);
            setCashAmount(0);
            setSaleDate(new Date().toISOString().split("T")[0]);
            setTeamMemberId("");
            setProfessionalId("");
            setNotes("");
        }
    }, [open, fixedContactId, sale]);

    // Quantidade N no "Adicionar" explode em N linhas individuais
    const handleAddService = (app: { id: string; name: string; price: number; min_price: number }, quantity: number) => {
        setLines((prev) => [
            ...prev,
            ...Array.from({ length: quantity }, (_, i) => ({
                id: `tmp-${Date.now()}-${prev.length + i}`,
                serviceClientId: app.id,
                name: app.name,
                quantity: 1,
                unitPrice: app.price,
                minPrice: app.min_price ?? 0,
                scheduled: false,
                appointmentId: "",
                iaScheduling: false,
                iaContactDays: 30,
            })),
        ]);
    };

    const updateLine = (id: string, patch: Partial<ServiceLineItem>) => {
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    };

    const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

    const totalAmount = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

    const calculateInstallmentValue = () => {
        if (paymentType === "cash" || installments <= 1) return totalAmount;
        const base = paymentType === "mixed" ? Math.max(totalAmount - cashAmount, 0) : totalAmount;
        const avgTime = (installments + 1) / 2;
        const totalWithInterest = base * (1 + (interestRate / 100) * avgTime);
        return totalWithInterest / installments;
    };

    const installmentValue = calculateInstallmentValue();
    const totalWithInterest = (paymentType === "installment" || paymentType === "mixed") && installments > 1
        ? installmentValue * installments
        : totalAmount;

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

    const buildSaleFields = (line: ServiceLineItem) => ({
        scheduled: line.scheduled,
        appointment_id: line.scheduled && line.appointmentId && line.appointmentId !== CREATE_APPOINTMENT ? line.appointmentId : null,
        ia_scheduling: !line.scheduled && line.iaScheduling,
        ia_contact_days: !line.scheduled && line.iaScheduling ? Math.max(1, line.iaContactDays) : null,
        ia_scheduling_status: !line.scheduled && line.iaScheduling
            ? (isEditing && sale?.ia_scheduling ? sale.ia_scheduling_status || "pendente" : "pendente")
            : null,
    });

    const closeOrOpenApptQueue = (queue: { serviceClientId: string }[]) => {
        if (queue.length > 0 && contactId) {
            setApptQueue(queue);
            setApptModalOpen(true);
        } else {
            onOpenChange(false);
        }
    };

    const handleApptModalChange = (openState: boolean) => {
        setApptModalOpen(openState);
        if (!openState) {
            const rest = apptQueue.slice(1);
            setApptQueue(rest);
            if (rest.length > 0) {
                setApptModalOpen(true);
            } else {
                onOpenChange(false);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (lines.length === 0) {
            toast.error("Adicione pelo menos um serviço");
            return;
        }

        if (paymentType === "mixed") {
            if (cashAmount <= 0) {
                toast.error("Informe o valor à vista");
                return;
            }
            if (cashAmount >= totalAmount) {
                toast.error("Valor à vista deve ser menor que o total");
                return;
            }
        }

        try {
            if (isEditing && sale) {
                const line = lines[0];
                const lineTotal = line.quantity * line.unitPrice;
                await updateSale.mutateAsync({
                    id: sale.id,
                    data: {
                        category: "service",
                        product_name: line.name,
                        quantity: line.quantity,
                        unit_price: line.unitPrice,
                        total_amount: lineTotal,
                        payment_type: paymentType,
                        installments: paymentType === "cash" || paymentType === "pending" ? 1 : installments,
                        interest_rate: paymentType === "cash" || paymentType === "pending" ? 0 : interestRate,
                        cash_amount: paymentType === "mixed" ? cashAmount : paymentType === "cash" ? lineTotal : 0,
                        sale_date: saleDate,
                        team_member_id: teamMemberId || undefined,
                        professional_id: professionalId || undefined,
                        notes: notes || undefined,
                        contact_id: contactId || undefined,
                        service_client_id: line.serviceClientId || undefined,
                        ...buildSaleFields(line),
                    },
                });
                const queue = line.scheduled && line.appointmentId === CREATE_APPOINTMENT
                    ? [{ serviceClientId: line.serviceClientId }]
                    : [];
                closeOrOpenApptQueue(queue);
            } else {
                let cashDistributed = 0;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const lineTotal = line.quantity * line.unitPrice;
                    const isLast = i === lines.length - 1;

                    let lineCash = 0;
                    if (paymentType === "mixed") {
                        lineCash = isLast
                            ? Math.round((cashAmount - cashDistributed) * 100) / 100
                            : Math.round((cashAmount * lineTotal / totalAmount) * 100) / 100;
                        cashDistributed += lineCash;
                    } else if (paymentType === "cash") {
                        lineCash = lineTotal;
                    }

                    await createSale.mutateAsync({
                        category: "service",
                        product_name: line.name,
                        quantity: line.quantity,
                        unit_price: line.unitPrice,
                        total_amount: lineTotal,
                        payment_type: paymentType,
                        installments: paymentType === "cash" || paymentType === "pending" ? 1 : installments,
                        interest_rate: paymentType === "cash" || paymentType === "pending" ? 0 : interestRate,
                        cash_amount: lineCash,
                        sale_date: saleDate,
                        team_member_id: teamMemberId || undefined,
                        professional_id: professionalId || undefined,
                        notes: notes || undefined,
                        contact_id: contactId || undefined,
                        service_client_id: line.serviceClientId || undefined,
                        ...buildSaleFields(line),
                    });
                }

                toast.success(`${lines.length} ${lines.length === 1 ? "venda criada" : "vendas criadas"} com sucesso!`);
                const queue = lines
                    .filter((l) => l.scheduled && l.appointmentId === CREATE_APPOINTMENT)
                    .map((l) => ({ serviceClientId: l.serviceClientId }));
                closeOrOpenApptQueue(queue);
            }
        } catch (error) {
            console.error("Error saving sale:", error);
            toast.error(isEditing ? "Erro ao atualizar venda" : "Erro ao criar vendas");
        }
    };

    const isPending = createSale.isPending || updateSale.isPending;

    return (
        <>
        <Dialog open={open && !apptModalOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{isEditing ? "Editar Venda" : "Nova Venda"}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
                        {/* Cliente */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Cliente
                            </Label>
                            <ContactPicker
                                value={contactId}
                                onChange={(val) => setContactId(val || "")}
                                placeholder="Selecione o cliente (opcional)"
                                disabled={!!fixedContactId}
                            />
                        </div>

                        {/* Adicionar serviço (cascata) */}
                        {!isEditing && (
                            <div className="border rounded-lg p-3 space-y-3 bg-muted/10 dark:bg-white/5">
                                <Label className="text-sm font-medium">Adicionar Serviço</Label>
                                <ServiceCascadePicker onAdd={handleAddService} showQuantity />
                            </div>
                        )}

                        {/* Linhas de serviço */}
                        {lines.map((line) => (
                            <div key={line.id} className="p-3 border rounded-lg bg-muted/30 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium truncate flex-1">{line.name}</span>
                                    <span className="text-sm font-medium text-green-600">
                                        {formatCurrency(line.quantity * line.unitPrice)}
                                    </span>
                                    {!isEditing && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                            onClick={() => removeLine(line.id)}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground">Quantidade</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={line.quantity}
                                            onChange={(e) => updateLine(line.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                            className="h-9"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground">Valor Unit. (R$)</Label>
                                        <CurrencyInput
                                            value={line.unitPrice}
                                            onChange={(val) => updateLine(line.id, { unitPrice: Math.max(line.minPrice, val) })}
                                            className="h-9"
                                        />
                                        {line.minPrice > 0 && (
                                            <span className="text-[9px] text-muted-foreground">Mín: {formatCurrency(line.minPrice)}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Agendamento */}
                                <div className="border-t pt-2.5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs">Serviço Agendado</Label>
                                        <Switch
                                            checked={line.scheduled}
                                            onCheckedChange={(checked) => updateLine(line.id, {
                                                scheduled: checked,
                                                appointmentId: "",
                                                iaScheduling: false,
                                            })}
                                        />
                                    </div>

                                    {line.scheduled ? (
                                        <div>
                                            <Label className="text-[10px] text-muted-foreground">Agendamento</Label>
                                            <Select
                                                value={line.appointmentId || "_none"}
                                                onValueChange={(val) => updateLine(line.id, { appointmentId: val === "_none" ? "" : val })}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="_none" disabled>Selecione</SelectItem>
                                                    {futureAppointments.map((apt) => (
                                                        <SelectItem key={apt.id} value={apt.id}>
                                                            {format(new Date(apt.start_time), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                            {apt.service_name ? ` — ${apt.service_name}` : ""}
                                                        </SelectItem>
                                                    ))}
                                                    <SelectItem value={CREATE_APPOINTMENT}>
                                                        <span className="flex items-center gap-2">
                                                            <CalendarPlus className="w-4 h-4" />
                                                            Criar agendamento
                                                        </span>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {!contactId && (
                                                <span className="text-[10px] text-destructive">Selecione o cliente para vincular agendamento</span>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs">Agendamento IA</Label>
                                                <Switch
                                                    checked={line.iaScheduling}
                                                    onCheckedChange={(checked) => updateLine(line.id, { iaScheduling: checked })}
                                                />
                                            </div>
                                            {line.iaScheduling && (
                                                <div>
                                                    <Label className="text-[10px] text-muted-foreground">Dias para contato</Label>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        value={line.iaContactDays}
                                                        onChange={(e) => updateLine(line.id, { iaContactDays: Math.max(1, parseInt(e.target.value) || 1) })}
                                                        className="h-9"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Total */}
                        {lines.length > 0 && (
                            <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">Valor Total</span>
                                    <span className="text-2xl font-bold text-green-600">
                                        {formatCurrency(totalAmount)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Forma de pagamento */}
                        <div className="space-y-2">
                            <Label>Forma de Pagamento *</Label>
                            <Select
                                value={paymentType}
                                onValueChange={(value: PaymentType) => {
                                    setPaymentType(value);
                                    if (value === "cash") {
                                        setInstallments(2);
                                        setInterestRate(0);
                                        setCashAmount(0);
                                    }
                                    if (value !== "mixed") {
                                        setCashAmount(0);
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">À Vista</SelectItem>
                                    <SelectItem value="installment">Parcelado</SelectItem>
                                    <SelectItem value="pending">Pendente</SelectItem>
                                    <SelectItem value="mixed">
                                        <span className="flex items-center gap-2">
                                            <Split className="w-4 h-4" />
                                            Misto (Vista + Parcelado)
                                        </span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Misto: valor à vista */}
                        {paymentType === "mixed" && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="space-y-2">
                                    <Label>Valor à Vista</Label>
                                    <CurrencyInput
                                        value={cashAmount}
                                        onChange={(val) => {
                                            const maxCash = totalAmount > 0 ? totalAmount - 0.01 : 0;
                                            setCashAmount(Math.min(Math.max(val, 0), maxCash));
                                        }}
                                    />
                                </div>
                                <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-md text-sm">
                                    <p className="text-muted-foreground">
                                        Restante a parcelar: <span className="font-medium text-foreground">{formatCurrency(Math.max(totalAmount - cashAmount, 0))}</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Parcelamento */}
                        {(paymentType === "installment" || paymentType === "mixed") && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Parcelas</Label>
                                        <Select
                                            value={String(installments)}
                                            onValueChange={(val) => setInstallments(parseInt(val))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((n) => (
                                                    <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Juros % (a.m.)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={10}
                                            step={0.1}
                                            value={interestRate}
                                            onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                </div>

                                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-md text-sm">
                                    <p className="font-medium">{installments}x de {formatCurrency(installmentValue)}</p>
                                    {interestRate > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            Total com juros: {formatCurrency(totalWithInterest)}
                                        </p>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Data */}
                        <div className="space-y-2">
                            <Label>Data *</Label>
                            <Input
                                type="date"
                                value={saleDate}
                                onChange={(e) => setSaleDate(e.target.value)}
                            />
                        </div>

                        {/* Atendente */}
                        <div className="space-y-2">
                            <Label>Atendente (opcional)</Label>
                            <Select
                                value={teamMemberId || "_none"}
                                onValueChange={(val) => setTeamMemberId(val === "_none" ? "" : val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_none">Nenhum</SelectItem>
                                    {teamMembers.map((member: any) => (
                                        <SelectItem key={member.id} value={member.id}>
                                            {member.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Profissional */}
                        <div className="space-y-2">
                            <Label>Profissional (opcional)</Label>
                            <Select
                                value={professionalId || "_none"}
                                onValueChange={(val) => setProfessionalId(val === "_none" ? "" : val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_none">Nenhum</SelectItem>
                                    {professionals.map((prof: any) => (
                                        <SelectItem key={prof.id} value={prof.id}>
                                            {prof.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Observações */}
                        <div className="space-y-2">
                            <Label>Observações</Label>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Observações adicionais..."
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-4 border-t mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isPending || lines.length === 0}
                        >
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isEditing ? "Salvar Alterações" : `Registrar ${lines.length > 1 ? `${lines.length} Vendas` : "Venda"}`}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        {/* Criação de agendamento vinculado (fila pós-venda; trigger do banco vincula a venda pendente) */}
        {apptQueue.length > 0 && contactId && (
            <AppointmentModal
                open={apptModalOpen}
                onOpenChange={handleApptModalChange}
                defaultContactId={contactId}
                defaultServiceId={apptQueue[0].serviceClientId}
                hideTypeTabs
            />
        )}
        </>
    );
}
