import { History, ChevronUp, ArrowLeft, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { usePreviousTickets } from "@/hooks/usePreviousTickets";
import { chatDateTime } from "@/lib/chatDates";

interface PreviousTicketsSectionProps {
    conversationId?: string;
    open: boolean;
    onToggle: () => void;
    /** Recorte em exibição no chat (null = conversa geral) */
    activeSliceId?: string | null;
    onOpenSlice: (ticketId: string) => void;
    onExitSlice: () => void;
}

const STATUS_LABEL: Record<string, string> = {
    open: "Aberto",
    pending: "Pendente",
    resolved: "Resolvido",
};

/**
 * "Tickets anteriores" — lista os tickets do MESMO contato na MESMA conexão
 * (user rule: cada instância é um workflow separado). Clicar abre o recorte
 * daquele ticket no chat; disponível também em conversas abertas/pendentes.
 */
export const PreviousTicketsSection = ({
    conversationId,
    open,
    onToggle,
    activeSliceId,
    onOpenSlice,
    onExitSlice,
}: PreviousTicketsSectionProps) => {
    const { data: tickets, isLoading } = usePreviousTickets(conversationId);

    return (
        <Collapsible open={open} onOpenChange={onToggle}>
            <Card className="border-[#1E2229]/20 dark:border-border">
                <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5" /> Tickets anteriores
                            {tickets && tickets.length > 0 && (
                                <span className="text-[10px] text-muted-foreground font-normal">
                                    ({tickets.length})
                                </span>
                            )}
                        </CardTitle>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
                                <ChevronUp className={cn("h-3.5 w-3.5 transition-transform", !open && "rotate-180")} />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="px-3 pb-3 pt-0 space-y-2">
                        {activeSliceId && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full h-8 gap-2 text-xs"
                                onClick={onExitSlice}
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                Retornar para a conversa geral
                            </Button>
                        )}

                        {isLoading && (
                            <p className="text-[11px] text-muted-foreground">Carregando tickets...</p>
                        )}

                        {!isLoading && (!tickets || tickets.length === 0) && (
                            <p className="text-[11px] text-muted-foreground">
                                Nenhum ticket registrado nesta conexão.
                            </p>
                        )}

                        {(tickets || []).map((t) => {
                            const isActive = activeSliceId
                                ? t.id === activeSliceId
                                : t.id === conversationId;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => (t.id === conversationId ? onExitSlice() : onOpenSlice(t.id))}
                                    className={cn(
                                        "w-full text-left rounded-lg border p-2.5 transition-colors",
                                        isActive
                                            ? "border-primary/50 bg-primary/5"
                                            : "border-[#1E2229]/15 dark:border-border/60 hover:bg-muted/50"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold">Ticket {t.ticketNumber}</span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {STATUS_LABEL[t.status] || t.status}
                                        </span>
                                    </div>
                                    <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                                        <div className="truncate">
                                            <span className="text-muted-foreground/70">Conexão: </span>
                                            {t.channelLabel}
                                        </div>
                                        <div className="truncate">
                                            <span className="text-muted-foreground/70">Encerrado por: </span>
                                            {t.closedBy || "IA"}
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground/70">Abertura: </span>
                                            {t.openedAt ? chatDateTime(t.openedAt) : "—"}
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground/70">Fechamento: </span>
                                            {t.closedAt ? chatDateTime(t.closedAt) : "—"}
                                        </div>
                                    </div>
                                    {isActive && (
                                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary">
                                            <Check className="w-3 h-3" />
                                            Em exibição
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
};
