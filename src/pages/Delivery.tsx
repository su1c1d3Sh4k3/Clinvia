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
import { Plus, ClipboardCheck, Sparkles, Search } from "lucide-react";

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

    // --- AI toggle ---
    const { data: aiConfig } = useQuery({
        queryKey: ["delivery-config", ownerId],
        queryFn: async () => {
            const { data } = await supabase
                .from("delivery_config")
                .select("ai_enabled")
                .eq("user_id", ownerId!)
                .maybeSingle();
            return data;
        },
        enabled: !!ownerId,
    });

    const toggleAI = useMutation({
        mutationFn: async (enabled: boolean) => {
            const { error } = await supabase
                .from("delivery_config")
                .upsert(
                    { user_id: ownerId!, ai_enabled: enabled, updated_at: new Date().toISOString() },
                    { onConflict: "user_id" }
                );
            if (error) throw error;
        },
        onMutate: async (enabled) => {
            await queryClient.cancelQueries({ queryKey: ["delivery-config", ownerId] });
            queryClient.setQueryData(["delivery-config", ownerId], { ai_enabled: enabled });
        },
        onError: () => {
            queryClient.invalidateQueries({ queryKey: ["delivery-config", ownerId] });
        },
    });

    const aiEnabled = aiConfig?.ai_enabled ?? false;

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
                            IA Automática
                        </Label>
                        <Switch
                            id="ai-toggle"
                            checked={aiEnabled}
                            onCheckedChange={(val) => toggleAI.mutate(val)}
                            disabled={!ownerId}
                        />
                    </div>

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
