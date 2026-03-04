import { Droppable } from "@hello-pangea/dnd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Delivery, DeliveryStage } from "@/types/delivery";
import { DeliveryFunnelCard } from "./DeliveryFunnelCard";

interface DeliveryFunnelColumnProps {
    stage: { key: DeliveryStage; label: string; color: string };
    deliveries: Delivery[];
}

export function DeliveryFunnelColumn({ stage, deliveries }: DeliveryFunnelColumnProps) {
    return (
        <div className="flex flex-col h-full min-w-[280px] max-w-[280px] rounded-xl bg-[#F5F6F8] dark:bg-muted/20 border border-border/50">
            <div className="p-4 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                        <h3 className="font-semibold text-sm truncate text-foreground/90">{stage.label}</h3>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full border border-border/50">
                        {deliveries.length}
                    </span>
                </div>
            </div>

            <ScrollArea className="flex-1 px-2 pb-2">
                <div className="h-full min-h-[100px]">
                    <Droppable droppableId={stage.key}>
                        {(provided, snapshot) => (
                            <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                className={`flex flex-col h-full min-h-[100px] transition-colors rounded-lg ${
                                    snapshot.isDraggingOver ? "bg-muted/30 ring-2 ring-primary/10" : ""
                                }`}
                            >
                                {deliveries.map((delivery, index) => (
                                    <DeliveryFunnelCard key={delivery.id} delivery={delivery} index={index} />
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </div>
            </ScrollArea>
        </div>
    );
}
