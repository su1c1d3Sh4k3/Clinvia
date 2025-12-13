import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

interface Tag {
    id: string;
    name: string;
    color: string;
    is_active: boolean;
}

interface TagModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tagToEdit?: Tag | null;
}

export const TagModal = ({ open, onOpenChange, tagToEdit }: TagModalProps) => {
    const [name, setName] = useState("");
    const [color, setColor] = useState("#000000");
    const [isActive, setIsActive] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAuth();

    useEffect(() => {
        if (tagToEdit) {
            setName(tagToEdit.name);
            setColor(tagToEdit.color);
            setIsActive(tagToEdit.is_active);
        } else {
            setName("");
            setColor("#000000");
            setIsActive(true);
        }
    }, [tagToEdit, open]);

    const handleSave = async () => {
        if (!name.trim()) {
            toast({
                title: "Erro",
                description: "O nome da tag é obrigatório",
                variant: "destructive",
            });
            return;
        }

        if (!user) {
            toast({
                title: "Erro",
                description: "Usuário não autenticado",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            if (tagToEdit) {
                const { error } = await supabase
                    .from("tags")
                    .update({ name, color, is_active: isActive })
                    .eq("id", tagToEdit.id);

                if (error) throw error;
                toast({ title: "Tag atualizada com sucesso!" });
            } else {
                const { error } = await supabase
                    .from("tags")
                    .insert({
                        name,
                        color,
                        is_active: isActive,
                        user_id: user.id
                    });

                if (error) throw error;
                toast({ title: "Tag criada com sucesso!" });
            }

            queryClient.invalidateQueries({ queryKey: ["tags"] });
            onOpenChange(false);
        } catch (error: any) {
            toast({
                title: "Erro ao salvar",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{tagToEdit ? "Editar Tag" : "Nova Tag"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Urgente, Financeiro..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="color">Cor</Label>
                        <div className="flex gap-2">
                            <Input
                                id="color"
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="w-12 h-10 p-1 cursor-pointer"
                            />
                            <Input
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                placeholder="#000000"
                                className="flex-1"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="active">Ativo</Label>
                        <Switch
                            id="active"
                            checked={isActive}
                            onCheckedChange={setIsActive}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading}>
                        {isLoading ? "Salvando..." : "Salvar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
