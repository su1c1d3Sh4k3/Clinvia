import { CRMStage, CRMDeal } from "@/types/crm";
import { Droppable } from "@hello-pangea/dnd";
import { KanbanCard } from "./KanbanCard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface KanbanColumnProps {
    stage: CRMStage;
    deals: CRMDeal[];
}

export function KanbanColumn({ stage, deals }: KanbanColumnProps) {
    const totalValue = deals.reduce((sum, deal) => sum + Number(deal.value), 0);

    return (
        <div className="flex flex-col h-full min-w-[280px] max-w-[280px] rounded-xl bg-[#F5F6F8] dark:bg-muted/20">
            <div className="p-4 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                        <h3 className="font-semibold text-sm truncate text-foreground/90">{stage.name}</h3>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full border border-border/50">
                        {deals.length}
                    </span>
                </div>
                {totalValue > 0 && (
                    <div className="flex items-center gap-1 pl-5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total:</span>
                        <span className="text-xs font-semibold text-foreground/80">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                        </span>
                    </div>
                )}
            </div>

            <ScrollArea className="flex-1 px-2 pb-2">
                <div className="h-full min-h-[100px]">
                    <Droppable droppableId={stage.id}>
                        {(provided, snapshot) => (
                            <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                className={`flex flex-col h-full min-h-[100px] transition-colors rounded-lg ${snapshot.isDraggingOver ? "bg-muted/30 ring-2 ring-primary/10" : ""
                                    }`}
                            >
                                {deals.map((deal, index) => (
                                    <KanbanCard key={deal.id} deal={deal} index={index} stagnationLimitDays={stage.stagnation_limit_days} />
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
