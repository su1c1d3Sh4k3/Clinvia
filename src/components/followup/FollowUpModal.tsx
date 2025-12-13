import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { useFollowUpCategories, useCreateFollowUpTemplate, useUpdateFollowUpTemplate, FollowUpTemplate } from "@/hooks/useFollowUp";
import { CategoryModal } from "./CategoryModal";

interface FollowUpModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    templateToEdit?: FollowUpTemplate | null;
}

export function FollowUpModal({ open, onOpenChange, templateToEdit }: FollowUpModalProps) {
    const { data: categories, isLoading: loadingCategories } = useFollowUpCategories();
    const createMutation = useCreateFollowUpTemplate();
    const updateMutation = useUpdateFollowUpTemplate();

    const [categoryId, setCategoryId] = useState(templateToEdit?.category_id || "");
    const [name, setName] = useState(templateToEdit?.name || "");
    const [timeMinutes, setTimeMinutes] = useState(templateToEdit?.time_minutes?.toString() || "30");
    const [message, setMessage] = useState(templateToEdit?.message || "");
    const [showCategoryModal, setShowCategoryModal] = useState(false);

    const isLoading = createMutation.isPending || updateMutation.isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!categoryId || !name || !timeMinutes || !message) return;

        const data = {
            category_id: categoryId,
            name,
            time_minutes: parseInt(timeMinutes),
            message,
        };

        if (templateToEdit) {
            await updateMutation.mutateAsync({ id: templateToEdit.id, ...data });
        } else {
            await createMutation.mutateAsync(data);
        }

        onOpenChange(false);
        resetForm();
    };

    const resetForm = () => {
        setCategoryId("");
        setName("");
        setTimeMinutes("30");
        setMessage("");
    };

    // Reset when opening with different template
    useState(() => {
        if (open && templateToEdit) {
            setCategoryId(templateToEdit.category_id);
            setName(templateToEdit.name);
            setTimeMinutes(templateToEdit.time_minutes.toString());
            setMessage(templateToEdit.message);
        } else if (open && !templateToEdit) {
            resetForm();
        }
    });

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{templateToEdit ? "Editar" : "Novo"} Follow Up</DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Category */}
                        <div className="space-y-2">
                            <Label>Categoria</Label>
                            <div className="flex gap-2">
                                <Select value={categoryId} onValueChange={setCategoryId}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Selecione uma categoria" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {loadingCategories ? (
                                            <div className="p-2 text-center text-sm text-muted-foreground">Carregando...</div>
                                        ) : categories?.length === 0 ? (
                                            <div className="p-2 text-center text-sm text-muted-foreground">Nenhuma categoria</div>
                                        ) : (
                                            categories?.map((cat) => (
                                                <SelectItem key={cat.id} value={cat.id}>
                                                    {cat.name}
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="outline" size="icon" onClick={() => setShowCategoryModal(true)}>
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Name */}
                        <div className="space-y-2">
                            <Label>Nome</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Primeira mensagem"
                                required
                            />
                        </div>

                        {/* Time */}
                        <div className="space-y-2">
                            <Label>Tempo (minutos)</Label>
                            <Input
                                type="number"
                                min="1"
                                value={timeMinutes}
                                onChange={(e) => setTimeMinutes(e.target.value)}
                                placeholder="30"
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                Tempo após a última mensagem do cliente para liberar este follow
                            </p>
                        </div>

                        {/* Message */}
                        <div className="space-y-2">
                            <Label>Mensagem</Label>
                            <Textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Digite a mensagem do follow up..."
                                rows={4}
                                required
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {templateToEdit ? "Atualizar" : "Criar"} Follow Up
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <CategoryModal open={showCategoryModal} onOpenChange={setShowCategoryModal} />
        </>
    );
}
