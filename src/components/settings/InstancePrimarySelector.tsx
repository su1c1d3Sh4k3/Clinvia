import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Star, AlertTriangle } from "lucide-react";
import { useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AutomationInstance {
    id: string;
    name: string | null;
    instance_name: string | null;
    provider: string | null;
    status: string;
    is_automation_primary: boolean;
    is_recurrence_primary?: boolean;
}

function isMetaInstance(i: AutomationInstance): boolean {
    return i.provider === "meta" || (i.instance_name || "").startsWith("meta-");
}

const AUTO_VALUE = "__auto__";

export type PrimaryFlagColumn = "is_automation_primary" | "is_recurrence_primary";

interface InstancePrimarySelectorProps {
    /** Coluna booleana em instances que marca a instância primária deste contexto. */
    flagColumn: PrimaryFlagColumn;
    /** Toast de sucesso ao salvar a preferência. */
    successMessage: string;
    /** id-prefix para os inputs (evita colisão quando há 2 seletores na página). */
    idPrefix: string;
}

/**
 * Seletor de instância primária (Automático → prioriza Meta e a mais antiga)
 * reutilizado pela seção Envios Automáticos, pela seção Recorrência e pelo
 * modal de configurações da página /recurrence. Escolher UAZAPI para disparos
 * abre o AlertDialog de risco (user rule).
 */
export function InstancePrimarySelector({
    flagColumn,
    successMessage,
    idPrefix,
}: InstancePrimarySelectorProps) {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();
    const [pendingUazapiId, setPendingUazapiId] = useState<string | null>(null);

    const { data: instances, isLoading } = useQuery({
        queryKey: ["automation-instances", ownerId],
        queryFn: async (): Promise<AutomationInstance[]> => {
            const { data, error } = await supabase
                .from("instances")
                .select("*")
                .eq("status", "connected")
                .order("created_at", { ascending: true });
            if (error) throw error;
            return (data || []) as unknown as AutomationInstance[];
        },
        enabled: !!ownerId,
    });

    const setPrimary = useMutation({
        mutationFn: async (instanceId: string | null) => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            const { error: clearError } = await supabase
                .from("instances")
                .update({ [flagColumn]: false } as any)
                .eq("user_id", ownerId)
                .eq(flagColumn as any, true);
            if (clearError) throw clearError;
            if (instanceId) {
                const { error } = await supabase
                    .from("instances")
                    .update({ [flagColumn]: true } as any)
                    .eq("id", instanceId);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["automation-instances"] });
            toast.success(successMessage);
        },
        onError: (err: any) => toast.error(err.message || "Erro ao salvar preferência"),
    });

    const list = instances || [];
    const currentPrimary = list.find((i) => !!i[flagColumn]);
    const selectedValue = currentPrimary?.id || AUTO_VALUE;

    // Instância efetiva no modo automático (mesma lógica do backend)
    const autoInstance = list.find(isMetaInstance) || list[0];

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando instâncias...
            </div>
        );
    }

    if (list.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-4">
                Nenhuma instância conectada. Conecte uma instância em Conexões para habilitar os
                envios automáticos.
            </p>
        );
    }

    return (
        <>
            <RadioGroup
                value={selectedValue}
                onValueChange={(value) => {
                    if (value === AUTO_VALUE) {
                        setPrimary.mutate(null);
                        return;
                    }
                    const inst = list.find((i) => i.id === value);
                    if (inst && !isMetaInstance(inst)) {
                        setPendingUazapiId(value);
                        return;
                    }
                    setPrimary.mutate(value);
                }}
                className="space-y-2"
            >
                <div className="flex items-start gap-3 rounded-lg border p-3">
                    <RadioGroupItem value={AUTO_VALUE} id={`${idPrefix}-auto-instance`} className="mt-1" />
                    <Label htmlFor={`${idPrefix}-auto-instance`} className="flex-1 cursor-pointer space-y-1">
                        <span className="font-medium flex items-center gap-2">
                            Automático (recomendado)
                            <Badge variant="secondary" className="text-[10px]">Prioriza API Oficial</Badge>
                        </span>
                        <span className="block text-xs text-muted-foreground font-normal">
                            {autoInstance
                                ? `Instância em uso: ${autoInstance.name || autoInstance.instance_name}`
                                : "Nenhuma instância conectada"}
                        </span>
                    </Label>
                </div>

                {list.map((inst) => (
                    <div key={inst.id} className="flex items-start gap-3 rounded-lg border p-3">
                        <RadioGroupItem value={inst.id} id={`${idPrefix}-inst-${inst.id}`} className="mt-1" />
                        <Label htmlFor={`${idPrefix}-inst-${inst.id}`} className="flex-1 cursor-pointer space-y-1">
                            <span className="font-medium flex items-center gap-2">
                                {inst.name || inst.instance_name || "Instância"}
                                {isMetaInstance(inst) ? (
                                    <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">API Oficial (Meta)</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-[10px]">WhatsApp Web (UZAPI)</Badge>
                                )}
                                {!!inst[flagColumn] && (
                                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                )}
                            </span>
                            <span className="block text-xs text-muted-foreground font-normal">
                                Conectada
                            </span>
                        </Label>
                    </div>
                ))}
            </RadioGroup>

            {setPrimary.isPending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
                    <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </div>
            )}

            <AlertDialog
                open={!!pendingUazapiId}
                onOpenChange={(open) => { if (!open) setPendingUazapiId(null); }}
            >
                <AlertDialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Usar API não oficial para disparos?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            As confirmações configuram disparos de mensagens, caso deseje continuar
                            não nos responsabilizamos por restrições ou banimentos do número. Não
                            aconselhamos a utilização da API não oficial por disparo, deseja
                            continuar?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingUazapiId(null)}>
                            Não
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingUazapiId) setPrimary.mutate(pendingUazapiId);
                                setPendingUazapiId(null);
                            }}
                        >
                            Sim, continuar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
