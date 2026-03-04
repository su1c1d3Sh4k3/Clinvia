import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { DELIVERY_STAGES, Delivery, DeliveryStage } from "@/types/delivery";
import { DeliveryFunnelColumn } from "./DeliveryFunnelColumn";
import { toast } from "sonner";

export function DeliveryFunnelBoard() {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();

    const { data: deliveries = [], isLoading } = useQuery({
        queryKey: ["deliveries", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_my_deliveries");
            if (error) {
                console.error("[DeliveryFunnelBoard] RPC error:", error);
                throw error;
            }
            return (data as any[]) as Delivery[];
        },
        enabled: !!ownerId,
    });

    const updateStageMutation = useMutation({
        mutationFn: async ({ id, stage }: { id: string; stage: DeliveryStage }) => {
            const { error } = await supabase
                .from("deliveries" as any)
                .update({ stage, updated_at: new Date().toISOString() })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["deliveries"] });
        },
        onError: () => {
            toast.error("Erro ao mover card de delivery");
        },
    });

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;

        const { draggableId, destination } = result;
        const newStage = destination.droppableId as DeliveryStage;
        const delivery = deliveries.find((d) => d.id === draggableId);

        if (!delivery || delivery.stage === newStage) return;

        updateStageMutation.mutate({ id: draggableId, stage: newStage });
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground">Carregando deliveries...</p>
            </div>
        );
    }

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 h-full overflow-x-auto pb-4">
                {DELIVERY_STAGES.map((stage) => (
                    <DeliveryFunnelColumn
                        key={stage.key}
                        stage={stage}
                        deliveries={deliveries.filter((d) => d.stage === stage.key)}
                    />
                ))}
            </div>
        </DragDropContext>
    );
}
