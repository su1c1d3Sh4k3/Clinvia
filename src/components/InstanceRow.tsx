import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, CheckCircle, XCircle, Wifi, Loader2, AlertTriangle, Clock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { mensagemDoErroDaFuncao } from "@/lib/functionError";

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

            if (error) throw new Error(await mensagemDoErroDaFuncao(error, "Não foi possível verificar a conexão."));
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["instances"] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            // O erro era descartado: a exclusão falhava e o onSuccess ainda
            // anunciava "Instância deletada".
            const { data, error } = await supabase.functions.invoke("uzapi-delete-instance", {
                body: { instanceId: id },
            });
            if (error) throw new Error(await mensagemDoErroDaFuncao(error, "Não foi possível excluir a instância."));
            // Provedor recusou a remoção: a linha FICA, marcada como pendente. É
            // resposta 200 de propósito (o incidente certo é o do provedor, e a
            // function já o abriu) — então o `error` acima não dispara e quem
            // distingue é este campo.
            return { pendente: Boolean(data?.pending_removal), aviso: data?.message as string | undefined };
        },
        onSuccess: ({ pendente, aviso }) => {
            queryClient.invalidateQueries({ queryKey: ["instances"] });
            toast(
                pendente
                    ? {
                        title: "Remoção pendente",
                        description: aviso,
                        variant: "destructive",
                        duration: 12000,
                    }
                    : { title: "Instância deletada" },
            );
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao deletar",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    // Check connection on mount (skip Meta instances — they don't use UZAPI)
    useEffect(() => {
        if (instance.provider !== 'meta' && !(instance.instance_name || '').startsWith('meta-')) {
            checkConnectionMutation.mutate(instance.id);
        }
    }, []);

    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between p-3 md:p-4 border rounded-lg gap-3 md:gap-4">
            <div className="space-y-0.5 md:space-y-1 min-w-0">
                <h3 className="font-semibold text-sm md:text-base truncate">{instance.name}</h3>
                {/* A linha só continua aqui porque o provedor recusou a remoção.
                    Esconder isso é o que transformaria a conexão em órfã invisível. */}
                {instance.removal_pending_at && (
                    <p className="text-[11px] md:text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>
                            Remoção pendente — não conseguimos remover no provedor. O suporte vai concluir.
                        </span>
                    </p>
                )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-4">
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
