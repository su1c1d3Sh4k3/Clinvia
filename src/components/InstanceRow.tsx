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
            const { data, error } = await supabase.functions.invoke("uzapi-manager", {
                body: { action: 'check_connection', instanceId: id },
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between p-3 md:p-4 border rounded-lg gap-3 md:gap-4">
            <div className="space-y-0.5 md:space-y-1 min-w-0">
                <h3 className="font-semibold text-sm md:text-base truncate">{instance.name}</h3>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-4">
                {!isAgent && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">Fila:</span>
                        <Select
                            value={instance.default_queue_id || "none"}
                            onValueChange={(value) => updateQueueMutation.mutate({ instanceId: instance.id, queueId: value })}
                        >
                            <SelectTrigger className="w-full sm:w-[140px] md:w-[180px] h-8 md:h-9 text-xs md:text-sm">
                                <SelectValue placeholder="Selecione" />
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

                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <Badge
                        variant={
                            instance.status === "connected" ? "default" : "secondary"
                        }
                        className="text-[10px] md:text-xs"
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
                            className="h-7 md:h-8 text-xs md:text-sm px-2 md:px-3"
                        >
                            <Wifi className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
                            Conectar
                        </Button>
                    )}

                    {!isAgent && !isSupervisor && (
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(instance.id)}
                            disabled={deleteMutation.isPending}
                            className="h-7 md:h-8 w-7 md:w-8 p-0"
                        >
                            <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
