import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, CheckCircle, XCircle, Wifi, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { useUserRole } from "@/hooks/useUserRole";

interface InstanceRowProps {
    instance: any;
    onConnect: (instance: any) => void;
}

export const InstanceRow = ({ instance, onConnect }: InstanceRowProps) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: userRole } = useUserRole();
    const isAgent = userRole === 'agent';
    const isSupervisor = userRole === 'supervisor';

    const checkConnectionMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await supabase.functions.invoke("uzapi-check-connection", {
                body: { instanceId: id },
            });

            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["instances"] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await supabase.functions.invoke("uzapi-delete-instance", {
                body: { instanceId: id },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["instances"] });
            toast({
                title: "Instância deletada",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao deletar",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    const { data: queues } = useQuery({
        queryKey: ["queues"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("queues")
                .select("*")
                .eq("is_active", true);
            if (error) throw error;
            return data;
        },
    });

    const updateQueueMutation = useMutation({
        mutationFn: async ({ instanceId, queueId }: { instanceId: string, queueId: string | null }) => {
            const { error } = await supabase
                .from("instances")
                .update({ default_queue_id: queueId === "none" ? null : queueId })
                .eq("id", instanceId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["instances"] });
            toast({
                title: "Fila padrão atualizada",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao atualizar fila",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    // Check connection on mount
    useEffect(() => {
        checkConnectionMutation.mutate(instance.id);
    }, []);

    return (
        <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
                <h3 className="font-semibold">{instance.name}</h3>
                <p className="text-sm text-muted-foreground">
                    {instance.server_url}
                </p>
            </div>

            <div className="flex items-center gap-4">
                {!isAgent && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">Fila Padrão:</span>
                        <Select
                            value={instance.default_queue_id || "none"}
                            onValueChange={(value) => updateQueueMutation.mutate({ instanceId: instance.id, queueId: value })}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Selecione uma fila" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                {queues?.map((queue) => (
                                    <SelectItem key={queue.id} value={queue.id}>
                                        {queue.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <Badge
                        variant={
                            instance.status === "connected" ? "default" : "secondary"
                        }
                    >
                        {checkConnectionMutation.isPending ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : instance.status === "connected" ? (
                            <CheckCircle className="w-3 h-3 mr-1" />
                        ) : (
                            <XCircle className="w-3 h-3 mr-1" />
                        )}
                        {checkConnectionMutation.isPending ? "Verificando..." : instance.status}
                    </Badge>

                    {instance.status !== "connected" && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onConnect(instance)}
                        >
                            <Wifi className="w-4 h-4 mr-2" />
                            Conectar
                        </Button>
                    )}

                    {!isAgent && !isSupervisor && (
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(instance.id)}
                            disabled={deleteMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
