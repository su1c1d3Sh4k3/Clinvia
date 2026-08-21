import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useUserRole } from "@/hooks/useUserRole";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EyeOff, Users } from "lucide-react";
import { toast } from "sonner";

interface RestrictGroupModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groupId: string;
    groupName?: string;
}

const ROLE_LABELS: Record<string, string> = {
    supervisor: "Supervisor",
    agent: "Atendente",
};

/**
 * Restringe a visibilidade de um grupo por membro da equipe.
 * Todos começam marcados (visível); desmarcar esconde o grupo do membro
 * (groups.hidden_from_team_member_ids + policy conversations_group_hidden).
 * Supervisor restringe só atendentes; admin restringe atendentes e supervisores.
 */
export function RestrictGroupModal({ open, onOpenChange, groupId, groupName }: RestrictGroupModalProps) {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();
    const { data: role } = useUserRole();
    // Papéis que o usuário atual pode restringir
    const restrictableRoles = role === "admin" ? ["agent", "supervisor"] : ["agent"];

    const { data: members, isLoading: membersLoading } = useQuery({
        queryKey: ["restrict-group-members", ownerId, role],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("team_members")
                .select("id, name, role, auth_user_id, user_id")
                .eq("user_id", ownerId!)
                .in("role", restrictableRoles)
                .order("name");
            if (error) throw error;
            // Blindagem: dono (auth_user_id === user_id) nunca aparece
            return (data || []).filter((m: any) => m.auth_user_id !== m.user_id) as {
                id: string; name: string; role: string;
            }[];
        },
        enabled: open && !!ownerId && !!role && role !== "agent",
    });

    const { data: hiddenIds } = useQuery({
        queryKey: ["group-hidden-members", groupId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("groups" as any)
                .select("hidden_from_team_member_ids")
                .eq("id", groupId)
                .single();
            if (error) throw error;
            return ((data as any)?.hidden_from_team_member_ids || []) as string[];
        },
        enabled: open && !!groupId,
    });

    // checked = visível. Inicializa quando os dados chegam / modal abre.
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    useEffect(() => {
        if (!open || !members || hiddenIds === undefined) return;
        const next: Record<string, boolean> = {};
        for (const m of members) next[m.id] = !hiddenIds.includes(m.id);
        setChecked(next);
    }, [open, members, hiddenIds]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const visibleToEditor = new Set((members || []).map((m) => m.id));
            const uncheckedNow = (members || [])
                .filter((m) => checked[m.id] === false)
                .map((m) => m.id);
            // Preserva restrições de membros fora do alcance do editor
            // (ex.: supervisor salvando não apaga restrição de outro supervisor)
            const preserved = (hiddenIds || []).filter((id) => !visibleToEditor.has(id));
            const newHidden = [...new Set([...preserved, ...uncheckedNow])];

            const { error } = await supabase
                .from("groups" as any)
                .update({ hidden_from_team_member_ids: newHidden } as any)
                .eq("id", groupId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Visibilidade do grupo atualizada");
            queryClient.invalidateQueries({ queryKey: ["group-hidden-members", groupId] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            onOpenChange(false);
        },
        onError: (err: any) => toast.error("Erro ao salvar: " + err.message),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <EyeOff className="h-4 w-4" />
                        Restringir Grupo
                    </DialogTitle>
                    <DialogDescription>
                        {groupName ? <span className="font-medium">{groupName}</span> : "Este grupo"} é
                        visível para todos por padrão. Desmarque quem NÃO deve ver o grupo.
                        {role === "supervisor" && " Como supervisor, você pode restringir apenas atendentes."}
                    </DialogDescription>
                </DialogHeader>

                {membersLoading ? (
                    <p className="text-sm text-muted-foreground py-4">Carregando equipe...</p>
                ) : !members?.length ? (
                    <p className="text-sm text-muted-foreground py-4 flex items-center gap-2">
                        <Users className="h-4 w-4" /> Nenhum membro restringível encontrado.
                    </p>
                ) : (
                    <ScrollArea className="max-h-[45vh]">
                        <div className="space-y-1 pr-3">
                            {members.map((m) => (
                                <label
                                    key={m.id}
                                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted cursor-pointer"
                                >
                                    <Checkbox
                                        checked={checked[m.id] !== false}
                                        onCheckedChange={(v) =>
                                            setChecked((prev) => ({ ...prev, [m.id]: v === true }))
                                        }
                                    />
                                    <span className="text-sm flex-1 truncate">{m.name}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                        {ROLE_LABELS[m.role] || m.role}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </ScrollArea>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending || membersLoading}
                    >
                        {saveMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
