import { useMemo } from "react";
import {
    differenceInMinutes,
    eachDayOfInterval,
    endOfMonth,
    format,
    isSameDay,
    isToday,
    startOfMonth,
} from "date-fns";
import { Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { getWorkHoursForDay } from "@/lib/professionalSchedule";

interface SchedulingMonthViewProps {
    /** Qualquer dia do mês exibido (também marca o dia selecionado) */
    date: Date;
    professional: any;
    /** Agendamentos do mês (de qualquer profissional — filtramos aqui) */
    appointments: any[];
    settings?: any;
    /** Dias com a agenda fechada (yyyy-MM-dd) */
    blockedDates?: string[];
    onToggleDayBlock?: (dateStr: string, block: boolean) => void;
    onDayClick: (day: Date) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function SchedulingMonthView({
    date,
    professional,
    appointments,
    settings,
    blockedDates = [],
    onToggleDayBlock,
    onDayClick,
}: SchedulingMonthViewProps) {
    const isMobile = useIsMobile();
    const MAX_VISIBLE = isMobile ? 2 : 4;

    const days = useMemo(() => {
        const start = startOfMonth(date);
        return eachDayOfInterval({ start, end: endOfMonth(date) });
    }, [date]);

    const leadingBlanks = startOfMonth(date).getDay();

    const dayAppointments = useMemo(() => {
        const map = new Map<string, any[]>();
        if (!professional) return map;
        appointments
            .filter((a) => a.professional_id === professional.id && a.type !== "absence")
            .forEach((a) => {
                const key = format(new Date(a.start_time), "yyyy-MM-dd");
                const list = map.get(key) || [];
                list.push(a);
                map.set(key, list);
            });
        map.forEach((list) =>
            list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()));
        return map;
    }, [appointments, professional]);

    // Mesma conta da grade: minutos agendados / minutos de expediente do dia
    const getOccupancy = (day: Date, list: any[]): number => {
        if (!professional) return 0;
        const profWorkDays = professional.work_days || settings?.work_days || [0, 1, 2, 3, 4, 5, 6];
        if (!profWorkDays.includes(day.getDay())) return 0;
        const wh: any = {
            start: "08:00", end: "22:00", break_start: null, break_end: null,
            ...getWorkHoursForDay(professional, day.getDay()),
        };
        const toMin = (s: string) => {
            const [h, m] = (s || "").split(":").map(Number);
            return (h || 0) * 60 + (m || 0);
        };
        let total = toMin(wh.end || "22:00") - toMin(wh.start || "08:00");
        if (wh.break_start && wh.break_end) total -= toMin(wh.break_end) - toMin(wh.break_start);
        if (total <= 0) return 0;
        const booked = list
            .filter((a) => !["canceled", "no-show"].includes(a.status))
            .reduce((sum, a) => sum + differenceInMinutes(new Date(a.end_time), new Date(a.start_time)), 0);
        return Math.min(100, Math.round((booked / total) * 100));
    };

    const firstName = (apt: any) => {
        const name = apt.contacts?.push_name || apt.contact_name || "Sem cliente";
        return name.trim().split(/\s+/)[0];
    };

    const serviceName = (apt: any) => apt.service_name || "";

    return (
        <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-background">
            {professional && (
                <div className="flex items-center justify-center gap-2 py-2 border-b shrink-0 bg-muted/10">
                    <Avatar className="w-6 h-6">
                        <AvatarImage src={professional.photo_url} />
                        <AvatarFallback className="text-[10px]">{professional.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-semibold truncate">{professional.name}</span>
                </div>
            )}

            <div className="grid grid-cols-7 border-b shrink-0">
                {WEEKDAYS.map((w) => (
                    <div key={w} className="py-2 text-center text-[11px] md:text-xs font-medium text-muted-foreground bg-muted/20 border-r last:border-r-0">
                        {w}
                    </div>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-7 auto-rows-fr">
                    {Array.from({ length: leadingBlanks }).map((_, i) => (
                        <div key={`blank-${i}`} className="border-r border-b bg-muted/10" />
                    ))}

                    {days.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const list = dayAppointments.get(key) || [];
                        const closed = blockedDates.includes(key);
                        const active = list.filter((a) => !["canceled", "no-show"].includes(a.status));
                        const occupancy = getOccupancy(day, list);
                        const overflow = list.length - MAX_VISIBLE;

                        return (
                            <div
                                key={key}
                                onClick={() => onDayClick(day)}
                                className={cn(
                                    "border-r border-b p-1 md:p-1.5 min-h-[110px] md:min-h-[144px] overflow-hidden flex flex-col gap-1 cursor-pointer transition-colors hover:bg-muted/40",
                                    isSameDay(day, date) && "bg-primary/5 ring-1 ring-inset ring-primary/40",
                                    closed && "bg-red-50/60 dark:bg-red-950/20"
                                )}
                            >
                                <div className="flex items-center justify-between gap-1">
                                    <span className={cn(
                                        "text-xs md:text-sm font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                                        isToday(day) && "bg-primary text-primary-foreground"
                                    )}>
                                        {format(day, "d")}
                                    </span>

                                    {active.length === 0 ? (
                                        <button
                                            type="button"
                                            disabled={!onToggleDayBlock}
                                            title={closed
                                                ? "Agenda fechada neste dia — clique para liberar"
                                                : "Fechar agenda neste dia"}
                                            className={cn(
                                                "shrink-0 rounded p-0.5 transition-colors disabled:opacity-40",
                                                closed ? "text-red-500 hover:text-red-600" : "text-muted-foreground hover:text-foreground"
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleDayBlock?.(key, !closed);
                                            }}
                                        >
                                            <Lock className="h-3.5 w-3.5" />
                                        </button>
                                    ) : (
                                        <div className="relative w-7 h-7 md:w-8 md:h-8 shrink-0" title={`Ocupação da agenda: ${occupancy}%`}>
                                            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                                <circle cx="18" cy="18" r="15" fill="none" strokeWidth="5" className="stroke-muted" />
                                                <circle
                                                    cx="18" cy="18" r="15" fill="none" strokeWidth="5"
                                                    pathLength={100}
                                                    strokeDasharray={`${occupancy} ${100 - occupancy}`}
                                                    strokeLinecap="round"
                                                    className="stroke-primary transition-all duration-500"
                                                />
                                            </svg>
                                            <span className="absolute inset-0 flex items-center justify-center text-[7px] md:text-[8px] font-semibold">
                                                {occupancy}%
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-0.5 min-w-0">
                                    {list.slice(0, MAX_VISIBLE).map((apt) => (
                                        <span
                                            key={apt.id}
                                            className={cn(
                                                "text-[10px] md:text-[11px] leading-tight truncate rounded px-1 py-0.5",
                                                ["canceled", "no-show"].includes(apt.status)
                                                    ? "bg-muted text-muted-foreground line-through"
                                                    : "bg-primary/10 text-foreground"
                                            )}
                                        >
                                            {firstName(apt)}
                                            {serviceName(apt) && ` - ${serviceName(apt)}`}
                                            {" - "}
                                            {format(new Date(apt.start_time), "HH:mm")}
                                        </span>
                                    ))}
                                    {overflow > 0 && (
                                        <button
                                            type="button"
                                            className="text-[10px] md:text-[11px] text-primary font-medium text-left hover:underline"
                                            onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
                                        >
                                            +{overflow} agendamento{overflow > 1 ? "s" : ""}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
