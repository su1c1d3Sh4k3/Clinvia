import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useSalas } from "@/hooks/useResponsaveis";
import { useCrmAppointmentSync } from "@/hooks/useCrmAppointmentSync";
import { AppointmentDraft, AppointmentModal, commitAppointmentDraft } from "@/components/scheduling/AppointmentModal";
import { Orcamento, OrcamentoItem, lancarVendaDoOrcamento } from "@/hooks/useOrcamentos";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type PaymentType = "cash" | "installment" | "pending" | "mixed";

interface ItemConfig {
    price: number;
    salaId: string;
    paymentType: PaymentType;
    installments: number;
    interestRate: number;
    cashAmount: number;
    saleDate: string;
    agendar: boolean;
    iaScheduling: boolean;
    iaContactDays: number;
}

interface LancarVendaWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orcamento: Orcamento;
    onDone?: () => void;
}

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const today = () => new Date().toISOString().split("T")[0];

const defaultConfig = (item: OrcamentoItem): ItemConfig => ({
    price: Number(item.unit_price),
    salaId: "",
    paymentType: "pending",
    installments: 2,
    interestRate: 0,
    cashAmount: 0,
    saleDate: today(),
    agendar: false,
    iaScheduling: false,
    iaContactDays: 30,
});

export function LancarVendaWizard({ open, onOpenChange, orcamento, onDone }: LancarVendaWizardProps) {
    const pendentes = useMemo(() => orcamento.itens.filter((i) => i.status === "pendente"), [orcamento]);

    const [step, setStep] = useState(1);
    const [decisions, setDecisions] = useState<Record<string, "vender" | "recusar">>({});
    const [configs, setConfigs] = useState<Record<string, ItemConfig>>({});
    const [drafts, setDrafts] = useState<Record<string, AppointmentDraft>>({});
    const [apptIndex, setApptIndex] = useState(0);
    const [saving, setSaving] = useState(false);

    const { data: ownerId } = useOwnerId();
    const { data: salas = [] } = useSalas();
    const queryClient = useQueryClient();
    const { onAppointmentCreated: syncCrmOnCreate } = useCrmAppointmentSync();

    const { data: me } = useQuery({
        queryKey: ["my-team-member"],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;
            const { data, error } = await supabase
                .from("team_members")
                .select("id, name")
                .eq("auth_user_id", user.id)
                .maybeSingle();
            if (error) throw error;
            return data as { id: string; name: string } | null;
        },
    });

    const serviceIds = useMemo(
        () => pendentes.map((i) => i.service_client_id).filter(Boolean) as string[],
        [pendentes],
    );

    const { data: serviceRooms = {} } = useQuery({
        queryKey: ["orcamento-service-rooms", serviceIds],
        enabled: open && serviceIds.length > 0,
        queryFn: async (): Promise<Record<string, string[]>> => {
            const { data, error } = await supabase
                .from("services_client" as any)
                .select("id, professionals")
                .in("id", serviceIds);
            if (error) throw error;
            const map: Record<string, string[]> = {};
            for (const row of (data || []) as any[]) map[row.id] = (row.professionals || []) as string[];
            return map;
        },
    });

    useEffect(() => {
        if (!open) return;
        setStep(1);
        setApptIndex(0);
        setDrafts({});
        setDecisions({});
        setConfigs(Object.fromEntries(pendentes.map((i) => [i.id, defaultConfig(i)])));
    }, [open, pendentes]);

    const vendidos = pendentes.filter((i) => decisions[i.id] === "vender");
    const recusados = pendentes.filter((i) => decisions[i.id] === "recusar");
    const paraAgendar = vendidos.filter((i) => configs[i.id]?.agendar);

    const patch = (id: string, p: Partial<ItemConfig>) =>
        setConfigs((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

    const salasDoItem = (item: OrcamentoItem) => {
        const ids = item.service_client_id ? (serviceRooms[item.service_client_id] || []) : [];
        return salas.filter((s) => ids.includes(s.id));
    };

    const goToStep2 = () => {
        if (vendidos.length === 0) {
            toast.error("Selecione pelo menos um serviço para vender");
            return;
        }
        setStep(2);
    };

    const goToStep3 = () => {
        for (const item of vendidos) {
            const cfg = configs[item.id];
            if (salasDoItem(item).length === 0) {
                toast.error(`O serviço "${item.service_name}" não tem nenhuma sala atrelada. Atrele uma sala ao serviço antes de continuar.`);
                return;
            }
            if (cfg.agendar && !cfg.salaId) {
                toast.error(`Selecione a sala de "${item.service_name}" para agendar.`);
                return;
            }
            if (cfg.paymentType === "mixed" && (cfg.cashAmount <= 0 || cfg.cashAmount >= cfg.price)) {
                toast.error(`Valor à vista inválido em "${item.service_name}".`);
                return;
            }
        }
        if (paraAgendar.length === 0) {
            setStep(4);
            return;
        }
        setApptIndex(0);
        setStep(3);
    };

    const handleDraft = (itemId: string, draft: AppointmentDraft) => {
        setDrafts((prev) => ({ ...prev, [itemId]: draft }));
        if (apptIndex + 1 < paraAgendar.length) {
            setApptIndex(apptIndex + 1);
        } else {
            setStep(4);
        }
    };

    const handleFinish = async () => {
        if (!ownerId) return;
        setSaving(true);
        try {
            const result = await lancarVendaDoOrcamento({
                orcamentoId: orcamento.id,
                itens: vendidos.map((i) => {
                    const cfg = configs[i.id];
                    return {
                        item_id: i.id,
                        unit_price: cfg.price,
                        professional_id: cfg.salaId || null,
                        payment_type: cfg.paymentType,
                        installments: cfg.paymentType === "installment" || cfg.paymentType === "mixed" ? cfg.installments : 1,
                        interest_rate: cfg.paymentType === "installment" || cfg.paymentType === "mixed" ? cfg.interestRate : 0,
                        cash_amount: cfg.paymentType === "cash" ? cfg.price : cfg.paymentType === "mixed" ? cfg.cashAmount : null,
                        sale_date: cfg.saleDate,
                        notes: null,
                        ia_scheduling: !cfg.agendar && cfg.iaScheduling,
                        ia_contact_days: !cfg.agendar && cfg.iaScheduling ? Math.max(1, cfg.iaContactDays) : null,
                    };
                }),
                recusados: recusados.map((i) => i.id),
                teamMemberId: me?.id ?? null,
            });

            for (const r of result) {
                const draft = drafts[r.item_id];
                if (!draft) continue;
                try {
                    await commitAppointmentDraft(draft, {
                        ownerId,
                        expectedSaleId: r.sale_id,
                        syncCrm: syncCrmOnCreate,
                    });
                } catch (err) {
                    console.error("Erro ao criar agendamento do orçamento:", err);
                    toast.error(`Venda lançada, mas o agendamento de "${r.service_name}" falhou. Crie pela agenda.`);
                }
            }

            queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
            queryClient.invalidateQueries({ queryKey: ["sales"] });
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
            queryClient.invalidateQueries({ queryKey: ["valor-movimentado", orcamento.contact_id] });
            toast.success(`${result.length} ${result.length === 1 ? "venda lançada" : "vendas lançadas"}!`);
            onDone?.();
            onOpenChange(false);
        } catch (err: any) {
            console.error("Erro ao lançar venda:", err);
            toast.error(err?.message || "Erro ao lançar venda");
        } finally {
            setSaving(false);
        }
    };

    const currentAppt = paraAgendar[apptIndex];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-lg">
                <DialogHeader className="shrink-0">
                    <DialogTitle>Lançar venda — passo {step} de 4</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin">
                    {step === 1 && (
                        <>
                            <p className="text-xs text-muted-foreground">
                                Escolha o que o cliente comprou. O que for removido fica marcado como recusado no orçamento.
                            </p>
                            {pendentes.map((item) => {
                                const decision = decisions[item.id];
                                return (
                                    <div
                                        key={item.id}
                                        className={`p-3 border rounded-lg space-y-2 ${decision === "vender" ? "border-green-500/50 bg-green-500/5" : decision === "recusar" ? "border-destructive/40 bg-destructive/5 opacity-70" : "bg-muted/20"}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium truncate">{item.service_name}</span>
                                            <div className="flex gap-1 shrink-0">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={decision === "vender" ? "default" : "outline"}
                                                    className="h-7 text-xs gap-1"
                                                    onClick={() => setDecisions((p) => ({ ...p, [item.id]: "vender" }))}
                                                >
                                                    <Check className="w-3 h-3" /> Vender
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={decision === "recusar" ? "destructive" : "outline"}
                                                    className="h-7 text-xs gap-1"
                                                    onClick={() => setDecisions((p) => ({ ...p, [item.id]: "recusar" }))}
                                                >
                                                    <X className="w-3 h-3" /> Remover
                                                </Button>
                                            </div>
                                        </div>
                                        {decision === "vender" && (
                                            <div>
                                                <Label className="text-[10px] text-muted-foreground">Valor da venda (R$)</Label>
                                                <CurrencyInput
                                                    value={configs[item.id]?.price ?? Number(item.unit_price)}
                                                    onChange={(val) => patch(item.id, { price: val })}
                                                    className="h-9"
                                                />
                                                {Number(item.min_price || 0) > 0 && (
                                                    <span className="text-[9px] text-muted-foreground">Mín: {fmt(Number(item.min_price))}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {step === 2 && vendidos.map((item) => {
                        const cfg = configs[item.id];
                        const rooms = salasDoItem(item);
                        return (
                            <div key={item.id} className="p-3 border rounded-lg space-y-3 bg-muted/20">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium truncate">{item.service_name}</span>
                                    <span className="text-sm font-medium text-green-600 shrink-0">{fmt(cfg.price)}</span>
                                </div>

                                {rooms.length === 0 ? (
                                    <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>Este serviço não possui nenhuma sala atrelada. Atrele uma sala ao serviço em Cadastros → Produtos e Serviços antes de continuar.</span>
                                    </div>
                                ) : (
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground">Sala</Label>
                                        <Select value={cfg.salaId || "_none"} onValueChange={(v) => patch(item.id, { salaId: v === "_none" ? "" : v })}>
                                            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="_none">Nenhuma</SelectItem>
                                                {rooms.map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground">Atendente</Label>
                                        <Input value={me?.name || "—"} disabled className="h-9" />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground">Profissional</Label>
                                        <Input value={orcamento.responsavel?.name || "—"} disabled className="h-9" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground">Forma de pagamento</Label>
                                        <Select value={cfg.paymentType} onValueChange={(v: PaymentType) => patch(item.id, { paymentType: v, cashAmount: 0 })}>
                                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cash">À Vista</SelectItem>
                                                <SelectItem value="installment">Parcelado</SelectItem>
                                                <SelectItem value="pending">Pendente</SelectItem>
                                                <SelectItem value="mixed">Misto (Vista + Parcelado)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground">Data do pagamento</Label>
                                        <Input type="date" value={cfg.saleDate} onChange={(e) => patch(item.id, { saleDate: e.target.value })} className="h-9" />
                                    </div>
                                </div>

                                {cfg.paymentType === "mixed" && (
                                    <div>
                                        <Label className="text-[10px] text-muted-foreground">Valor à vista</Label>
                                        <CurrencyInput value={cfg.cashAmount} onChange={(v) => patch(item.id, { cashAmount: v })} className="h-9" />
                                    </div>
                                )}

                                {(cfg.paymentType === "installment" || cfg.paymentType === "mixed") && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-muted-foreground">Parcelas</Label>
                                            <Select value={String(cfg.installments)} onValueChange={(v) => patch(item.id, { installments: parseInt(v) })}>
                                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((n) => (
                                                        <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-muted-foreground">Juros % (a.m.)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={10}
                                                step={0.1}
                                                value={cfg.interestRate}
                                                onChange={(e) => patch(item.id, { interestRate: parseFloat(e.target.value) || 0 })}
                                                className="h-9"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="border-t pt-2.5 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs">Realizar agendamento</Label>
                                        <Switch
                                            checked={cfg.agendar}
                                            onCheckedChange={(checked) => patch(item.id, { agendar: checked, iaScheduling: false })}
                                        />
                                    </div>
                                    {!cfg.agendar && (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs">Agendamento pela IA</Label>
                                                <Switch
                                                    checked={cfg.iaScheduling}
                                                    onCheckedChange={(checked) => patch(item.id, { iaScheduling: checked })}
                                                />
                                            </div>
                                            {cfg.iaScheduling && (
                                                <div>
                                                    <Label className="text-[10px] text-muted-foreground">Dias para a IA entrar em contato</Label>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        value={cfg.iaContactDays}
                                                        onChange={(e) => patch(item.id, { iaContactDays: Math.max(1, parseInt(e.target.value) || 1) })}
                                                        className="h-9"
                                                    />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {step === 3 && currentAppt && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <CalendarCheck className="w-4 h-4" />
                                Agendamento {apptIndex + 1} de {paraAgendar.length} — {currentAppt.service_name}
                            </div>
                            <AppointmentModal
                                key={currentAppt.id}
                                open
                                onOpenChange={() => { }}
                                embedded
                                deferSubmit
                                hideTypeTabs
                                hidePaymentSection
                                lockService
                                submitLabel="Confirmar horário"
                                defaultContactId={orcamento.contact_id}
                                defaultServiceId={currentAppt.service_client_id || undefined}
                                defaultProfessionalId={configs[currentAppt.id]?.salaId || undefined}
                                onDraft={(draft) => handleDraft(currentAppt.id, draft)}
                            />
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-2">
                            {vendidos.map((item) => {
                                const cfg = configs[item.id];
                                const draft = drafts[item.id];
                                return (
                                    <div key={item.id} className="p-3 border rounded-lg bg-muted/20 text-xs space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium truncate">{item.service_name}</span>
                                            <span className="text-sm font-medium text-green-600">{fmt(cfg.price)}</span>
                                        </div>
                                        <p className="text-muted-foreground">
                                            {cfg.paymentType === "cash" ? "À vista" : cfg.paymentType === "pending" ? "Pagamento pendente" : cfg.paymentType === "installment" ? `Parcelado ${cfg.installments}x` : `Misto: ${fmt(cfg.cashAmount)} à vista + ${cfg.installments}x`}
                                            {" · "}{new Date(`${cfg.saleDate}T00:00:00`).toLocaleDateString("pt-BR")}
                                        </p>
                                        <p className="text-muted-foreground">
                                            Profissional: {orcamento.responsavel?.name || "—"}
                                            {cfg.salaId ? ` · Sala: ${salas.find((s) => s.id === cfg.salaId)?.name || "—"}` : ""}
                                        </p>
                                        <p className="text-muted-foreground">
                                            {draft
                                                ? `Agendamento: ${draft.label}`
                                                : cfg.iaScheduling
                                                    ? `Agendamento pela IA em ${cfg.iaContactDays} dias`
                                                    : "Sem agendamento"}
                                        </p>
                                    </div>
                                );
                            })}
                            {recusados.length > 0 && (
                                <div className="p-3 border rounded-lg border-destructive/30 bg-destructive/5 text-xs">
                                    <p className="font-medium mb-1">Serão marcados como recusados:</p>
                                    {recusados.map((i) => <p key={i.id} className="text-muted-foreground">{i.service_name}</p>)}
                                </div>
                            )}
                            <div className="p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 flex justify-between items-center">
                                <span className="font-medium text-sm">Total da venda</span>
                                <span className="text-xl font-bold text-green-600">
                                    {fmt(vendidos.reduce((acc, i) => acc + configs[i.id].price, 0))}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-3 border-t mt-3 shrink-0 flex justify-between gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                            if (step === 1) return onOpenChange(false);
                            if (step === 3 && apptIndex > 0) return setApptIndex(apptIndex - 1);
                            if (step === 4 && paraAgendar.length > 0) {
                                setApptIndex(paraAgendar.length - 1);
                                return setStep(3);
                            }
                            setStep(step === 4 ? 2 : step - 1);
                        }}
                        disabled={saving}
                    >
                        <ArrowLeft className="w-4 h-4" /> {step === 1 ? "Cancelar" : "Voltar"}
                    </Button>

                    {step === 1 && (
                        <Button type="button" className="gap-1" onClick={goToStep2}>
                            Continuar <ArrowRight className="w-4 h-4" />
                        </Button>
                    )}
                    {step === 2 && (
                        <Button type="button" className="gap-1" onClick={goToStep3}>
                            Continuar <ArrowRight className="w-4 h-4" />
                        </Button>
                    )}
                    {step === 4 && (
                        <Button type="button" onClick={handleFinish} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Lançar venda
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
