import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface QueueModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    queue?: any;
    onSuccess: () => void;
}

export const QueueModal = ({ open, onOpenChange, queue, onSuccess }: QueueModalProps) => {
    const [name, setName] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [assignedUsers, setAssignedUsers] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    // Fetch users for assignment from team_members
    const { data: users } = useQuery({
        queryKey: ["team-members-for-queue"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("team_members")
                .select("id, user_id, name, role")
                .order("name");

            if (error) throw error;
            return data;
        },
    });

    useEffect(() => {
        if (queue) {
            setName(queue.name);
            setIsActive(queue.is_active);
            setAssignedUsers(queue.assigned_users || []);
        } else {
            setName("");
            setIsActive(true);
            setAssignedUsers([]);
        }
    }, [queue, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user found");

            if (queue) {
                // Update
                const { error } = await supabase
                    .from("queues")
                    .update({
                        name,
                        is_active: isActive,
                        assigned_users: assignedUsers,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", queue.id);

                if (error) throw error;
                toast({ title: "Fila atualizada com sucesso!" });
            } else {
                // Create
                const { error } = await supabase
                    .from("queues")
                    .insert({
                        user_id: user.id,
                        name,
                        is_active: isActive,
                        assigned_users: assignedUsers,
                    });

                if (error) throw error;
                toast({ title: "Fila criada com sucesso!" });
            }

            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            toast({
                title: "Erro ao salvar fila",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const toggleUser = (userId: string) => {
        setAssignedUsers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{queue ? "Editar Fila" : "Nova Fila"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome da Fila</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={queue?.is_default}
                            placeholder="Ex: Financeiro"
                            required
                        />
                    </div>

                    <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="active">Status (Ativo)</Label>
                        <Switch
                            id="active"
                            checked={isActive}
                            onCheckedChange={setIsActive}
                            disabled={queue?.is_default}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Usuários Atribuídos</Label>
                        <ScrollArea className="h-[200px] border rounded-md p-2">
                            <div className="space-y-2">
                                {users?.map((user) => (
                                    <div key={user.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`user-${user.id}`}
                                            checked={assignedUsers.includes(user.id)}
                                            onCheckedChange={() => toggleUser(user.id)}
                                        />
                                        <Label htmlFor={`user-${user.id}`} className="text-sm font-normal cursor-pointer">
                                            {user.name || "Usuário sem nome"}
                                        </Label>
                                    </div>
                                ))}
                                {(!users || users.length === 0) && (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        Nenhum usuário encontrado.
                                    </p>
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? "Salvando..." : "Salvar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
