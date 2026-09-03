import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { STAGE_COLORS } from "@/types/crm-client";
import { cn } from "@/lib/utils";
import { MonitorCard } from "@/hooks/useMonitoramento";
import { ConversationCard } from "./ConversationCard";

interface StageBoardProps {
    stage: string;
    /** Título alternativo do board (default: o nome da etapa) */
    title?: string;
    /** Mostra em cada card o badge colorido da etapa de conclusão (board Finalizados) */
    showStageBadge?: boolean;
    cards: MonitorCard[];
    attendantNameOf: (card: MonitorCard) => string;
    canOpenChat: (card: MonitorCard) => boolean;
    onOpenChat: (card: MonitorCard) => void;
    onOpenProfile: (card: MonitorCard) => void;
    nowTick: number;
}

export function StageBoard({
    stage,
    title,
    showStageBadge,
    cards,
    attendantNameOf,
    canOpenChat,
    onOpenChat,
    onOpenProfile,
    nowTick,
}: StageBoardProps) {
    // Todos os quadros nascem fechados: a aba abre mostrando só os títulos com a
    // contagem, e o usuário expande a fila que quer olhar.
    const [open, setOpen] = useState(false);
    const color = STAGE_COLORS[stage] || "#8b5cf6";

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <Collapsible open={open} onOpenChange={setOpen}>
                <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/40 transition-colors">
                        <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-semibold">{title || stage}</span>
                        <span className="text-xs text-muted-foreground font-medium">
                            ({cards.length})
                        </span>
                        <ChevronDown
                            className={cn(
                                "h-4 w-4 text-muted-foreground ml-auto transition-transform",
                                open && "rotate-180"
                            )}
                        />
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-4 pb-4">
                        {cards.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">
                                Nenhum atendimento nesta etapa
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                                {cards.map((c) => (
                                    <ConversationCard
                                        key={c.conversationId}
                                        card={c}
                                        attendantName={attendantNameOf(c)}
                                        canOpenChat={canOpenChat(c)}
                                        onOpenChat={onOpenChat}
                                        onOpenProfile={onOpenProfile}
                                        nowTick={nowTick}
                                        showStageBadge={showStageBadge}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
