import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CalendarRange, Clock, Loader2, Repeat } from "lucide-react";
import { InstancePrimarySelector } from "@/components/settings/InstancePrimarySelector";
import {
    clampDispatchHour,
    clampRecurrenceDurationDays,
    dispatchWindowLabel,
} from "../../../supabase/functions/_shared/recurrence-schedule";

interface RecurrenceConfigModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DURATIONS = Array.from({ length: 14 }, (_, i) => i + 1);

/**
 * Modal de configuração da Recorrência (R14/R18): hora base do disparo diário
 * (campanha inicia em horário aleatório dentro de 1h a partir da hora escolhida)
 * + duração das campanhas (padrão 3 dias — depois disso a campanha expira e a
 * tag é removida) + instância de disparo (mesma de Configurações > Automações).
 */
export function RecurrenceConfigModal({ open, onOpenChange }: RecurrenceConfigModalProps) {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();

    const { data: config, isLoading } = useQuery({
        queryKey: ["recurrence-config", ownerId],
        queryFn: async (): Promise<{ hour: number; durationDays: number }> => {
            const { data, error } = await supabase
                .from("profiles")
                .select("recurrence_dispatch_hour, recurrence_campaign_duration_days" as any)
                .eq("id", ownerId!)
                .maybeSingle();
            if (error) throw error;
            return {
                hour: clampDispatchHour((data as any)?.recurrence_dispatch_hour),
                durationDays: clampRecurrenceDurationDays(
                    (data as any)?.recurrence_campaign_duration_days,
                ),
            };
        },
        enabled: !!ownerId && open,
    });

    const saveHour = useMutation({
        mutationFn: async (hour: number) => {
            const { error } = await supabase
                .from("profiles")
                .update({ recurrence_dispatch_hour: hour } as any)
                .eq("id", ownerId!);
            if (error) throw error;
        },
        onSuccess: (_data, hour) => {
            queryClient.invalidateQueries({ queryKey: ["recurrence-config"] });
            toast.success(`Horário de disparo atualizado: ${dispatchWindowLabel(hour)}`);
        },
        onError: (err: any) => toast.error(err.message || "Erro ao salvar horário"),
    });

    const saveDuration = useMutation({
        mutationFn: async (days: number) => {
            const { error } = await supabase
                .from("profiles")
                .update({ recurrence_campaign_duration_days: days } as any)
                .eq("id", ownerId!);
            if (error) throw error;
        },
        onSuccess: (_data, days) => {
            queryClient.invalidateQueries({ queryKey: ["recurrence-config"] });
            toast.success(`Duração das campanhas atualizada: ${days} dia${days > 1 ? "s" : ""}`);
        },
        onError: (err: any) => toast.error(err.message || "Erro ao salvar duração"),
    });

    const hour = clampDispatchHour(config?.hour);
    const durationDays = clampRecurrenceDurationDays(config?.durationDays);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Repeat className="h-5 w-5 text-primary" />
                        Configurações de Recorrência
                    </DialogTitle>
                    <DialogDescription>
                        Defina quando e por qual instância as campanhas diárias de recorrência são
                        disparadas.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 font-medium">
                            <Clock className="h-4 w-4 text-primary" />
                            Horário do disparo diário
                        </Label>
                        {isLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground py-2 text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                            </div>
                        ) : (
                            <Select
                                value={String(hour)}
                                onValueChange={(v) => saveHour.mutate(parseInt(v, 10))}
                                disabled={saveHour.isPending}
                            >
                                <SelectTrigger className="w-full sm:w-56">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {HOURS.map((h) => (
                                        <SelectItem key={h} value={String(h)}>
                                            {String(h).padStart(2, "0")}:00
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <p className="text-xs text-muted-foreground">
                            As campanhas iniciam em um horário aleatório {dispatchWindowLabel(hour)}{" "}
                            (horário de Brasília). O sorteio evita que os disparos saiam sempre no mesmo
                            minuto.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 font-medium">
                            <CalendarRange className="h-4 w-4 text-primary" />
                            Duração das campanhas
                        </Label>
                        {isLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground py-2 text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                            </div>
                        ) : (
                            <Select
                                value={String(durationDays)}
                                onValueChange={(v) => saveDuration.mutate(parseInt(v, 10))}
                                disabled={saveDuration.isPending}
                            >
                                <SelectTrigger className="w-full sm:w-56">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DURATIONS.map((d) => (
                                        <SelectItem key={d} value={String(d)}>
                                            {d} dia{d > 1 ? "s" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Cada campanha de recorrência fica ativa por esse período (padrão 3 dias).
                            Ao terminar, ela expira e a tag da campanha é removida dos contatos.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 font-medium">
                            <Repeat className="h-4 w-4 text-primary" />
                            Instância de disparo
                        </Label>
                        <InstancePrimarySelector
                            flagColumn="is_recurrence_primary"
                            successMessage="Instância de recorrência atualizada"
                            idPrefix="recmodal"
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
