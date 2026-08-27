import { useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWorkHoursForDay } from "@/lib/professionalSchedule";

/** Passo fixo exibido no front — a duração real vem do procedimento escolhido. */
const SLOT_STEP_MINUTES = 30;

const STATUS_LABEL: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    rescheduled: "Reagendado",
    waiting: "Aguardando",
    completed: "Concluído",
    canceled: "Cancelado",
    "no-show": "Não compareceu",
};

const STATUS_CLASS: Record<string, string> = {
    confirmed: "bg-purple-100 text-purple-700 border-purple-200",
    rescheduled: "bg-yellow-100 text-yellow-700 border-yellow-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    canceled: "bg-red-100 text-red-700 border-red-200",
    "no-show": "bg-orange-100 text-orange-700 border-orange-200",
    waiting: "bg-gray-200 text-gray-700 border-gray-300",
    pending: "bg-blue-100 text-blue-700 border-blue-200",
};

interface DayAppointmentsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    date: Date;
    professional: any;
    /** Agendamentos do dia daquele profissional */
    appointments: any[];
    settings?: any;
    isClosed?: boolean;
    canCreate?: boolean;
    onSelectAppointment: (appointment: any) => void;
    onSelectSlot: (professionalId: string, slot: Date) => void;
}

export function DayAppointmentsModal({
    open,
    onOpenChange,
    date,
    professional,
    appointments,
    settings,
    isClosed = false,
    canCreate = true,
    onSelectAppointment,
    onSelectSlot,
}: DayAppointmentsModalProps) {
    const sorted = useMemo(
        () => [...appointments].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
        [appointments]
    );

    // Horários livres: expediente do profissional no dia da semana, de 30 em 30
    // minutos, tirando intervalo e o que já está ocupado.
    const freeSlots = useMemo(() => {
        if (!professional || isClosed) return [] as Date[];
        const weekday = date.getDay();
        const profWorkDays = professional.work_days || settings?.work_days || [0, 1, 2, 3, 4, 5, 6];
        if (!profWorkDays.includes(weekday)) return [] as Date[];

        const wh: any = {
            start: "08:00", end: "18:00", break_start: null, break_end: null,
            ...getWorkHoursForDay(professional, weekday),
        };
        const toMin = (s: string) => {
            const [h, m] = (s || "").split(":").map(Number);
            return (h || 0) * 60 + (m || 0);
        };
        const startMin = toMin(wh.start || "08:00");
        const endMin = toMin(wh.end || "18:00");
        const breakStart = wh.break_start ? toMin(wh.break_start) : null;
        const breakEnd = wh.break_end ? toMin(wh.break_end) : null;

        const busy = appointments
            .filter((a) => !["canceled", "no-show"].includes(a.status))
            .map((a) => {
                const s = new Date(a.start_time);
                const e = new Date(a.end_time);
                return [s.getHours() * 60 + s.getMinutes(), e.getHours() * 60 + e.getMinutes()] as [number, number];
            });

        const slots: Date[] = [];
        for (let min = startMin; min + SLOT_STEP_MINUTES <= endMin; min += SLOT_STEP_MINUTES) {
            const slotEnd = min + SLOT_STEP_MINUTES;
            if (breakStart != null && breakEnd != null && min < breakEnd && slotEnd > breakStart) continue;
            if (busy.some(([bs, be]) => min < be && slotEnd > bs)) continue;
            const d = new Date(date);
            d.setHours(Math.floor(min / 60), min % 60, 0, 0);
            slots.push(d);
        }
        return slots;
    }, [appointments, date, professional, settings, isClosed]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg">
                <DialogHeader>
                    <DialogTitle className="capitalize">
                        {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
                        {professional && <span className="text-muted-foreground font-normal"> — {professional.name}</span>}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">Agendamentos ({sorted.length})</h4>
                        {sorted.length === 0 && (
                            <p className="text-sm text-muted-foreground">Nenhum agendamento neste dia.</p>
                        )}
                        {sorted.map((apt) => (
                            <button
                                key={apt.id}
                                type="button"
                                onClick={() => onSelectAppointment(apt)}
                                className="w-full flex items-center gap-3 rounded-md border p-2 text-left hover:bg-muted/50 transition-colors"
                            >
                                <span className="text-sm font-semibold tabular-nums shrink-0">
                                    {format(new Date(apt.start_time), "HH:mm")}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-medium truncate">
                                        {apt.contacts?.push_name || apt.contact_name || "Sem cliente"}
                                    </span>
                                    <span className="block text-xs text-muted-foreground truncate">
                                        {apt.service_name || apt.title || "Sem serviço"}
                                    </span>
                                </span>
                                <Badge variant="outline" className={cn("shrink-0", STATUS_CLASS[apt.status] || STATUS_CLASS.pending)}>
                                    {STATUS_LABEL[apt.status] || apt.status}
                                </Badge>
                            </button>
                        ))}
                    </div>

                    {canCreate && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Horários livres
                            </h4>
                            {isClosed ? (
                                <p className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-red-500" /> Agenda fechada neste dia.
                                </p>
                            ) : freeSlots.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Nenhum horário livre — o profissional não atende neste dia ou a agenda está cheia.
                                </p>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                    {freeSlots.map((slot) => (
                                        <Button
                                            key={slot.toISOString()}
                                            variant="outline"
                                            size="sm"
                                            className="justify-center"
                                            onClick={() => onSelectSlot(professional.id, slot)}
                                        >
                                            <Plus className="w-3 h-3 mr-1" />
                                            {format(slot, "HH:mm")}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
