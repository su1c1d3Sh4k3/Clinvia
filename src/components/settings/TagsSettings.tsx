import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface TagRow {
    id: string;
    name: string;
    color: string | null;
    created_at: string;
}

export function TagsSettings() {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState("#8B5CF6");

    const { data: tags, isLoading } = useQuery({
        queryKey: ["tags-settings"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tags" as any)
                .select("id, name, color, created_at")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data as unknown as TagRow[];
        },
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["tags-settings"] });
        queryClient.invalidateQueries({ queryKey: ["tags-filter"] });
    };

    const createMutation = useMutation({
        mutationFn: async () => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            const name = newName.trim();
            if (!name) throw new Error("Informe o nome da tag");
            const { error } = await supabase
                .from("tags" as any)
                .insert({ user_id: ownerId, name, color: newColor, is_active: true });
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Tag criada com sucesso");
            setIsCreateOpen(false);
            setNewName("");
            setNewColor("#8B5CF6");
            invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Erro ao criar tag"),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("tags" as any)
                .update({ is_active: false })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Tag removida");
            invalidate();
        },
        onError: (err: any) => toast.error(err.message || "Erro ao remover tag"),
    });

    return (
        <Card>
            <CardHeader className="p-4 md:p-6 flex flex-row items-center justify-between space-y-0">
                <div>
                    <CardTitle className="text-base md:text-lg">Tags</CardTitle>
                    <CardDescription className="text-xs md:text-sm mt-1">
                        Gerencie as tags usadas para classificar seus contatos.
                    </CardDescription>
                </div>
                <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Nova Tag
                </Button>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
                {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin" /> Carregando tags...
                    </div>
                ) : !tags || tags.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                        <TagIcon className="h-8 w-8" />
                        <p className="text-sm">Nenhuma tag criada ainda.</p>
                    </div>
                ) : (
                    <div className="border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr className="text-left text-xs text-muted-foreground">
                                    <th className="px-3 py-2 font-medium">Cor</th>
                                    <th className="px-3 py-2 font-medium">Nome</th>
                                    <th className="px-3 py-2 font-medium">Criada em</th>
                                    <th className="px-3 py-2 font-medium text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {tags.map((tag) => (
                                    <tr key={tag.id}>
                                        <td className="px-3 py-2">
                                            <span
                                                className="inline-block w-4 h-4 rounded-full border"
                                                style={{ backgroundColor: tag.color || "#000000" }}
                                            />
                                        </td>
                                        <td className="px-3 py-2 font-medium">{tag.name}</td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                            {new Date(tag.created_at).toLocaleDateString("pt-BR")}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                title="Remover tag"
                                                onClick={() => deleteMutation.mutate(tag.id)}
                                                disabled={deleteMutation.isPending}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Nova Tag</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="tag-name">Nome</Label>
                            <Input
                                id="tag-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Ex: VIP, Retorno, Botox..."
                                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMutation.mutate(); }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tag-color">Cor</Label>
                            <div className="flex items-center gap-3">
                                <input
                                    id="tag-color"
                                    type="color"
                                    value={newColor}
                                    onChange={(e) => setNewColor(e.target.value)}
                                    className="h-9 w-14 rounded border cursor-pointer bg-transparent p-1"
                                />
                                <span className="text-sm text-muted-foreground">{newColor}</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                        <Button
                            onClick={() => createMutation.mutate()}
                            disabled={!newName.trim() || createMutation.isPending}
                        >
                            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Criar Tag
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
