import { useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";
import { sendTransferNotice } from "@/components/queues/TransferNoticeListener";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, ListOrdered, Loader2, Users } from "lucide-react";

interface TransferAtendimentoModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversationId: string;
    /** conversations row — usado para instance_id/instagram_instance_id e fila atual */
    conversation: any;
}

interface ScopedMember {
    id: string;
    name: string;
    role: "admin" | "supervisor" | "agent";
    avatar_url: string | null;
    allowed_instance_ids: string[] | null;
    assigned_queue_ids: string[] | null;
}

const ROLE_LABEL: Record<string, string> = {
    admin: "Admin",
    supervisor: "Supervisor",
    agent: "Atendente",
};

/**
 * Modal "Transferir Atendimento" (2 etapas):
 * 1. Escolher a fila de destino (sempre uma fila — conversa nunca fica sem fila)
 * 2. Escolher o atendente: admins/supervisores sempre disponíveis; agentes só se
 *    a fila escolhida E a instância da conversa estiverem no escopo deles
 *    (assigned_queue_ids / allowed_instance_ids — NULL = todas). Opção
 *    "Não atribuir usuário" envia para a fila sem responsável fixo.
 */
export function TransferAtendimentoModal({
    open,
    onOpenChange,
    conversationId,
    conversation,
}: TransferAtendimentoModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();
    const { user } = useAuth();
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();

    const [selectedQueue, setSelectedQueue] = useState<{ id: string; name: string } | null>(null);
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null); // null = não atribuir
    const [step, setStep] = useState<1 | 2>(1);

    const conversationInstanceId: string | null =
        (conversation as any)?.instance_id ?? (conversation as any)?.instagram_instance_id ?? null;

    const { data: queues, isLoading: queuesLoading } = useQuery({
        queryKey: ["queues-active"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("queues")
                .select("id, name")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data;
        },
        enabled: open,
    });

    const { data: members, isLoading: membersLoading } = useQuery({
        queryKey: ["transfer-scope-members", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("team_members" as any)
                .select("id, name, role, avatar_url, allowed_instance_ids, assigned_queue_ids")
                .eq("user_id", ownerId)
                .order("name");
            if (error) throw error;
            return (data ?? []) as unknown as ScopedMember[];
        },
        enabled: open && !!ownerId,
    });

    // Atendentes disponíveis para a fila escolhida + instância da conversa
    const availableMembers = useMemo(() => {
        if (!members || !selectedQueue) return [];
        return members.filter((m) => {
            if (m.role !== "agent") return true; // admin/supervisor veem tudo
            const queueOk =
                !m.assigned_queue_ids || m.assigned_queue_ids.includes(selectedQueue.id);
            const instanceOk =
                !m.allowed_instance_ids ||
                !conversationInstanceId ||
                m.allowed_instance_ids.includes(conversationInstanceId);
            return queueOk && instanceOk;
        });
    }, [members, selectedQueue, conversationInstanceId]);

    const transferMutation = useMutation({
        mutationFn: async ({ queueId, agentId }: { queueId: string; agentId: string | null }) => {
            // RPC SECURITY DEFINER: update direto falhava p/ agent→agent (policy
            // conversations_agent_assignment vs RETURNING do PostgREST)
            const { error } = await (supabase as any).rpc("transfer_conversation", {
                p_conversation_id: conversationId,
                p_queue_id: queueId,
                p_agent_id: agentId,
            });
            if (error) throw error;
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            const agentName = vars.agentId
                ? members?.find((m) => m.id === vars.agentId)?.name
                : null;

            // Aviso em tempo real (só quem está online recebe): admin/supervisor
            // transferiu um cliente ENTRE atendentes — notifica quem perdeu e quem recebeu.
            const prevAgentId: string | null = (conversation as any)?.assigned_agent_id ?? null;
            if (
                ownerId &&
                user?.id &&
                (userRole === "admin" || userRole === "supervisor") &&
                prevAgentId &&
                vars.agentId &&
                prevAgentId !== vars.agentId
            ) {
                const contactRow = (conversation as any)?.contacts;
                sendTransferNotice(ownerId, {
                    actor_auth_id: user.id,
                    actor_name: (currentTeamMember as any)?.name || "—",
                    actor_role: userRole,
                    client_name:
                        contactRow?.push_name || contactRow?.name || contactRow?.number || "Cliente",
                    to_agent_name: agentName || "—",
                    from_tm_id: prevAgentId,
                    to_tm_id: vars.agentId,
                });
            }
            toast({
                title: "Atendimento transferido",
                description: agentName
                    ? `Conversa enviada para ${selectedQueue?.name} — responsável: ${agentName}.`
                    : `Conversa enviada para ${selectedQueue?.name} sem responsável fixo.`,
            });
            handleClose(false);
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao transferir",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const resetState = () => {
        setStep(1);
        setSelectedQueue(null);
        setSelectedAgentId(null);
    };

    const handleClose = (val: boolean) => {
        if (!val) resetState();
        onOpenChange(val);
    };

    const handlePickQueue = (queue: { id: string; name: string }) => {
        setSelectedQueue(queue);
        setSelectedAgentId(null);
        setStep(2);
    };

    const handleConfirm = () => {
        if (!selectedQueue) return;
        transferMutation.mutate({ queueId: selectedQueue.id, agentId: selectedAgentId });
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-[440px] max-h-[85vh] overflow-y-auto rounded-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                        <ListOrdered className="w-5 h-5 text-primary" />
                        Transferir Atendimento
                    </DialogTitle>
                    <DialogDescription className="pt-1 text-[14px]">
                        {step === 1
                            ? "Escolha a fila de destino da conversa."
                            : (
                                <>
                                    Fila: <strong className="text-foreground">{selectedQueue?.name}</strong>.
                                    Escolha quem será o responsável.
                                </>
                            )}
                    </DialogDescription>
                </DialogHeader>

                {step === 1 && (
                    <div className="py-2 space-y-1.5 max-h-[50vh] overflow-y-auto">
                        {queuesLoading && (
                            <div className="flex justify-center py-6">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        {!queuesLoading && !queues?.length && (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                Nenhuma fila ativa encontrada.
                            </p>
                        )}
                        {queues?.map((queue) => (
                            <button
                                key={queue.id}
                                type="button"
                                onClick={() => handlePickQueue(queue)}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-2.5 rounded-md border text-sm text-left transition-colors",
                                    "hover:bg-accent hover:border-primary/40",
                                    (conversation as any)?.queue_id === queue.id && "border-primary/60 bg-primary/5"
                                )}
                            >
                                <span className="truncate">{queue.name}</span>
                                {(conversation as any)?.queue_id === queue.id && (
                                    <span className="text-[10px] text-primary font-semibold uppercase shrink-0 ml-2">
                                        Fila atual
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {step === 2 && (
                    <div className="py-2 space-y-1.5 max-h-[50vh] overflow-y-auto">
                        {/* Não atribuir usuário */}
                        <button
                            type="button"
                            onClick={() => setSelectedAgentId(null)}
                            className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-sm text-left transition-colors hover:bg-accent",
                                selectedAgentId === null && "border-primary bg-primary/5"
                            )}
                        >
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Users className="w-4 h-4 text-primary" />
                            </div>
                            <span className="font-medium flex-1">Não atribuir usuário</span>
                            {selectedAgentId === null && <Check className="w-4 h-4 text-primary shrink-0" />}
                        </button>

                        {membersLoading && (
                            <div className="flex justify-center py-6">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {!membersLoading && !availableMembers.length && (
                            <p className="text-xs text-muted-foreground text-center py-3">
                                Nenhum atendente com acesso a esta fila e instância.
                            </p>
                        )}

                        {availableMembers.map((member) => (
                            <button
                                key={member.id}
                                type="button"
                                onClick={() => setSelectedAgentId(member.id)}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-sm text-left transition-colors hover:bg-accent",
                                    selectedAgentId === member.id && "border-primary bg-primary/5"
                                )}
                            >
                                <Avatar className="w-7 h-7 shrink-0">
                                    <AvatarImage src={member.avatar_url ?? undefined} />
                                    <AvatarFallback className="text-[10px]">
                                        {member.name?.[0]?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="truncate flex-1">{member.name}</span>
                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                                    {ROLE_LABEL[member.role] ?? member.role}
                                </span>
                                {selectedAgentId === member.id && (
                                    <Check className="w-4 h-4 text-primary shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                    {step === 2 && (
                        <Button
                            variant="outline"
                            onClick={() => { setStep(1); setSelectedAgentId(null); }}
                            disabled={transferMutation.isPending}
                            className="sm:mr-auto"
                        >
                            <ArrowLeft className="w-4 h-4 mr-1.5" />
                            Voltar
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => handleClose(false)} disabled={transferMutation.isPending}>
                        Cancelar
                    </Button>
                    {step === 2 && (
                        <Button onClick={handleConfirm} disabled={transferMutation.isPending}>
                            {transferMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Transferir
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
