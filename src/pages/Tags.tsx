import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Tag as TagIcon } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TagModal } from "@/components/TagModal";
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

interface Tag {
    id: string;
    name: string;
    color: string;
    is_active: boolean;
}

const Tags = () => {
    const { data: userRole } = useUserRole();
    const isAdminOrSupervisor = userRole === 'admin' || userRole === 'supervisor';
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: tags, isLoading } = useQuery({
        queryKey: ["tags"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tags")
                .select("*")
                .order("name");

            if (error) throw error;
            return data as Tag[];
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("tags").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tags"] });
            toast({ title: "Tag excluída com sucesso" });
            setTagToDelete(null);
        },
        onError: (error) => {
            toast({
                title: "Erro ao excluir",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleEdit = (tag: Tag) => {
        setEditingTag(tag);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingTag(null);
        setIsModalOpen(true);
    };

    return (
        <div className="flex h-screen w-full bg-background">
            <div className="flex-1 p-4 md:p-8 overflow-auto">
                <div className="max-w-5xl mx-auto space-y-4 md:space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                                <TagIcon className="w-6 h-6 md:w-8 md:h-8" />
                                Tags
                            </h1>
                            <p className="text-muted-foreground text-sm md:text-base mt-1 md:mt-2">
                                Gerencie as tags para categorizar conversas
                            </p>
                        </div>
                        {isAdminOrSupervisor && (
                            <Button onClick={handleAddNew} size="sm" className="h-8 md:h-9 text-xs md:text-sm w-fit">
                                <Plus className="w-4 h-4 mr-1 md:mr-2" />
                                <span className="hidden sm:inline">Nova </span>Tag
                            </Button>
                        )}
                    </div>

                    <div className="border rounded-lg overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold min-w-[120px]">Nome</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold">Status</TableHead>
                                    <TableHead className="w-[80px] md:w-[100px] text-secondary dark:text-slate-400 font-semibold">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8">
                                            Carregando...
                                        </TableCell>
                                    </TableRow>
                                ) : tags?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                            Nenhuma tag encontrada
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    tags?.map((tag) => (
                                        <TableRow key={tag.id}>
                                            <TableCell className="py-2 md:py-4">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 md:w-4 md:h-4 rounded-full border flex-shrink-0"
                                                        style={{ backgroundColor: tag.color }}
                                                    />
                                                    <span className="font-medium text-sm">{tag.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-2 md:py-4">
                                                <Badge variant={tag.is_active ? "default" : "secondary"} className="text-[10px] md:text-xs">
                                                    {tag.is_active ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-2 md:py-4">
                                                <div className="flex items-center gap-1">
                                                    {isAdminOrSupervisor && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 md:h-8 md:w-8"
                                                            onClick={() => handleEdit(tag)}
                                                        >
                                                            <Pencil className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                        </Button>
                                                    )}
                                                    {userRole === "admin" && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className={`h-7 w-7 md:h-8 md:w-8 ${tag.name === "IA"
                                                                ? "text-muted-foreground/50 cursor-not-allowed"
                                                                : "text-destructive hover:text-destructive"}`}
                                                            onClick={() => tag.name !== "IA" && setTagToDelete(tag)}
                                                            disabled={tag.name === "IA"}
                                                            title={tag.name === "IA" ? "Tag do sistema" : "Excluir tag"}
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

            <TagModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                tagToEdit={editingTag}
            />

            <AlertDialog open={!!tagToDelete} onOpenChange={(open) => !open && setTagToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Tag</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir a tag "{tagToDelete?.name}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => tagToDelete && deleteMutation.mutate(tagToDelete.id)}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default Tags;
