import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Zap, Star } from "lucide-react";

interface AutomationInstance {
    id: string;
    name: string | null;
    instance_name: string | null;
    provider: string | null;
    status: string;
    is_automation_primary: boolean;
}

function isMetaInstance(i: AutomationInstance): boolean {
    return i.provider === "meta" || (i.instance_name || "").startsWith("meta-");
}

const AUTO_VALUE = "__auto__";

export function AutomationSettings() {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();

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
                .update({ is_automation_primary: false } as any)
                .eq("user_id", ownerId)
                .eq("is_automation_primary" as any, true);
            if (clearError) throw clearError;
            if (instanceId) {
                const { error } = await supabase
                    .from("instances")
                    .update({ is_automation_primary: true } as any)
                    .eq("id", instanceId);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["automation-instances"] });
            toast.success("Preferência de envios automáticos atualizada");
        },
        onError: (err: any) => toast.error(err.message || "Erro ao salvar preferência"),
    });

    const list = instances || [];
    const currentPrimary = list.find((i) => i.is_automation_primary);
    const selectedValue = currentPrimary?.id || AUTO_VALUE;

    // Instância efetiva no modo automático (mesma lógica do backend)
    const autoInstance = list.find(isMetaInstance) || list[0];

    return (
        <Card>
            <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Envios Automáticos
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                    Escolha qual instância o sistema usa para as mensagens automáticas de agendamento
                    (confirmação 24h antes, lembrete 2h antes e pesquisa de feedback). Por padrão, a
                    prioridade é sempre da API Oficial (Meta). Na API Oficial, as mensagens só são
                    enviadas após a aprovação dos templates pela Meta.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0">
                {isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-6">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando instâncias...
                    </div>
                ) : list.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                        Nenhuma instância conectada. Conecte uma instância em Conexões para habilitar os
                        envios automáticos.
                    </p>
                ) : (
                    <RadioGroup
                        value={selectedValue}
                        onValueChange={(value) =>
                            setPrimary.mutate(value === AUTO_VALUE ? null : value)
                        }
                        className="space-y-2"
                    >
                        <div className="flex items-start gap-3 rounded-lg border p-3">
                            <RadioGroupItem value={AUTO_VALUE} id="auto-instance" className="mt-1" />
                            <Label htmlFor="auto-instance" className="flex-1 cursor-pointer space-y-1">
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
                                <RadioGroupItem value={inst.id} id={`inst-${inst.id}`} className="mt-1" />
                                <Label htmlFor={`inst-${inst.id}`} className="flex-1 cursor-pointer space-y-1">
                                    <span className="font-medium flex items-center gap-2">
                                        {inst.name || inst.instance_name || "Instância"}
                                        {isMetaInstance(inst) ? (
                                            <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">API Oficial (Meta)</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px]">WhatsApp Web (UZAPI)</Badge>
                                        )}
                                        {inst.is_automation_primary && (
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
                )}

                {setPrimary.isPending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3">
                        <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
