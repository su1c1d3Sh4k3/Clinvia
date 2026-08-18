import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useProfessionals } from "@/hooks/useFinancial";
import { ProfessionalModal } from "@/components/scheduling/ProfessionalModal";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Pencil, Trash2, Users, Briefcase } from "lucide-react";

interface ScopeOption {
    id: string;
    label: string;
}

/**
 * Multi-select de escopo (instâncias/filas) com opção "Todas".
 * `value === null` significa "todas"; array = seleção específica.
 */
const ScopeSelector = ({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: ScopeOption[];
    value: string[] | null;
    onChange: (v: string[] | null) => void;
}) => (
    <div className="space-y-2">
        <Label>{label}</Label>
        <div className="rounded-md border p-2 space-y-1.5 max-h-36 overflow-y-auto">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                    checked={value === null}
                    onCheckedChange={(checked) => onChange(checked ? null : [])}
                />
                Todas
            </label>
            {options.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                        checked={value !== null && value.includes(opt.id)}
                        onCheckedChange={(checked) => {
                            const current = value ?? [];
                            onChange(checked ? [...current, opt.id] : current.filter((id) => id !== opt.id));
                        }}
                    />
                    <span className="truncate">{opt.label}</span>
                </label>
            ))}
            {options.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma opção disponível</p>
            )}
        </div>
    </div>
);

