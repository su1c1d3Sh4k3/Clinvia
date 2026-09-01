import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ProfessionalModal } from "@/components/scheduling/ProfessionalModal";
import {
    useResponsaveis,
    useToggleResponsavelActive,
    useDeleteResponsavel,
    countFutureAppointments,
    type Responsavel,
} from "@/hooks/useResponsaveis";

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function ProfissionaisTab() {
    const { toast } = useToast();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const { data: responsaveis, isLoading } = useResponsaveis();
    const toggleActive = useToggleResponsavelActive();
    const remove = useDeleteResponsavel();

    const [modalOpen, setModalOpen] = useState(false);
    const [selected, setSelected] = useState<Responsavel | null>(null);

    const openModal = (resp: Responsavel | null) => {
        setSelected(resp);
        setModalOpen(true);
    };

    // Inativar tira a sala da agenda e cancela o que estava marcado pra frente.
    const handleToggle = async (resp: Responsavel, active: boolean) => {
        if (!active && resp.sala) {
            let pending = 0;
            try {
                pending = await countFutureAppointments(resp.sala.id);
            } catch {
                /* sem a contagem o aviso fica genérico, mas a confirmação continua */
            }
            const aviso = pending > 0
                ? `Inativar "${resp.name}" vai cancelar ${pending} agendamento(s) futuro(s) da sala dele. Continuar?`
                : `Inativar "${resp.name}"? A sala dele sai da agenda.`;
            if (!confirm(aviso)) return;
        }
        toggleActive.mutate(
            { id: resp.id, active },
            {
                onSuccess: () =>
                    toast({
                        title: active
                            ? "Profissional reativado."
                            : "Profissional inativado — a sala dele saiu da agenda.",
                    }),
                onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
            }
        );
    };

    const handleDelete = (resp: Responsavel) => {
        if (!confirm(`Excluir o profissional "${resp.name}"? A sala dele também será excluída.`)) return;
        remove.mutate(resp.id, {
            onSuccess: () => toast({ title: "Profissional excluído." }),
            onError: (e: any) =>
                toast({
                    title: "Não foi possível excluir",
                    description: e.message?.includes("agendamentos futuros")
                        ? "A sala deste profissional possui agendamentos futuros. Cancele ou reagende antes de excluir."
                        : e.message,
                    variant: "destructive",
                }),
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Quem realiza os atendimentos. Cada profissional tem uma sala própria, criada junto com ele.
                </p>
                {canCreate("professionals") && (
                    <Button size="sm" className="shrink-0" onClick={() => openModal(null)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Profissional
                    </Button>
                )}
            </div>

            <div className="rounded-md border overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-[140px]">Nome</TableHead>
                            <TableHead className="hidden sm:table-cell">Cargo</TableHead>
                            <TableHead className="hidden md:table-cell">Sala</TableHead>
                            <TableHead className="hidden lg:table-cell">Dias</TableHead>
                            <TableHead>Ativo</TableHead>
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
                        ) : !responsaveis?.length ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                                    Nenhum profissional cadastrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            responsaveis.map((resp) => (
                                <TableRow key={resp.id} className={resp.active ? "" : "opacity-60"}>
                                    <TableCell className="font-medium py-2 md:py-4">
                                        <div className="flex items-center gap-2">
                                            <Avatar className="w-8 h-8">
                                                <AvatarImage src={resp.photo_url || undefined} className="object-cover" />
                                                <AvatarFallback className="bg-cyan-500/20 text-cyan-600 text-xs font-semibold">
                                                    {resp.name.charAt(0).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm">{resp.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell py-2 md:py-4">
                                        {resp.role ? <Badge variant="secondary" className="text-xs">{resp.role}</Badge> : "-"}
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell py-2 md:py-4 text-xs text-muted-foreground">
                                        {resp.sala?.name || "—"}
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell py-2 md:py-4 text-xs">
                                        {(resp.sala?.work_days || []).map((d) => DAY_NAMES[d]).join(", ") || "-"}
                                    </TableCell>
                                    <TableCell className="py-2 md:py-4">
                                        <Switch
                                            checked={resp.active}
                                            disabled={!canEdit("professionals") || toggleActive.isPending}
                                            onCheckedChange={(active) => handleToggle(resp, active)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right py-2 md:py-4">
                                        <div className="flex justify-end gap-1">
                                            {canEdit("professionals") && (
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(resp)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {canDelete("professionals") && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => handleDelete(resp)}
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
                variant="responsavel"
                responsavelToEdit={selected}
                professionalToEdit={selected?.sala ?? null}
            />
        </div>
    );
}
