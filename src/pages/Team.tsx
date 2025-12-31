import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useProfessionals } from "@/hooks/useFinancial";
import { ProfessionalModal } from "@/components/scheduling/ProfessionalModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, Plus, Pencil, Trash2, Users, Briefcase } from "lucide-react";

export default function Team() {
    const { data: userRole } = useUserRole();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<any>(null);

    // Professional states
    const [isProfessionalModalOpen, setIsProfessionalModalOpen] = useState(false);
    const [selectedProfessional, setSelectedProfessional] = useState<any>(null);

    // Form states
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        role: "agent",
        password: "", // Only for creation
        commission: 0, // Commission percentage (0-100)
    });

    const { data: teamMembers, isLoading } = useQuery({
        queryKey: ["team-members"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("team_members")
                .select("*")
                .order("name");

            if (error) throw error;
            return data;
        },
    });

    // Professionals query
    const { data: professionals, isLoading: isProfessionalsLoading } = useProfessionals();

    // Services query (for displaying service names)
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

    // Day names helper
    const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    // Helper to get service names from IDs
    const getServiceNames = (serviceIds: string[] | null) => {
        if (!serviceIds || serviceIds.length === 0 || !services) return "-";
        return serviceIds
            .map(id => services.find((s: any) => s.id === id)?.name)
            .filter(Boolean)
            .join(", ") || "-";
    };

    // Helper to get work days names
    const getWorkDaysNames = (workDays: number[] | null) => {
        if (!workDays || workDays.length === 0) return "-";
        return workDays.map(d => DAY_NAMES[d]).join(", ");
    };

    // Delete professional mutation
    const deleteProfessionalMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("professionals")
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["professionals-list"] });
            toast({ title: "Profissional removido com sucesso!" });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao remover profissional",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const createMemberMutation = useMutation({
        mutationFn: async (newMember: any) => {
            // Get current user (admin) ID to use as owner_id
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            const { data, error } = await supabase.functions.invoke("create-team-member", {
                body: { ...newMember, owner_id: user.id },
            });

            if (error) {
                // Try to parse the error body if it exists
                let errorMessage = "Erro ao criar membro";
                try {
                    if (error instanceof Error && 'context' in error) {
                        // @ts-ignore
                        const body = await error.context.json();
                        errorMessage = body.error || errorMessage;
                    }
                } catch (e) {
                    console.error("Error parsing error body:", e);
                }
                throw new Error(errorMessage);
            }

            if (data.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["team-members"] });
            setIsAddOpen(false);
            setFormData({ name: "", email: "", phone: "", role: "agent", password: "", commission: 0 });
            toast({ title: "Membro adicionado com sucesso!" });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao adicionar membro",
                description: error.message,
                variant: "destructive",
            });
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
                })
                .eq("id", member.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["team-members"] });
            setIsEditOpen(false);
            toast({ title: "Membro atualizado com sucesso!" });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao atualizar membro",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteMemberMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await supabase.functions.invoke("delete-team-member", {
                body: { id },
            });

            if (error) {
                let errorMessage = "Erro ao remover membro";
                try {
                    if (error instanceof Error && 'context' in error) {
                        // @ts-ignore
                        const body = await error.context.json();
                        errorMessage = body.error || errorMessage;
                    }
                } catch (e) {
                    console.error("Error parsing error body:", e);
                }
                throw new Error(errorMessage);
            }

            if (data.error) throw new Error(data.error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["team-members"] });
            toast({ title: "Membro removido com sucesso!" });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao remover membro",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMemberMutation.mutate(formData);
    };

    const handleUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMember) return;
        updateMemberMutation.mutate({ ...formData, id: selectedMember.id });
    };

    if (userRole === "agent") {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
            </div>
        );
    }

    return (
        <div className="p-3 md:p-8 space-y-4 md:space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-xl md:text-3xl font-bold tracking-tight flex items-center gap-2 text-[#005AA8] dark:text-white">
                        <Users className="h-6 w-6 md:h-8 md:w-8" />
                        Equipe
                    </h2>
                    <p className="text-muted-foreground text-sm md:text-base hidden sm:block">
                        Gerencie membros e permissões
                    </p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" className="h-8 md:h-9 text-xs md:text-sm w-fit">
                            <Plus className="mr-1 md:mr-2 h-4 w-4" />
                            <span className="hidden sm:inline">Adicionar </span>Membro
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Adicionar Novo Membro</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nome</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Senha</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Telefone</Label>
                                <Input
                                    id="phone"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Função</Label>
                                <Select
                                    value={formData.role}
                                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="agent">Atendente</SelectItem>
                                        {userRole === "admin" && (
                                            <SelectItem value="supervisor">Supervisor</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            {userRole === "admin" && (
                                <div className="space-y-2">
                                    <Label htmlFor="create-commission">Comissão (%)</Label>
                                    <Input
                                        id="create-commission"
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={formData.commission}
                                        onChange={(e) => setFormData({ ...formData, commission: Number(e.target.value) || 0 })}
                                        placeholder="0"
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

            <div className="rounded-md border overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border">
                <Table>
                    <TableHeader>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground min-w-[120px]">Nome</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground hidden md:table-cell">Email</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Função</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground hidden sm:table-cell">Telefone</TableHead>
                        <TableHead className="text-right text-[#005AA8] dark:text-muted-foreground">Ações</TableHead>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8">
                                    <Loader2 className="h-6 w-6 md:h-8 md:w-8 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : (
                            teamMembers?.map((member: any) => (
                                <TableRow key={member.id}>
                                    <TableCell className="font-medium text-sm py-2 md:py-4">{member.name}</TableCell>
                                    <TableCell className="hidden md:table-cell text-sm py-2 md:py-4">{member.email}</TableCell>
                                    <TableCell className="py-2 md:py-4">
                                        <Badge variant={member.role === "admin" ? "default" : member.role === "supervisor" ? "default" : "secondary"} className="text-[10px] md:text-xs">
                                            {member.role === "admin" ? "Admin" : member.role === "supervisor" ? "Superv." : "Atend."}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-sm py-2 md:py-4">{member.phone || "-"}</TableCell>
                                    <TableCell className="text-right py-2 md:py-4">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 md:h-8 md:w-8"
                                                onClick={() => {
                                                    setSelectedMember(member);
                                                    setFormData({
                                                        name: member.name,
                                                        email: member.email,
                                                        phone: member.phone || "",
                                                        role: member.role,
                                                        password: "",
                                                        commission: member.commission || 0,
                                                    });
                                                    setIsEditOpen(true);
                                                }}
                                            >
                                                <Pencil className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                            </Button>
                                            {userRole === "admin" && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive h-7 w-7 md:h-8 md:w-8"
                                                    onClick={() => {
                                                        if (confirm("Tem certeza que deseja remover este membro?")) {
                                                            deleteMemberMutation.mutate(member.user_id);
                                                        }
                                                    }}
                                                >
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
                    <form onSubmit={handleUpdate} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Nome</Label>
                            <Input
                                id="edit-name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-phone">Telefone</Label>
                            <Input
                                id="edit-phone"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-role">Função</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                                disabled={userRole === "supervisor"}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="agent">Atendente</SelectItem>
                                    {userRole === "admin" && (
                                        <SelectItem value="supervisor">Supervisor</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        {userRole === "admin" && (
                            <div className="space-y-2">
                                <Label htmlFor="commission">Comissão (%)</Label>
                                <Input
                                    id="commission"
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={formData.commission}
                                    onChange={(e) => setFormData({ ...formData, commission: Number(e.target.value) || 0 })}
                                    placeholder="0"
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

            {/* === SEÇÃO PROFISSIONAIS === */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-8 md:mt-12">
                <div className="space-y-1">
                    <h2 className="text-xl md:text-3xl font-bold tracking-tight flex items-center gap-2 text-[#005AA8] dark:text-white">
                        <Briefcase className="h-6 w-6 md:h-8 md:w-8" />
                        Profissionais
                    </h2>
                    <p className="text-muted-foreground text-sm md:text-base hidden sm:block">
                        Profissionais cadastrados
                    </p>
                </div>
                <Button size="sm" className="h-8 md:h-9 text-xs md:text-sm w-fit" onClick={() => {
                    setSelectedProfessional(null);
                    setIsProfessionalModalOpen(true);
                }}>
                    <Plus className="mr-1 md:mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Adicionar </span>Prof.
                </Button>
            </div>

            <div className="rounded-md border overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border">
                <Table>
                    <TableHeader>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground min-w-[120px]">Nome</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground hidden sm:table-cell">Função</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground hidden md:table-cell">Serviços</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground hidden lg:table-cell">Dias</TableHead>
                        <TableHead className="text-right text-[#005AA8] dark:text-muted-foreground">Ações</TableHead>
                    </TableHeader>
                    <TableBody>
                        {isProfessionalsLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8">
                                    <Loader2 className="h-6 w-6 md:h-8 md:w-8 animate-spin mx-auto" />
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
                                                <img
                                                    src={professional.photo_url}
                                                    alt={professional.name}
                                                    className="w-6 h-6 md:w-8 md:h-8 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-500 text-xs md:text-sm font-semibold">
                                                    {professional.name?.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-sm">{professional.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell py-2 md:py-4">
                                        <Badge variant="default" className="text-[10px] md:text-xs">
                                            {professional.role || "Prof."}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[150px] hidden md:table-cell py-2 md:py-4">
                                        <span className="text-xs text-muted-foreground truncate block">
                                            {getServiceNames(professional.service_ids)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell py-2 md:py-4">
                                        <span className="text-xs">
                                            {getWorkDaysNames(professional.work_days)}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right py-2 md:py-4">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 md:h-8 md:w-8"
                                                onClick={() => {
                                                    setSelectedProfessional(professional);
                                                    setIsProfessionalModalOpen(true);
                                                }}
                                            >
                                                <Pencil className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive h-7 w-7 md:h-8 md:w-8"
                                                onClick={() => {
                                                    if (confirm("Remover este profissional?")) {
                                                        deleteProfessionalMutation.mutate(professional.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Professional Modal */}
            <ProfessionalModal
                open={isProfessionalModalOpen}
                onOpenChange={setIsProfessionalModalOpen}
                professionalToEdit={selectedProfessional}
            />
        </div>
    );
}
