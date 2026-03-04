import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useQueryClient } from "@tanstack/react-query";
import { isWithinInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Delivery, DeliveryFiltersState, DELIVERY_STAGES, DeliveryStage } from "@/types/delivery";
import { DeliveryColumn } from "./DeliveryColumn";
import { toast } from "sonner";

interface DeliveryBoardProps {
    deliveries: Delivery[];
    filters: DeliveryFiltersState;
    patientSearch?: string;
    ownerId: string;
}

export function DeliveryBoard({ deliveries, filters, patientSearch, ownerId }: DeliveryBoardProps) {
    const queryClient = useQueryClient();

    // --- Frontend filtering ---
    const filtered = deliveries.filter((d) => {
        if (filters.professionalId && d.professional_id !== filters.professionalId) return false;
        if (filters.patientId && d.patient_id !== filters.patientId) return false;
        if (patientSearch?.trim()) {
            const search = patientSearch.trim().toLowerCase();
            if (!d.patient?.nome?.toLowerCase().includes(search)) return false;
        }
        if (filters.period?.from) {
            const date = new Date(d.created_at);
            if (
                !isWithinInterval(date, {
                    start: filters.period.from,
                    end: filters.period.to,
                })
            )
                return false;
        }
        return true;
    });

    // --- Drag and drop ---
    const onDragEnd = async (result: DropResult) => {
        if (!result.destination) return;
        const deliveryId = result.draggableId;
        const newStage = result.destination.droppableId as DeliveryStage;
        const oldStage = result.source.droppableId as DeliveryStage;
        if (newStage === oldStage && result.source.index === result.destination.index) return;

        // Optimistic UI update
        queryClient.setQueryData<Delivery[]>(["deliveries", ownerId], (prev) =>
            prev?.map((d) => (d.id === deliveryId ? { ...d, stage: newStage } : d)) ?? []
        );

        const { error } = await supabase
            .from("deliveries")
            .update({ stage: newStage })
            .eq("id", deliveryId);

        if (error) {
            toast.error("Erro ao mover procedimento");
            // Revert optimistic update
            queryClient.invalidateQueries({ queryKey: ["deliveries", ownerId] });
        }
    };

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex h-full gap-4 overflow-x-auto pb-6 px-2 crm-scrollbar transition-colors">
                {DELIVERY_STAGES.map((stage) => {
                    const stageDeliveries = filtered.filter((d) => d.stage === stage.key);
                    return (
                        <DeliveryColumn
                            key={stage.key}
                            stageKey={stage.key}
                            stageLabel={stage.label}
                            stageColor={stage.color}
                            deliveries={stageDeliveries}
                            onUpdated={() =>
                                queryClient.invalidateQueries({ queryKey: ["deliveries", ownerId] })
                            }
                        />
                    );
                })}
            </div>
        </DragDropContext>
    );
}
