import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PatientModal } from "@/components/patients/PatientModal";
import { Loader2, Star, UserPlus } from "lucide-react";

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface ServiceUnit {
    instanceId: string;   // `${product_service_id}-${index}`
    service_id: string;
    service_name: string;
}

interface CardState {
    professional_id: string;
    contact_date: string;
    deadline_date: string;
    notes: string;
}

export interface DeliveryLaunchModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contactId: string;
    dealProducts: any[];   // crm_deal_products filtrados (type === 'service')
    dealTitle: string;
    saleDate: string;      // YYYY-MM-DD imutável
    ownerId: string;
}

// ─── Componente ────────────────────────────────────────────────────────────

export function DeliveryLaunchModal({
    open,
    onOpenChange,
    contactId,
    dealProducts,
    dealTitle,
    saleDate,
    ownerId,
}: DeliveryLaunchModalProps) {
    const queryClient = useQueryClient();

    // ── Expansão de unidades por quantidade ───────────────────────────────
    const serviceUnits: ServiceUnit[] = useMemo(
        () =>
            dealProducts.flatMap((p) =>
                Array.from({ length: p.quantity || 1 }, (_, i) => ({
                    instanceId: `${p.product_service_id}-${i}`,
                    service_id: p.product_service_id,
                    service_name: p.product_service?.name || "Serviço",
                }))
            ),
        [dealProducts]
    );

    // ── Estado de cada card ────────────────────────────────────────────────
    const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const updateCard = (instanceId: string, field: keyof CardState, value: string) => {
        setCardStates((prev) => ({
            ...prev,
            [instanceId]: {
                ...prev[instanceId],
                professional_id: prev[instanceId]?.professional_id ?? "",
                contact_date: prev[instanceId]?.contact_date ?? "",
                deadline_date: prev[instanceId]?.deadline_date ?? "",
                notes: prev[instanceId]?.notes ?? "",
                [field]: value,
            },
        }));
    };

    // Reset estado ao fechar/abrir
    useEffect(() => {
        if (!open) {
            setCardStates({});
        }
    }, [open]);

    // ── Busca do paciente vinculado ao contato ─────────────────────────────
    const { data: existingPatient, isLoading: loadingPatient } = useQuery({
        queryKey: ["patient-by-contact", contactId],
        queryFn: async () => {
            const { data } = await supabase
                .from("patients" as any)
                .select("id, nome, telefone, contact_id")
                .eq("contact_id", contactId)
                .maybeSingle();
            return data as { id: string; nome: string; telefone: string; contact_id: string } | null;
        },
        enabled: open && !!contactId,
    });

    const [patientId, setPatientId] = useState<string | null>(null);
    const [patientModalOpen, setPatientModalOpen] = useState(false);

    // Pré-selecionar ou pedir cadastro quando query resolver
    useEffect(() => {
        if (!open) return;
        if (loadingPatient) return;
        if (existingPatient) {
            setPatientId(existingPatient.id);
        } else if (existingPatient === null) {
            // null explícito = não encontrado
            setPatientModalOpen(true);
        }
    }, [existingPatient, loadingPatient, open]);

    // Reset patientId ao fechar
    useEffect(() => {
        if (!open) {
            setPatientId(null);
            setPatientModalOpen(false);
        }
    }, [open]);

    // ── Profissionais com service_ids ─────────────────────────────────────
    const { data: professionals } = useQuery({
        queryKey: ["professionals-with-services"],
        queryFn: async () => {
            const { data } = await supabase
                .from("professionals" as any)
                .select("id, name, service_ids")
                .order("name");
            return (data as any[]) ?? [];
        },
        enabled: open,
    });

    // Map: service_id → profissionais aptos a realizá-lo
    const professionalsByService = useMemo(() => {
        const map = new Map<string, { id: string; name: string }[]>();
        if (!professionals) return map;
        for (const unit of serviceUnits) {
            const filtered = professionals.filter((p: any) => {
                // Se o profissional não tem service_ids configurados, aparece para todos
                if (!p.service_ids?.length) return true;
                return (p.service_ids as string[]).includes(unit.service_id);
            });
            map.set(unit.service_id, filtered);
        }
        return map;
    }, [professionals, serviceUnits]);

    // ── Submissão (bulk insert) ────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!patientId || !ownerId) {
            toast.error("Selecione ou cadastre um paciente antes de lançar.");
            return;
        }
        setIsSubmitting(true);
        try {
            const rows = serviceUnits.map((unit) => ({
                user_id: ownerId,
                patient_id: patientId,
                service_id: unit.service_id,
                professional_id: cardStates[unit.instanceId]?.professional_id || null,
                sale_date: saleDate,
                contact_date: cardStates[unit.instanceId]?.contact_date || null,
                deadline_date: cardStates[unit.instanceId]?.deadline_date || null,
                notes: cardStates[unit.instanceId]?.notes || null,
                stage: "aguardando_agendamento",
            }));

            const { error } = await supabase.from("deliveries" as any).insert(rows);
            if (error) throw error;

            toast.success(
                `${rows.length} procedimento${rows.length !== 1 ? "s" : ""} lançado${rows.length !== 1 ? "s" : ""} com sucesso!`
            );
            queryClient.invalidateQueries({ queryKey: ["deliveries"] });
            onOpenChange(false);
        } catch (err: any) {
            toast.error("Erro ao lançar procedimentos: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Patient display name ───────────────────────────────────────────────
    const patientName = existingPatient?.nome ?? (patientId ? "Paciente selecionado" : null);

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
                        <DialogTitle className="text-lg font-semibold">
                            Lançar Procedimentos
                        </DialogTitle>
                        <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                            <p>
                                <span className="font-medium text-foreground">Deal:</span>{" "}
                                {dealTitle}
                            </p>
                            {loadingPatient ? (
                                <p className="flex items-center gap-1.5">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Buscando paciente...
                                </p>
                            ) : patientName ? (
                                <p>
                                    <span className="font-medium text-foreground">Paciente:</span>{" "}
                                    {patientName}
                                </p>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <p className="text-amber-600 dark:text-amber-400">
                                        Nenhum paciente vinculado a este contato.
                                    </p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-xs"
                                        onClick={() => setPatientModalOpen(true)}
                                    >
                                        <UserPlus className="w-3 h-3 mr-1" />
                                        Cadastrar
                                    </Button>
                                </div>
                            )}
                        </div>
                    </DialogHeader>

                    {/* Cards de serviço */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                        {serviceUnits.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                Nenhum serviço encontrado nesta negociação.
                            </p>
                        ) : (
                            serviceUnits.map((unit, idx) => (
                                <div
                                    key={unit.instanceId}
                                    className="rounded-lg border border-border bg-card p-4 space-y-3"
                                >
                                    {/* Cabeçalho do card */}
                                    <div className="flex items-center gap-2">
                                        <Star className="w-3.5 h-3.5 text-primary fill-primary flex-shrink-0" />
                                        <p className="text-xs font-bold text-primary uppercase tracking-wide truncate">
                                            {unit.service_name}
                                        </p>
                                        {serviceUnits.filter(u => u.service_id === unit.service_id).length > 1 && (
                                            <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
                                                #{idx + 1}
                                            </span>
                                        )}
                                    </div>

                                    {/* Profissional — filtrado pelos aptos a realizar este serviço */}
                                    <div>
                                        <Label className="text-xs mb-1 block">Profissional</Label>
                                        <Select
                                            value={cardStates[unit.instanceId]?.professional_id ?? ""}
                                            onValueChange={(v) => updateCard(unit.instanceId, "professional_id", v)}
                                        >
                                            <SelectTrigger className="h-8 text-sm">
                                                <SelectValue placeholder="Selecionar profissional..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(professionalsByService.get(unit.service_id) ?? []).map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        {p.name}
                                                    </SelectItem>
                                                ))}
                                                {(professionalsByService.get(unit.service_id) ?? []).length === 0 && (
                                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                                        Nenhum profissional realiza este serviço
                                                    </div>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Datas */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs mb-1 block">Data do Contato</Label>
                                            <Input
                                                type="date"
                                                className="h-8 text-sm"
                                                value={cardStates[unit.instanceId]?.contact_date ?? ""}
                                                onChange={(e) => updateCard(unit.instanceId, "contact_date", e.target.value)}
                                                autoComplete="off"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs mb-1 block">Data Limite</Label>
                                            <Input
                                                type="date"
                                                className="h-8 text-sm"
                                                value={cardStates[unit.instanceId]?.deadline_date ?? ""}
                                                onChange={(e) => updateCard(unit.instanceId, "deadline_date", e.target.value)}
                                                autoComplete="off"
                                            />
                                        </div>
                                    </div>

                                    {/* Observações */}
                                    <div>
                                        <Label className="text-xs mb-1 block">Observações</Label>
                                        <Textarea
                                            className="text-sm resize-none"
                                            rows={2}
                                            placeholder="Observações sobre este procedimento..."
                                            value={cardStates[unit.instanceId]?.notes ?? ""}
                                            onChange={(e) => updateCard(unit.instanceId, "notes", e.target.value)}
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !patientId || serviceUnits.length === 0}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Lançando...
                                </>
                            ) : (
                                `Lançar ${serviceUnits.length} Procedimento${serviceUnits.length !== 1 ? "s" : ""}`
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* PatientModal — abre quando contato não tem paciente vinculado */}
            <PatientModal
                open={patientModalOpen}
                onOpenChange={setPatientModalOpen}
                defaultContactId={contactId}
                onCreated={(newPatientId) => {
                    setPatientId(newPatientId);
                    setPatientModalOpen(false);
                }}
            />
        </>
    );
}
