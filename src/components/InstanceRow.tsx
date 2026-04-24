import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, CheckCircle, XCircle, Wifi, Loader2, AlertTriangle, Clock } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Formata "tempo desde" uma data ISO (ex: "há 2min", "há 1h", "há 3d")
function formatTimeSince(iso: string | null | undefined): string {
    if (!iso) return "nunca verificado";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return "há menos de 1min";
    if (mins < 60) return `há ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `há ${days} dia${days === 1 ? "" : "s"}`;
}

interface InstanceRowProps {
    instance: any;
    onConnect: (instance: any) => void;
}

export const InstanceRow = ({ instance, onConnect }: InstanceRowProps) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { canCreate, canEdit, canDelete } = usePermissions();

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

    const { data: crmFunnels } = useQuery({
        queryKey: ["crm-funnels"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_funnels")
                .select("id, name")
                .order('created_at', { ascending: true });
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

    const updateAutoFunnelMutation = useMutation({
        mutationFn: async ({ instanceId, funnelId }: { instanceId: string, funnelId: string | null }) => {
            const { error } = await supabase
                .from("instances")
                .update({ auto_create_deal_funnel_id: funnelId === "none" ? null : funnelId })
                .eq("id", instanceId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["instances"] });
            toast({
                title: "Automação atualizada",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao atualizar automação",
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
                {canEdit('connections') && (
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

                {(canEdit('connections') && queues?.find(q => q.id === instance.default_queue_id)?.name?.trim() !== "Atendimento IA") && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">Criar Negociação:</span>
                        <Select
                            value={instance.auto_create_deal_funnel_id || "none"}
                            onValueChange={(value) => updateAutoFunnelMutation.mutate({ instanceId: instance.id, funnelId: value })}
                        >
                            <SelectTrigger className="w-full sm:w-[140px] md:w-[180px] h-8 md:h-9 text-xs md:text-sm">
                                <SelectValue placeholder="Desabilitado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Desabilitado</SelectItem>
                                {crmFunnels?.map((funnel) => (
                                    <SelectItem key={funnel.id} value={funnel.id}>
                                        {funnel.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge
                                    className={`text-[10px] md:text-xs border ${
                                        checkConnectionMutation.isPending
                                            ? "bg-muted text-muted-foreground border-muted"
                                            : instance.status === "connected"
                                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                                                : instance.status === "connecting"
                                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                                    : "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 hover:bg-red-500/20"
                                    }`}
                                >
                                    {checkConnectionMutation.isPending ? (
                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    ) : instance.status === "connected" ? (
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                    ) : instance.status === "connecting" ? (
                                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    ) : (
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                    )}
                                    {checkConnectionMutation.isPending
                                        ? "Verificando..."
                                        : instance.status === "connected"
                                            ? "Conectado"
                                            : instance.status === "connecting"
                                                ? "Conectando..."
                                                : "Desconectado"}
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                <div className="flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" />
                                    Último check: {formatTimeSince(instance.last_health_check)}
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {instance.status !== "connected" && (
                        <Button
                            size="sm"
                            variant={instance.status === "disconnected" ? "default" : "outline"}
                            onClick={() => onConnect(instance)}
                            className={`h-7 md:h-8 text-xs md:text-sm px-2 md:px-3 ${
                                instance.status === "disconnected"
                                    ? "bg-red-500 hover:bg-red-600 text-white"
                                    : ""
                            }`}
                        >
                            <Wifi className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1 md:mr-2" />
                            {instance.status === "disconnected" ? "Reconectar" : "Conectar"}
                        </Button>
                    )}

                    {canDelete('connections') && (
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
