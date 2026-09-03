import { useMemo, useState } from "react";
import { History, ChevronUp, ArrowLeft, Check, CalendarDays, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { usePreviousTickets, type PreviousTicket } from "@/hooks/usePreviousTickets";
import { chatDateTime } from "@/lib/chatDates";
import { utcToBrasiliaParts } from "@/lib/timezone";

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

/** Campo de data do ticket usado pelo filtro do calendário. */
type DateField = "closedAt" | "openedAt";

/** Dia (fuso de Brasília) do campo escolhido — 'YYYY-MM-DD' ou null. */
const ticketDay = (t: PreviousTicket, field: DateField): string | null => {
    const iso = t[field];
    return iso ? utcToBrasiliaParts(new Date(iso)).ymd : null;
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

    // Filtro por data: fechamento é o padrão (é por ele que o time procura
    // "o atendimento do dia tal"). Só os dias com ticket ficam clicáveis.
    const [dateField, setDateField] = useState<DateField>("closedAt");
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [calendarOpen, setCalendarOpen] = useState(false);

    const availableDays = useMemo(() => {
        const days = new Set<string>();
        for (const t of tickets || []) {
            const d = ticketDay(t, dateField);
            if (d) days.add(d);
        }
        return days;
    }, [tickets, dateField]);

    const visibleTickets = useMemo(() => {
        if (!selectedDay) return tickets || [];
        return (tickets || []).filter((t) => ticketDay(t, dateField) === selectedDay);
    }, [tickets, dateField, selectedDay]);

    /** Dia mais recente com ticket — abre o calendário já no mês certo. */
    const latestDay = useMemo(() => {
        const sorted = [...availableDays].sort();
        return sorted[sorted.length - 1];
    }, [availableDays]);

    const changeField = (field: DateField) => {
        setDateField(field);
        // O dia escolhido pode não existir no outro campo — recomeça limpo.
        setSelectedDay(null);
    };

    return (
        <Collapsible open={open} onOpenChange={onToggle}>
            <Card className="border-[#1E2229]/20 dark:border-border">
                <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5" /> Tickets anteriores
                            {tickets && tickets.length > 0 && (
                                <span className="text-[10px] text-muted-foreground font-normal">
                                    ({selectedDay ? `${visibleTickets.length} de ${tickets.length}` : tickets.length})
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

                        {!isLoading && (tickets?.length || 0) > 0 && (
                            <div className="flex items-center gap-1.5">
                                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 flex-1 justify-start gap-1.5 px-2 text-[11px] font-normal"
                                        >
                                            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                                            {selectedDay
                                                ? format(new Date(`${selectedDay}T12:00:00`), "dd/MM/yyyy")
                                                : "Filtrar por data"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            locale={ptBR}
                                            selected={selectedDay ? new Date(`${selectedDay}T12:00:00`) : undefined}
                                            defaultMonth={
                                                selectedDay || latestDay
                                                    ? new Date(`${selectedDay || latestDay}T12:00:00`)
                                                    : undefined
                                            }
                                            // Só dia com ticket é clicável (user rule)
                                            disabled={(day) => !availableDays.has(format(day, "yyyy-MM-dd"))}
                                            onSelect={(day) => {
                                                setSelectedDay(day ? format(day, "yyyy-MM-dd") : null);
                                                setCalendarOpen(false);
                                            }}
                                            className="rounded-md"
                                        />
                                    </PopoverContent>
                                </Popover>

                                <Select value={dateField} onValueChange={(v) => changeField(v as DateField)}>
                                    <SelectTrigger className="h-8 w-[104px] shrink-0 text-[11px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="closedAt" className="text-xs">Fechamento</SelectItem>
                                        <SelectItem value="openedAt" className="text-xs">Abertura</SelectItem>
                                    </SelectContent>
                                </Select>

                                {selectedDay && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 shrink-0 p-0"
                                        title="Limpar filtro de data"
                                        onClick={() => setSelectedDay(null)}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </Button>
                                )}
                            </div>
                        )}

                        {isLoading && (
                            <p className="text-[11px] text-muted-foreground">Carregando tickets...</p>
                        )}

                        {!isLoading && (!tickets || tickets.length === 0) && (
                            <p className="text-[11px] text-muted-foreground">
                                Nenhum ticket registrado nesta conexão.
                            </p>
                        )}

                        {!isLoading && (tickets?.length || 0) > 0 && visibleTickets.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">
                                Nenhum ticket nessa data.
                            </p>
                        )}

                        {visibleTickets.map((t) => {
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
