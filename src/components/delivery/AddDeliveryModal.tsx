import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
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
import { Plus, Loader2 } from "lucide-react";
import { PatientModal } from "@/components/patients/PatientModal";

interface AddDeliveryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const NONE = "__none__";

export function AddDeliveryModal({ open, onOpenChange }: AddDeliveryModalProps) {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();

    const [patientId, setPatientId] = useState<string>("");
    const [serviceId, setServiceId] = useState<string>("");
    const [professionalId, setProfessionalId] = useState<string>("");
    const [responsibleId, setResponsibleId] = useState<string>("");
    const [saleDate, setSaleDate] = useState("");
    const [contactDate, setContactDate] = useState("");
    const [deadlineDate, setDeadlineDate] = useState("");
    const [notes, setNotes] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [patientModalOpen, setPatientModalOpen] = useState(false);

    // Limpar serviço quando profissional mudar
    useEffect(() => {
        setServiceId("");
    }, [professionalId]);

    // Patients — usa RPC (igual à página Patients) com fallback
    const { data: patients } = useQuery({
        queryKey: ["patients-add-delivery", ownerId],
        queryFn: async () => {
            const { data: rpcData, error: rpcError } = await supabase
                .rpc("get_my_patients");
            if (!rpcError && rpcData) {
                return (rpcData as any[]).map((p: any) => ({
                    id: p.id,
                    nome: p.nome,
                    telefone: p.telefone,
                    profile_pic_url: p.profile_pic_url,
                    contact_id: p.contact_id,
                }));
            }
            const { data, error } = await supabase
                .from("patients")
                .select("id, nome, telefone, profile_pic_url, contact_id")
                .eq("user_id", ownerId!)
                .order("nome");
            if (error) throw error;
            return data;
        },
        enabled: !!ownerId && open,
    });

    // Todos os serviços (type = 'service')
    const { data: services } = useQuery({
        queryKey: ["services-add-delivery"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products_services")
                .select("id, name, price")
                .eq("type", "service")
                .order("name");
            if (error) throw error;
            return data as { id: string; name: string; price: number }[];
        },
        enabled: open,
    });

    // Profissionais com seus service_ids
    const { data: professionals } = useQuery({
        queryKey: ["professionals-add-delivery"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("professionals")
                .select("id, name, service_ids")
                .order("name");
            if (error) throw error;
            return data as { id: string; name: string; service_ids: string[] | null }[];
        },
        enabled: open,
    });

    // Serviços disponíveis para o profissional selecionado
    const availableServices = useMemo(() => {
        if (!services) return [];
        if (!professionalId || professionalId === NONE) return [];
        const prof = professionals?.find((p) => p.id === professionalId);
        // Se o profissional não tiver service_ids configurados, exibe todos
        if (!prof?.service_ids?.length) return services;
        return services.filter((s) => prof.service_ids!.includes(s.id));
    }, [services, professionals, professionalId]);

    // Team members
    const { data: teamMembers } = useQuery({
        queryKey: ["team-members-add-delivery", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("team_members")
                .select("id, name")
                .eq("user_id", ownerId!)
                .order("name");
            if (error) throw error;
            return data;
        },
        enabled: !!ownerId && open,
    });

    const resetForm = () => {
        setPatientId("");
        setServiceId("");
        setProfessionalId("");
        setResponsibleId("");
        setSaleDate("");
        setContactDate("");
        setDeadlineDate("");
        setNotes("");
    };

    const handleClose = (val: boolean) => {
        if (!val) resetForm();
        onOpenChange(val);
    };

    const toNullable = (val: string) => (!val || val === NONE ? null : val);

    const handleSubmit = async () => {
        if (!ownerId) return;
        if (!patientId || patientId === NONE) {
            toast.error("Selecione um paciente");
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from("deliveries").insert({
                user_id: ownerId,
                patient_id: toNullable(patientId),
                service_id: toNullable(serviceId),
                professional_id: toNullable(professionalId),
                responsible_id: toNullable(responsibleId),
                sale_date: saleDate || null,
                contact_date: contactDate || null,
                deadline_date: deadlineDate || null,
                notes: notes || null,
                stage: "aguardando_agendamento",
            });

            if (error) throw error;

            toast.success("Procedimento criado com sucesso!");
            queryClient.invalidateQueries({ queryKey: ["deliveries", ownerId] });
            handleClose(false);
        } catch (err) {
            toast.error("Erro ao criar procedimento");
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePatientModalClose = (val: boolean) => {
        setPatientModalOpen(val);
        if (!val) {
            queryClient.invalidateQueries({ queryKey: ["patients-add-delivery", ownerId] });
        }
    };

    const hasProfessional = !!professionalId && professionalId !== NONE;

    return (
        <>
            <Dialog open={open} onOpenChange={handleClose}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Adicionar Procedimento</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-1">
                        {/* Paciente */}
                        <div className="space-y-1.5">
                            <Label>Paciente *</Label>
                            <div className="flex gap-2">
                                <Select value={patientId || undefined} onValueChange={setPatientId}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Selecione um paciente" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {patients?.map((p) => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.nome}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    title="Adicionar novo paciente"
                                    onClick={() => setPatientModalOpen(true)}
                                >
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Profissional Responsável — vem antes do serviço */}
                        <div className="space-y-1.5">
                            <Label>Profissional Responsável</Label>
                            <Select
                                value={professionalId || undefined}
                                onValueChange={setProfessionalId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um profissional" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>— Nenhum —</SelectItem>
                                    {professionals?.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Serviço — liberado apenas após selecionar profissional */}
                        <div className="space-y-1.5">
                            <Label className={!hasProfessional ? "text-muted-foreground" : ""}>
                                Serviço / Procedimento
                                {!hasProfessional && (
                                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                                        (selecione um profissional primeiro)
                                    </span>
                                )}
                            </Label>
                            <Select
                                value={serviceId || undefined}
                                onValueChange={setServiceId}
                                disabled={!hasProfessional}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={
                                        hasProfessional
                                            ? availableServices.length === 0
                                                ? "Nenhum serviço vinculado a este profissional"
                                                : "Selecione um serviço"
                                            : "Selecione um profissional primeiro"
                                    } />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>— Nenhum —</SelectItem>
                                    {availableServices.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Datas */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label>Data da Venda</Label>
                                <Input
                                    type="date"
                                    value={saleDate}
                                    onChange={(e) => setSaleDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Data do Contato</Label>
                                <Input
                                    type="date"
                                    value={contactDate}
                                    onChange={(e) => setContactDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Data Limite</Label>
                                <Input
                                    type="date"
                                    value={deadlineDate}
                                    onChange={(e) => setDeadlineDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Usuário Responsável */}
                        <div className="space-y-1.5">
                            <Label>Usuário Responsável</Label>
                            <Select value={responsibleId || undefined} onValueChange={setResponsibleId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um responsável" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>— Nenhum —</SelectItem>
                                    {teamMembers?.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Observações */}
                        <div className="space-y-1.5">
                            <Label>Observações</Label>
                            <Textarea
                                placeholder="Informações adicionais..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => handleClose(false)}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Adicionar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* PatientModal for quick patient creation */}
            <PatientModal
                open={patientModalOpen}
                onOpenChange={handlePatientModalClose}
            />
        </>
    );
}
