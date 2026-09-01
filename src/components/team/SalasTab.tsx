import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, DoorOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useOwnerId } from "@/hooks/useOwnerId";
import { ProfessionalModal } from "@/components/scheduling/ProfessionalModal";
import { useSalas, useToggleSalaActive, useDeleteSala, countFutureAppointments, type Sala } from "@/hooks/useResponsaveis";

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function SalasTab() {
    const { toast } = useToast();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const { data: ownerId } = useOwnerId();
    const { data: salas, isLoading } = useSalas();
    const toggleActive = useToggleSalaActive();
    const remove = useDeleteSala();

    const [modalOpen, setModalOpen] = useState(false);
    const [selected, setSelected] = useState<Sala | null>(null);

    const { data: servicesClient } = useQuery({
        queryKey: ["services-client-list", ownerId],
        enabled: !!ownerId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("services_client" as any)
                .select("id, name, professionals")
                .eq("user_id", ownerId!)
                .eq("status", true)
                .order("name");
            if (error) throw error;
            return (data || []) as Array<{ id: string; name: string; professionals: string[] | null }>;
        },
    });

    const serviceNames = (salaId: string) => {
        const linked = (servicesClient || []).filter((s) => (s.professionals || []).includes(salaId)).map((s) => s.name);
        return linked.length ? linked.join(", ") : "-";
    };

    const handleToggle = async (sala: Sala, active: boolean) => {
        if (!active) {
            let pending = 0;
            try {
                pending = await countFutureAppointments(sala.id);
            } catch {
                /* sem a contagem o aviso fica genérico, mas a confirmação continua */
            }
            const aviso = pending > 0
                ? `Inativar a sala "${sala.name}" vai cancelar ${pending} agendamento(s) futuro(s). Continuar?`
                : `Inativar a sala "${sala.name}"? Ela sai da agenda.`;
            if (!confirm(aviso)) return;
        }
        toggleActive.mutate(
            { id: sala.id, active },
            {
                onSuccess: () => toast({ title: active ? "Sala reativada." : "Sala inativada — saiu da agenda." }),
                onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
            }
        );
    };

    const handleDelete = (sala: Sala) => {
        if (sala.responsavel_id) {
            toast({
                title: "Esta sala pertence a um profissional",
                description: "Exclua o profissional na aba Profissionais — a sala é excluída junto.",
                variant: "destructive",
            });
            return;
        }
        if (!confirm(`Excluir a sala "${sala.name}"?`)) return;
        remove.mutate(sala.id, {
            onSuccess: () => toast({ title: "Sala excluída." }),
            onError: (e: any) =>
                toast({
                    title: "Não foi possível excluir",
                    description: e.message?.includes("agendamentos futuros")
                        ? "Esta sala possui agendamentos futuros. Cancele ou reagende antes de excluir."
                        : e.message,
                    variant: "destructive",
                }),
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    As agendas da clínica. Salas de profissional são criadas automaticamente; as demais são avulsas e
                    atendem qualquer profissional disponível.
                </p>
                {canCreate("professionals") && (
                    <Button
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                            setSelected(null);
                            setModalOpen(true);
                        }}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Sala
                    </Button>
                )}
            </div>

            <div className="rounded-md border overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-[140px]">Sala</TableHead>
                            <TableHead className="hidden sm:table-cell">Profissional</TableHead>
                            <TableHead className="hidden md:table-cell">Serviços</TableHead>
                            <TableHead className="hidden lg:table-cell">Dias</TableHead>
                            <TableHead>Ativa</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : !salas?.length ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                                    Nenhuma sala cadastrada.
                                </TableCell>
                            </TableRow>
                        ) : (
                            salas.map((sala) => (
                                <TableRow key={sala.id} className={sala.active ? "" : "opacity-60"}>
                                    <TableCell className="font-medium py-2 md:py-4">
                                        <div className="flex items-center gap-2">
                                            <DoorOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <span className="text-sm">{sala.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell py-2 md:py-4">
                                        {sala.responsavel ? (
                                            <Badge variant="default" className="text-xs">{sala.responsavel.name}</Badge>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Sala avulsa</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="max-w-[180px] hidden md:table-cell py-2 md:py-4">
                                        <span className="text-xs text-muted-foreground truncate block">{serviceNames(sala.id)}</span>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell py-2 md:py-4 text-xs">
                                        {(sala.work_days || []).map((d) => DAY_NAMES[d]).join(", ") || "-"}
                                    </TableCell>
                                    <TableCell className="py-2 md:py-4">
                                        <Switch
                                            checked={sala.active}
                                            disabled={!canEdit("professionals") || !!sala.responsavel_id || toggleActive.isPending}
                                            onCheckedChange={(active) => handleToggle(sala, active)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right py-2 md:py-4">
                                        <div className="flex justify-end gap-1">
                                            {canEdit("professionals") && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => {
                                                        setSelected(sala);
                                                        setModalOpen(true);
                                                    }}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canDelete("professionals") && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDelete(sala)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
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
                open={modalOpen}
                onOpenChange={setModalOpen}
                variant="sala"
                professionalToEdit={selected}
            />
        </div>
    );
}
