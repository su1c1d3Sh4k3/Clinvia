import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QueueModal } from "@/components/QueueModal";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { useUserRole } from "@/hooks/useUserRole";

const Queues = () => {
    const { data: userRole } = useUserRole();
    const isSupervisor = userRole === 'supervisor';
    const isAdminOrSupervisor = userRole === 'admin' || userRole === 'supervisor';
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingQueue, setEditingQueue] = useState<any>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: queues, isLoading } = useQuery({
        queryKey: ["queues"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("queues")
                .select("*")
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data;
        },
    });

    const handleDelete = async () => {
        if (!deleteId) return;

        try {
            const { error } = await supabase
                .from("queues")
                .delete()
                .eq("id", deleteId);

            if (error) throw error;

            toast({ title: "Fila excluída com sucesso" });
            queryClient.invalidateQueries({ queryKey: ["queues"] });
        } catch (error: any) {
            toast({
                title: "Erro ao excluir fila",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setDeleteId(null);
        }
    };

    const handleEdit = (queue: any) => {
        setEditingQueue(queue);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingQueue(null);
        setIsModalOpen(true);
    };

    return (
        <div className="flex h-screen w-full bg-background">
            <div className="flex-1 overflow-auto p-4 md:p-8">
                <div className="max-w-5xl mx-auto space-y-4 md:space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold">Filas</h1>
                            <p className="text-muted-foreground text-sm md:text-base mt-1 md:mt-2">
                                Gerencie as filas de atendimento
                            </p>
                        </div>
                        {isAdminOrSupervisor && (
                            <Button onClick={handleCreate} size="sm" className="h-8 md:h-9 text-xs md:text-sm w-fit">
                                <Plus className="w-4 h-4 mr-1 md:mr-2" />
                                <span className="hidden sm:inline">Nova </span>Fila
                            </Button>
                        )}
                    </div>

                    <div className="rounded-md border overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px] text-foreground dark:text-slate-400 font-semibold hidden sm:table-cell">ID</TableHead>
                                    <TableHead className="text-foreground dark:text-slate-400 font-semibold min-w-[100px]">Nome</TableHead>
                                    <TableHead className="text-foreground dark:text-slate-400 font-semibold">Status</TableHead>
                                    <TableHead className="text-foreground dark:text-slate-400 font-semibold hidden md:table-cell">Atribuída</TableHead>
                                    <TableHead className="text-right text-foreground dark:text-slate-400 font-semibold">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8">
                                            Carregando...
                                        </TableCell>
                                    </TableRow>
                                ) : queues?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Nenhuma fila cadastrada.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    queues?.map((queue) => (
                                        <TableRow key={queue.id}>
                                            <TableCell className="font-mono text-xs hidden sm:table-cell py-2 md:py-4">
                                                {queue.id.substring(0, 8)}
                                            </TableCell>
                                            <TableCell className="font-medium text-sm py-2 md:py-4">
                                                <div className="flex items-center gap-2">
                                                    {queue.name}
                                                    {queue.is_system && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Sistema</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2 md:py-4">
                                                {queue.is_active ? (
                                                    <div className="flex items-center text-green-600">
                                                        <Check className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                                                        <span className="text-[10px] md:text-xs">Ativo</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center text-red-500">
                                                        <X className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1" />
                                                        <span className="text-[10px] md:text-xs">Inativo</span>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell py-2 md:py-4">
                                                <Badge variant="secondary" className="text-[10px] md:text-xs">
                                                    {queue.assigned_users?.length || 0} usu.
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right py-2 md:py-4">
                                                <div className="flex justify-end gap-1">
                                                    {isAdminOrSupervisor && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 md:h-8 md:w-8"
                                                            onClick={() => handleEdit(queue)}
                                                            disabled={queue.is_system}
                                                        >
                                                            <Pencil className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                        </Button>
                                                    )}
                                                    {isAdminOrSupervisor && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 md:h-8 md:w-8 text-destructive"
                                                            onClick={() => setDeleteId(queue.id)}
                                                            disabled={queue.is_system}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
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
                </div>
            </div>

            <QueueModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                queue={editingQueue}
                onSuccess={() => queryClient.invalidateQueries({ queryKey: ["queues"] })}
            />

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Fila</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir esta fila? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default Queues;
