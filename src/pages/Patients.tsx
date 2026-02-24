import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Search, UserRound } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
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
import { PatientModal } from "@/components/patients/PatientModal";
import { PatientDetailsCard } from "@/components/patients/PatientDetailsCard";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface Patient {
    id: string;
    user_id: string;
    contact_id?: string;
    nome: string;
    telefone: string;
    email?: string;
    cpf?: string;
    rg?: string;
    data_nascimento?: string;
    sexo?: string;
    nome_civil?: string;
    cep?: string;
    endereco?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    estado_civil?: string;
    escolaridade?: string;
    profissao?: string;
    contatos_emergencia?: { nome: string; telefone: string }[];
    convenios?: { nome: string; tipo_plano: string; numero_carteirinha: string; validade: string; carencia: string; acomodacao: string }[];
    docs?: string[];
    photos?: string[];
    notes?: { data: string; titulo: string; descricao: string }[];
    created_at: string;
    updated_at: string;
    profile_pic_url?: string;
    contacts?: {
        profile_pic_url?: string;
    };
}

const Patients = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
    const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Passo 1: Buscar user_id do usuário logado na team_members
    const { data: ownerId } = useQuery({
        queryKey: ["owner-id-patients"],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            // Buscar team_members onde auth_user_id = id do usuário logado
            const { data: teamMember, error } = await supabase
                .from("team_members")
                .select("user_id")
                .eq("auth_user_id", user.id)
                .maybeSingle();

            if (error) {
                console.error("Erro ao buscar team_member:", error);
            }

            // Se encontrou, retorna o user_id
            if (teamMember?.user_id) {
                return teamMember.user_id;
            }

            // Fallback: buscar onde user_id = auth.uid (para admins)
            const { data: adminMember } = await supabase
                .from("team_members")
                .select("user_id")
                .eq("user_id", user.id)
                .maybeSingle();

            if (adminMember?.user_id) {
                return adminMember.user_id;
            }

            // Último fallback
            return user.id;
        },
    });

    // Passo 2: Buscar patients usando RPC que bypassa RLS
    const { data: patients, isLoading } = useQuery({
        queryKey: ["patients", ownerId],
        queryFn: async () => {
            if (!ownerId) return [];

            // Primeiro: tentar via RPC (bypassa RLS)
            const { data: rpcData, error: rpcError } = await supabase
                .rpc("get_my_patients");

            let patientsData: Patient[] = [];

            if (!rpcError && rpcData) {
                console.log("[Patients] Dados via RPC:", rpcData.length);
                patientsData = rpcData as Patient[];
            } else {
                // Fallback: query direta (se RPC não existir ainda)
                console.log("[Patients] RPC falhou, tentando query direta. Erro:", rpcError);
                const { data, error } = await supabase
                    .from("patients")
                    .select("*")
                    .eq("user_id", ownerId)
                    .order("nome");

                if (error) {
                    console.error("[Patients] Erro na query direta:", error);
                    throw error;
                }
                patientsData = data as Patient[];
            }

            // Buscar fotos dos contatos para os patients que têm contact_id
            const contactIds = patientsData
                .filter(p => p.contact_id)
                .map(p => p.contact_id!);

            if (contactIds.length > 0) {
                const { data: contacts } = await supabase
                    .from("contacts")
                    .select("id, profile_pic_url")
                    .in("id", contactIds);

                if (contacts) {
                    const contactMap = new Map(contacts.map(c => [c.id, c.profile_pic_url]));
                    patientsData = patientsData.map(p => ({
                        ...p,
                        profile_pic_url: p.contact_id ? contactMap.get(p.contact_id) || undefined : undefined
                    }));
                }
            }

            console.log("[Patients] Dados finais:", patientsData.length);
            return patientsData;
        },
        enabled: !!ownerId,
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            // First, update the contact to remove patient reference
            const patient = patients?.find(p => p.id === id);
            if (patient?.contact_id) {
                await supabase
                    .from("contacts")
                    .update({ patient: false, patient_id: null } as any)
                    .eq("id", patient.contact_id);
            }

            const { error } = await supabase.from("patients" as any).delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["patients"] });
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            toast({ title: "Paciente excluído com sucesso" });
            setPatientToDelete(null);
        },
        onError: (error) => {
            toast({
                title: "Erro ao excluir",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleEdit = (patient: Patient) => {
        setEditingPatient(patient);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingPatient(null);
        setIsModalOpen(true);
    };

    const handleRowClick = (patient: Patient) => {
        setSelectedPatient(patient);
    };

    const filteredPatients = patients?.filter((patient) =>
        patient.nome?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatCPF = (cpf?: string) => {
        if (!cpf) return "-";
        const cleaned = cpf.replace(/\D/g, "");
        if (cleaned.length !== 11) return cpf;
        return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
    };

    const formatPhone = (phone?: string) => {
        if (!phone) return "-";
        const cleaned = phone.replace(/\D/g, "");
        if (cleaned.length === 13) {
            return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 5)} ${cleaned.slice(5, 9)}-${cleaned.slice(9)}`;
        }
        return phone;
    };

    return (
        <div className="flex h-screen w-full bg-background">
            <div className="flex-1 p-4 md:p-8 overflow-auto">
                <div className="max-w-6xl mx-auto space-y-4 md:space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                                <UserRound className="w-7 h-7" />
                                Pacientes
                            </h1>
                            <p className="text-muted-foreground text-sm md:text-base mt-1 md:mt-2">
                                Gerencie os pacientes cadastrados
                            </p>
                        </div>
                        <Button onClick={handleAddNew} size="sm" className="h-8 md:h-9 text-xs md:text-sm w-fit">
                            <Plus className="w-4 h-4 mr-1 md:mr-2" />
                            <span className="hidden sm:inline">Novo </span>Paciente
                        </Button>
                    </div>

                    <div className="flex flex-col gap-3 md:gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-secondary" />
                            <Input
                                placeholder="Buscar por nome..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-9 bg-white dark:bg-background border border-[#D4D5D6] dark:border-border"
                            />
                        </div>
                    </div>

                    <div className="rounded-md border overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border min-w-0">
                        <Table className="table-fixed w-full">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold w-[30%]">Nome</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold hidden sm:table-cell w-[20%]">Telefone</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold hidden md:table-cell w-[18%]">CPF</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold hidden lg:table-cell w-[18%]">Última Atualização</TableHead>
                                    <TableHead className="w-[14%] text-secondary dark:text-slate-400 font-semibold">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8">
                                            Carregando...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredPatients?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Nenhum paciente encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredPatients?.map((patient) => (
                                        <TableRow
                                            key={patient.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => handleRowClick(patient)}
                                        >
                                            <TableCell className="py-2 md:py-4">
                                                <div className="flex items-center gap-2 md:gap-3">
                                                    <Avatar className="h-8 w-8 md:h-10 md:w-10">
                                                        <AvatarImage src={patient.profile_pic_url || patient.contacts?.profile_pic_url} />
                                                        <AvatarFallback className="text-xs md:text-sm">
                                                            {patient.nome?.[0] || "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="font-medium text-sm truncate">{patient.nome}</span>
                                                        <span className="text-xs text-muted-foreground sm:hidden truncate">
                                                            {formatPhone(patient.telefone)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell py-2 md:py-4 text-sm truncate">
                                                {formatPhone(patient.telefone)}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell py-2 md:py-4 text-sm">
                                                {formatCPF(patient.cpf)}
                                            </TableCell>
                                            <TableCell className="hidden lg:table-cell py-2 md:py-4 text-sm text-muted-foreground">
                                                {patient.updated_at
                                                    ? format(new Date(patient.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                                                    : "-"
                                                }
                                            </TableCell>
                                            <TableCell className="py-2 md:py-4">
                                                <div className="flex items-center gap-0.5 md:gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 md:h-8 md:w-8"
                                                        onClick={() => handleEdit(patient)}
                                                        title="Editar"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive h-7 w-7 md:h-8 md:w-8"
                                                        onClick={() => setPatientToDelete(patient)}
                                                        title="Excluir"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>

            <PatientModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                patientToEdit={editingPatient}
            />

            <PatientDetailsCard
                patient={selectedPatient}
                onClose={() => setSelectedPatient(null)}
            />

            <AlertDialog open={!!patientToDelete} onOpenChange={(open) => !open && setPatientToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Paciente</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir o paciente "{patientToDelete?.nome}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => patientToDelete && deleteMutation.mutate(patientToDelete.id)}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default Patients;
