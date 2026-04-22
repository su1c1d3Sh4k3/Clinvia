import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Delivery as DeliveryType, DeliveryFiltersState } from "@/types/delivery";
import { DeliveryBoard } from "@/components/delivery/DeliveryBoard";
import { DeliveryFilters } from "@/components/delivery/DeliveryFilters";
import { AddDeliveryModal } from "@/components/delivery/AddDeliveryModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ClipboardCheck, Sparkles, Search, Info, Smartphone, Clock } from "lucide-react";

// 30-min slots from 00:00 through 23:30 (48 options)
const SEND_TIME_SLOTS: { value: string; label: string; hour: number; minute: number }[] = [];
for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        SEND_TIME_SLOTS.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}`, hour: h, minute: m });
    }
}

export default function Delivery() {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();

    const [filters, setFilters] = useState<DeliveryFiltersState>({
        professionalId: null,
        patientId: null,
        period: null,
    });
    const [patientSearch, setPatientSearch] = useState("");
    const [addModalOpen, setAddModalOpen] = useState(false);

    // --- Fetch deliveries via RPC (SECURITY DEFINER, bypassa RLS nos joins) ---
    const { data: deliveries = [], isLoading } = useQuery({
        queryKey: ["deliveries", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_my_deliveries");
            if (error) {
                console.error("[Delivery] RPC error:", error);
                throw error;
            }
            return (data as any[]) as DeliveryType[];
        },
        enabled: !!ownerId,
    });

    // --- AI toggle + instance selection ---
    const { data: aiConfig } = useQuery({
        queryKey: ["delivery-config", ownerId],
        queryFn: async () => {
            const { data } = await supabase
                .from("delivery_config")
                .select("ai_enabled, instance_id, send_hour, send_minute")
                .eq("user_id", ownerId!)
                .maybeSingle();
            return data;
        },
        enabled: !!ownerId,
    });

    // Connected instances for this owner (for selector when > 1)
    const { data: connectedInstances = [] } = useQuery({
        queryKey: ["connected-instances-delivery", ownerId],
        queryFn: async () => {
            const { data } = await supabase
                .from("instances")
                .select("id, name, instance_name, phone")
                .eq("user_id", ownerId!)
                .eq("status", "connected");
            return data || [];
        },
        enabled: !!ownerId,
    });

    const toggleAI = useMutation({
        mutationFn: async (enabled: boolean) => {
            // When turning ON and user has 1 connected instance, auto-select it.
            // Also default send time to 10:00 BRT if not already set.
            const payload: any = {
                user_id: ownerId!,
                ai_enabled: enabled,
                updated_at: new Date().toISOString(),
            };
            if (enabled && connectedInstances.length === 1 && !aiConfig?.instance_id) {
                payload.instance_id = connectedInstances[0].id;
            }
            if (enabled && (aiConfig?.send_hour == null || aiConfig?.send_minute == null)) {
                payload.send_hour = 10;
                payload.send_minute = 0;
            }
            const { error } = await supabase
                .from("delivery_config")
                .upsert(payload, { onConflict: "user_id" });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["delivery-config", ownerId] });
        },
        onError: () => {
            queryClient.invalidateQueries({ queryKey: ["delivery-config", ownerId] });
        },
    });

    const setInstance = useMutation({
        mutationFn: async (instanceId: string) => {
            const { error } = await supabase
                .from("delivery_config")
                .upsert(
                    { user_id: ownerId!, instance_id: instanceId, updated_at: new Date().toISOString() },
                    { onConflict: "user_id" }
                );
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["delivery-config", ownerId] });
        },
    });

    const setSendTime = useMutation({
        mutationFn: async (timeValue: string) => {
            // timeValue is "HH:MM" from the 30-min slot select
            const slot = SEND_TIME_SLOTS.find((s) => s.value === timeValue);
            if (!slot) throw new Error("invalid slot");
            const { error } = await supabase
                .from("delivery_config")
                .upsert(
                    {
                        user_id: ownerId!,
                        send_hour: slot.hour,
                        send_minute: slot.minute,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id" }
                );
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["delivery-config", ownerId] });
        },
    });

    const aiEnabled = aiConfig?.ai_enabled ?? false;
    const selectedInstanceId = aiConfig?.instance_id ?? null;
    const hasMultipleInstances = connectedInstances.length > 1;
    const needsInstanceSelection = aiEnabled && hasMultipleInstances && !selectedInstanceId;

    // Send-time config
    const sendHour = aiConfig?.send_hour ?? null;
    const sendMinute = aiConfig?.send_minute ?? null;
    const selectedSendTime = sendHour != null && sendMinute != null
        ? `${String(sendHour).padStart(2, "0")}:${String(sendMinute).padStart(2, "0")}`
        : "";
    const needsSendTimeSelection = aiEnabled && !selectedSendTime;

    return (
        <div className="px-3 md:px-6 pt-4 md:pt-6 h-screen flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-primary" />
                    <h1 className="text-xl font-bold">Delivery</h1>
                    <span className="text-sm text-muted-foreground">
                        — Funil de Procedimentos
                    </span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* AI Toggle */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <Label
                            htmlFor="ai-toggle"
                            className="text-sm cursor-pointer select-none"
                        >
                            Agendamento Automatizado
                        </Label>
                        <Switch
                            id="ai-toggle"
                            checked={aiEnabled}
                            onCheckedChange={(val) => toggleAI.mutate(val)}
                            disabled={!ownerId}
                        />
                    </div>

                    {/* Instance selector — only shown when switch is ON and user has > 1 connected instance */}
                    {aiEnabled && hasMultipleInstances && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background">
                            <Smartphone className="w-3.5 h-3.5 text-primary" />
                            <Label htmlFor="instance-select" className="text-sm select-none">
                                Instância:
                            </Label>
                            <Select
                                value={selectedInstanceId || ""}
                                onValueChange={(val) => setInstance.mutate(val)}
                            >
                                <SelectTrigger id="instance-select" className="h-7 w-[180px] text-sm">
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {connectedInstances.map((inst: any) => (
                                        <SelectItem key={inst.id} value={inst.id}>
                                            {inst.name || inst.instance_name || inst.phone || inst.id.slice(0, 8)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Send-time selector — shown whenever switch is ON */}
                    {aiEnabled && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            <Label htmlFor="send-time-select" className="text-sm select-none">
                                Horário de envio:
                            </Label>
                            <Select
                                value={selectedSendTime}
                                onValueChange={(val) => setSendTime.mutate(val)}
                            >
                                <SelectTrigger id="send-time-select" className="h-7 w-[110px] text-sm">
                                    <SelectValue placeholder="HH:MM" />
                                </SelectTrigger>
                                <SelectContent className="max-h-[280px]">
                                    {SEND_TIME_SLOTS.map((slot) => (
                                        <SelectItem key={slot.value} value={slot.value}>
                                            {slot.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Add button */}
                    <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setAddModalOpen(true)}
                        disabled={!ownerId}
                    >
                        <Plus className="w-4 h-4" />
                        Adicionar Procedimento
                    </Button>
                </div>
            </div>

            {/* Warning when any required selection is missing */}
            {(needsInstanceSelection || needsSendTimeSelection) && (
                <div className="flex items-start gap-3 mb-3 px-4 py-3 rounded-lg border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40 flex-shrink-0">
                    <Info className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-800 dark:text-red-300 leading-relaxed">
                        <span className="font-semibold">Configuração pendente:</span>{" "}
                        {needsInstanceSelection && "selecione uma instância"}
                        {needsInstanceSelection && needsSendTimeSelection && " e "}
                        {needsSendTimeSelection && "defina o horário de envio"}
                        {" "}no controle acima para que o Agendamento Automatizado possa rodar. Enquanto houver configuração pendente, nenhum envio será realizado.
                    </p>
                </div>
            )}

            {/* Automated Scheduling Banner */}
            {aiEnabled && !needsInstanceSelection && !needsSendTimeSelection && (
                <div className="flex items-start gap-3 mb-3 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 flex-shrink-0">
                    <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                        <span className="font-semibold">Agendamento Automatizado ativo — disparos às {selectedSendTime} (Brasília).</span>{" "}
                        Todos os dias nesse horário, o sistema verifica procedimentos na etapa{" "}
                        <span className="font-medium">"Aguardando Agendamento"</span> cuja data de contato é hoje e envia
                        a mensagem de agendamento ao paciente automaticamente.
                    </p>
                </div>
            )}

            {/* Filters + Search */}
            {ownerId && (
                <div className="mb-3 flex-shrink-0 flex items-center gap-3 flex-wrap">
                    {/* Busca por nome do paciente — tempo real */}
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Buscar por paciente..."
                            value={patientSearch}
                            onChange={(e) => setPatientSearch(e.target.value)}
                            className="pl-8 h-9 w-[220px]"
                        />
                    </div>
                    <DeliveryFilters
                        ownerId={ownerId}
                        filters={filters}
                        onChange={setFilters}
                    />
                </div>
            )}

            {/* Board */}
            {isLoading ? (
                <div className="flex items-center justify-center flex-1">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground">Carregando...</span>
                    </div>
                </div>
            ) : ownerId ? (
                <div className="flex-1 overflow-hidden">
                    <DeliveryBoard
                        deliveries={deliveries}
                        filters={filters}
                        patientSearch={patientSearch}
                        ownerId={ownerId}
                    />
                </div>
            ) : null}

            {/* Add Modal */}
            <AddDeliveryModal open={addModalOpen} onOpenChange={setAddModalOpen} />
        </div>
    );
}
