import { Droppable, Draggable } from "@hello-pangea/dnd";
import { DeliveryCard } from "./DeliveryCard";
import { Delivery, DeliveryStage } from "@/types/delivery";

interface DeliveryColumnProps {
    stageKey: DeliveryStage;
    stageLabel: string;
    stageColor: string;
    deliveries: Delivery[];
    onUpdated: () => void;
}

// Group deliveries by patient_id, preserving order of first appearance
function groupByPatient(deliveries: Delivery[]): Map<string, Delivery[]> {
    const map = new Map<string, Delivery[]>();
    for (const d of deliveries) {
        const key = d.patient_id || `__no_patient__${d.id}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(d);
    }
    return map;
}

export function DeliveryColumn({
    stageKey,
    stageLabel,
    stageColor,
    deliveries,
    onUpdated,
}: DeliveryColumnProps) {
    const grouped = groupByPatient(deliveries);
    const groups = Array.from(grouped.entries());

    return (
        <div className="flex flex-col h-full w-[340px] min-w-[340px] max-w-[340px] rounded-xl bg-[#F5F6F8] dark:bg-muted/20 border border-border/50 overflow-hidden">
            {/* Column Header */}
            <div
                className="px-3 py-3 flex items-center justify-between gap-2 flex-shrink-0"
                style={{ borderTop: `3px solid ${stageColor}`, borderRadius: "0.75rem 0.75rem 0 0" }}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: stageColor }}
                    />
                    <h3 className="font-semibold text-xs uppercase tracking-wide truncate text-foreground/80">
                        {stageLabel}
                    </h3>
                </div>
                <span className="text-xs font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full border border-border/50 shrink-0">
                    {deliveries.length}
                </span>
            </div>

            {/* Scroll container — overflow-x-hidden garante que cards não ultrapassem a largura */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden crm-scrollbar">
                <Droppable droppableId={stageKey}>
                    {(provided, snapshot) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`w-full flex flex-col min-h-full gap-1.5 transition-colors p-2 ${
                                snapshot.isDraggingOver
                                    ? "bg-muted/30"
                                    : ""
                            }`}
                        >
                            {deliveries.length === 0 && (
                                <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
                                    Nenhum procedimento
                                </div>
                            )}

                            {groups.map(([patientKey, groupDeliveries]) => {
                                const isGroup = groupDeliveries.length > 1;
                                return (
                                    <div
                                        key={patientKey}
                                        className={`w-full ${
                                            isGroup
                                                ? "rounded-lg ring-1 ring-border/60 overflow-hidden space-y-px bg-background/30"
                                                : ""
                                        }`}
                                    >
                                        {groupDeliveries.map((delivery) => {
                                            const globalIndex = deliveries.findIndex(
                                                (d) => d.id === delivery.id
                                            );
                                            return (
                                                <Draggable
                                                    key={delivery.id}
                                                    draggableId={delivery.id}
                                                    index={globalIndex}
                                                >
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            className={`transition-shadow ${
                                                                snapshot.isDragging
                                                                    ? "shadow-xl ring-2 ring-primary/30 opacity-90 rounded-lg"
                                                                    : ""
                                                            }`}
                                                            style={provided.draggableProps.style}
                                                        >
                                                            <DeliveryCard
                                                                delivery={delivery}
                                                                onUpdated={onUpdated}
                                                            />
                                                        </div>
                                                    )}
                                                </Draggable>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </div>
        </div>
    );
}