export const TeamSettings = () => {
    const { data: userRole } = useUserRole();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const { data: ownerId } = useOwnerId();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<any>(null);

    const [isProfessionalModalOpen, setIsProfessionalModalOpen] = useState(false);
    const [selectedProfessional, setSelectedProfessional] = useState<any>(null);

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        role: "agent",
        password: "",
        commission: 0,
    });
    // Escopo de visibilidade (só para Atendente): null = todas
    const [allowedInstanceIds, setAllowedInstanceIds] = useState<string[] | null>(null);
    const [assignedQueueIds, setAssignedQueueIds] = useState<string[] | null>(null);

    const { data: teamMembers, isLoading } = useQuery({
        queryKey: ["team-members", ownerId],
        enabled: !!ownerId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("team_members")
                .select("*")
                .eq("user_id", ownerId)
                .order("name");
            if (error) throw error;
            return data;
        },
    });

    const { data: professionals, isLoading: isProfessionalsLoading } = useProfessionals();

    // Instâncias (WhatsApp + Instagram) e filas do owner p/ escopo de visibilidade
    const { data: instanceOptions } = useQuery({
        queryKey: ["team-scope-instances", ownerId],
        enabled: !!ownerId,
        queryFn: async (): Promise<ScopeOption[]> => {
            const [wpp, ig] = await Promise.all([
                supabase.from("instances").select("id, name").eq("user_id", ownerId).order("name"),
                supabase.from("instagram_instances").select("id, account_name").eq("user_id", ownerId),
            ]);
            return [
                ...(wpp.data || []).map((i: any) => ({ id: i.id, label: i.name })),
                ...(ig.data || []).map((i: any) => ({ id: i.id, label: `${i.account_name} (Instagram)` })),
            ];
        },
    });

    const { data: queueOptions } = useQuery({
        queryKey: ["team-scope-queues", ownerId],
        enabled: !!ownerId,
        queryFn: async (): Promise<ScopeOption[]> => {
            const { data, error } = await supabase
                .from("queues")
                .select("id, name")
                .eq("user_id", ownerId)
                .order("name");
            if (error) throw error;
            return (data || []).map((q: any) => ({ id: q.id, label: q.name }));
        },
    });

    const scopeLabel = (ids: string[] | null | undefined, options: ScopeOption[] | undefined, role: string) => {
        if (role !== "agent" || !ids) return "Todas";
        if (ids.length === 0) return "-";
        return ids
            .map((id) => options?.find((o) => o.id === id)?.label)
            .filter(Boolean)
            .join(", ") || "-";
    };

    const { data: services } = useQuery({
        queryKey: ["services-for-professionals"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products_services")
                .select("id, name")
                .eq("type", "service");
            if (error) throw error;
            return data || [];
        },
    });

    const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    const getServiceNames = (serviceIds: string[] | null) => {
        if (!serviceIds || serviceIds.length === 0 || !services) return "-";
        return serviceIds
            .map(id => services.find((s: any) => s.id === id)?.name)
            .filter(Boolean)
            .join(", ") || "-";
    };

    const getWorkDaysNames = (workDays: number[] | null) => {
        if (!workDays || workDays.length === 0) return "-";
        return workDays.map(d => DAY_NAMES[d]).join(", ");
    };

    const deleteProfessionalMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("professionals").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["professionals-list"] });
            toast({ title: "Profissional removido com sucesso!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao remover profissional", description: error.message, variant: "destructive" });
        },
    });

    const createMemberMutation = useMutation({
        mutationFn: async (newMember: any) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");
            const { data, error } = await supabase.functions.invoke("create-team-member", {
                body: { ...newMember, owner_id: user.id },
            });
            if (error) {
                let errorMessage = "Erro ao criar membro";
                try {
                    if (error instanceof Error && 'context' in error) {
                        const body = await (error as any).context.json();
                        errorMessage = body.error || errorMessage;
                    }
                } catch {}
                throw new Error(errorMessage);
            }
            if (data.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["team-members"] });
            setIsAddOpen(false);
            setFormData({ name: "", email: "", phone: "", role: "agent", password: "", commission: 0 });
            setAllowedInstanceIds(null);
            setAssignedQueueIds(null);
            toast({ title: "Membro adicionado com sucesso!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao adicionar membro", description: error.message, variant: "destructive" });
        },
    });

    const updateMemberMutation = useMutation({
        mutationFn: async (member: any) => {
            const { error } = await supabase
                .from("team_members")
                .update({
                    name: member.name,
                    phone: member.phone,
                    role: member.role,
                    commission: member.commission || 0,
                    allowed_instance_ids: member.role === "agent" ? member.allowed_instance_ids : null,
                    assigned_queue_ids: member.role === "agent" ? member.assigned_queue_ids : null,
                } as any)
                .eq("id", member.id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["team-members"] });
            setIsEditOpen(false);
            toast({ title: "Membro atualizado com sucesso!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao atualizar membro", description: error.message, variant: "destructive" });
        },
    });

    const deleteMemberMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await supabase.functions.invoke("delete-team-member", { body: { id } });
            if (error) {
                let errorMessage = "Erro ao remover membro";
                try {
                    if (error instanceof Error && 'context' in error) {
                        const body = await (error as any).context.json();
                        errorMessage = body.error || errorMessage;
                    }
                } catch {}
                throw new Error(errorMessage);
            }
            if (data.error) throw new Error(data.error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["team-members"] });
            toast({ title: "Membro removido com sucesso!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao remover membro", description: error.message, variant: "destructive" });
        },
    });

    const validateScope = () => {
        if (formData.role !== "agent") return true;
        if (allowedInstanceIds !== null && allowedInstanceIds.length === 0) {
            toast({ title: "Selecione ao menos uma instância liberada (ou marque Todas)", variant: "destructive" });
            return false;
        }
        if (assignedQueueIds !== null && assignedQueueIds.length === 0) {
            toast({ title: "Selecione ao menos uma fila atribuída (ou marque Todas)", variant: "destructive" });
            return false;
        }
        return true;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateScope()) return;
        createMemberMutation.mutate({
            ...formData,
            allowed_instance_ids: formData.role === "agent" ? allowedInstanceIds : null,
            assigned_queue_ids: formData.role === "agent" ? assignedQueueIds : null,
        });
    };

    const handleUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMember) return;
        if (!validateScope()) return;
        updateMemberMutation.mutate({
            ...formData,
            id: selectedMember.id,
            allowed_instance_ids: allowedInstanceIds,
            assigned_queue_ids: assignedQueueIds,
        });
    };

    return (
        <div className="space-y-6 md:space-y-8">
            {/* === MEMBROS DA EQUIPE === */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                    <h3 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Membros da Equipe
                    </h3>
                    <p className="text-muted-foreground text-sm hidden sm:block">
                        Gerencie membros e permissões de acesso
                    </p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={(o) => {
                    setIsAddOpen(o);
                    if (o) {
                        // Reset do escopo ao abrir (pode ter sobrado estado da edição)
                        setAllowedInstanceIds(null);
                        setAssignedQueueIds(null);
                    }
                }}>
                    {canCreate('team_members') && (
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-8 md:h-9 text-xs md:text-sm w-fit">
                                <Plus className="mr-1 md:mr-2 h-4 w-4" />
                                <span className="hidden sm:inline">Adicionar </span>Membro
                            </Button>
                        </DialogTrigger>
                    )}
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Adicionar Novo Membro</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nome</Label>
                                <Input id="name" autoComplete="off" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" autoComplete="off" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Senha</Label>
                                <Input id="password" type="password" autoComplete="new-password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Telefone</Label>
                                <Input id="phone" autoComplete="off" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Função</Label>
                                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent position="popper">
                                        <SelectItem value="agent">Atendente</SelectItem>
                                        {userRole !== "agent" && <SelectItem value="supervisor">Supervisor</SelectItem>}
                                    </SelectContent>
                                </Select>
                            </div>
                            {userRole !== "agent" && (
                                <div className="space-y-2">
                                    <Label htmlFor="create-commission">Comissão (%)</Label>
                                    <Input id="create-commission" type="number" min={0} max={100} value={formData.commission} onChange={(e) => setFormData({ ...formData, commission: Number(e.target.value) || 0 })} placeholder="0" />
                                </div>
                            )}
                            {formData.role === "agent" && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <ScopeSelector
                                        label="Instâncias liberadas"
                                        options={instanceOptions || []}
                                        value={allowedInstanceIds}
                                        onChange={setAllowedInstanceIds}
                                    />
                                    <ScopeSelector
                                        label="Filas atribuídas"
                                        options={queueOptions || []}
                                        value={assignedQueueIds}
                                        onChange={setAssignedQueueIds}
                                    />
                                </div>
                            )}
                            <Button type="submit" className="w-full" disabled={createMemberMutation.isPending}>
                                {createMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Criar Membro
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border overflow-x-auto bg-white dark:bg-[#303541] border-[#D4D5D6] dark:border-border">
                <Table>
                    <TableHeader>
                        <TableHead className="min-w-[120px]">Nome</TableHead>
                        <TableHead className="hidden md:table-cell">Email</TableHead>
                        <TableHead>Função</TableHead>
                        <TableHead className="hidden sm:table-cell">Telefone</TableHead>
                        <TableHead className="hidden md:table-cell">Instâncias liberadas</TableHead>
                        <TableHead className="hidden md:table-cell">Filas atribuídas</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : (
                            teamMembers?.map((member: any) => (
                                <TableRow key={member.id}>
                                    <TableCell className="font-medium text-sm py-2 md:py-4">{member.name}</TableCell>
                                    <TableCell className="hidden md:table-cell text-sm py-2 md:py-4">{member.email}</TableCell>
                                    <TableCell className="py-2 md:py-4">
                                        <Badge variant={member.role === "admin" || member.role === "supervisor" ? "default" : "secondary"} className="text-[10px] md:text-xs">
                                            {member.role === "admin" ? "Admin" : member.role === "supervisor" ? "Superv." : "Atend."}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-sm py-2 md:py-4">{member.phone || "-"}</TableCell>
                                    <TableCell className="hidden md:table-cell max-w-[180px] py-2 md:py-4">
                                        <span className="text-xs text-muted-foreground truncate block" title={scopeLabel(member.allowed_instance_ids, instanceOptions, member.role)}>
                                            {scopeLabel(member.allowed_instance_ids, instanceOptions, member.role)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell max-w-[180px] py-2 md:py-4">
                                        <span className="text-xs text-muted-foreground truncate block" title={scopeLabel(member.assigned_queue_ids, queueOptions, member.role)}>
                                            {scopeLabel(member.assigned_queue_ids, queueOptions, member.role)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right py-2 md:py-4">
                                        <div className="flex justify-end gap-1">
                                            {canEdit('team_members') && (userRole === "admin" || member.role !== "admin") && (
                                                <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8" onClick={() => {
                                                    setSelectedMember(member);
                                                    setFormData({ name: member.name, email: member.email, phone: member.phone || "", role: member.role, password: "", commission: member.commission || 0 });
                                                    setAllowedInstanceIds(member.allowed_instance_ids ?? null);
                                                    setAssignedQueueIds(member.assigned_queue_ids ?? null);
                                                    setIsEditOpen(true);
                                                }}>
                                                    <Pencil className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                                </Button>
                                            )}
                                            {canDelete('team_members') && member.role !== "admin" && (
                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7 md:h-8 md:w-8" onClick={() => {
                                                    if (confirm("Tem certeza que deseja remover este membro?")) deleteMemberMutation.mutate(member.auth_user_id);
                                                }}>
                                                    <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar Membro</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUpdate} className="space-y-4" autoComplete="off">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Nome</Label>
                            <Input id="edit-name" autoComplete="off" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-phone">Telefone</Label>
                            <Input id="edit-phone" autoComplete="off" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-role">Função</Label>
                            <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })} disabled={userRole === "agent"}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent position="popper">
                                    <SelectItem value="agent">Atendente</SelectItem>
                                    {userRole !== "agent" && <SelectItem value="supervisor">Supervisor</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>
                        {userRole !== "agent" && (
                            <div className="space-y-2">
                                <Label htmlFor="commission">Comissão (%)</Label>
                                <Input id="commission" type="number" min={0} max={100} value={formData.commission} onChange={(e) => setFormData({ ...formData, commission: Number(e.target.value) || 0 })} placeholder="0" />
                            </div>
                        )}
                        {formData.role === "agent" && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <ScopeSelector
                                    label="Instâncias liberadas"
                                    options={instanceOptions || []}
                                    value={allowedInstanceIds}
                                    onChange={setAllowedInstanceIds}
                                />
                                <ScopeSelector
                                    label="Filas atribuídas"
                                    options={queueOptions || []}
                                    value={assignedQueueIds}
                                    onChange={setAssignedQueueIds}
                                />
                            </div>
                        )}
                        <Button type="submit" className="w-full" disabled={updateMemberMutation.isPending}>
                            {updateMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Salvar Alterações
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            {/* === PROFISSIONAIS === */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t">
                <div className="space-y-1">
                    <h3 className="text-lg md:text-xl font-bold tracking-tight flex items-center gap-2">
                        <Briefcase className="h-5 w-5" />
                        Profissionais
                    </h3>
                    <p className="text-muted-foreground text-sm hidden sm:block">
                        Profissionais cadastrados para agendamentos
                    </p>
                </div>
                {canCreate('professionals') && (
                    <Button size="sm" className="h-8 md:h-9 text-xs md:text-sm w-fit" onClick={() => {
                        setSelectedProfessional(null);
                        setIsProfessionalModalOpen(true);
                    }}>
                        <Plus className="mr-1 md:mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Adicionar </span>Prof.
                    </Button>
                )}
            </div>

            <div className="rounded-md border overflow-x-auto bg-white dark:bg-[#303541] border-[#D4D5D6] dark:border-border">
                <Table>
                    <TableHeader>
                        <TableHead className="min-w-[120px]">Nome</TableHead>
                        <TableHead className="hidden sm:table-cell">Função</TableHead>
                        <TableHead className="hidden md:table-cell">Serviços</TableHead>
                        <TableHead className="hidden lg:table-cell">Dias</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableHeader>
                    <TableBody>
                        {isProfessionalsLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : !professionals || professionals.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                                    Nenhum profissional cadastrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            professionals.map((professional: any) => (
                                <TableRow key={professional.id}>
                                    <TableCell className="font-medium py-2 md:py-4">
                                        <div className="flex items-center gap-2">
                                            {professional.photo_url ? (
                                                <img src={professional.photo_url} alt={professional.name} className="w-6 h-6 md:w-8 md:h-8 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-500 text-xs md:text-sm font-semibold">
                                                    {professional.name?.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-sm">{professional.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell py-2 md:py-4">
                                        <Badge variant="default" className="text-[10px] md:text-xs">{professional.role || "Prof."}</Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[150px] hidden md:table-cell py-2 md:py-4">
                                        <span className="text-xs text-muted-foreground truncate block">{getServiceNames(professional.service_ids)}</span>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell py-2 md:py-4">
                                        <span className="text-xs">{getWorkDaysNames(professional.work_days)}</span>
                                    </TableCell>
                                    <TableCell className="text-right py-2 md:py-4">
                                        <div className="flex justify-end gap-1">
                                            {canEdit('professionals') && (
                                                <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8" onClick={() => {
                                                    setSelectedProfessional(professional);
                                                    setIsProfessionalModalOpen(true);
                                                }}>
                                                    <Pencil className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                                </Button>
                                            )}
                                            {canDelete('professionals') && (
                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7 md:h-8 md:w-8" onClick={() => {
                                                    if (confirm("Remover este profissional?")) deleteProfessionalMutation.mutate(professional.id);
                                                }}>
                                                    <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <ProfessionalModal
                open={isProfessionalModalOpen}
                onOpenChange={setIsProfessionalModalOpen}
                professionalToEdit={selectedProfessional}
            />
        </div>
    );
};
