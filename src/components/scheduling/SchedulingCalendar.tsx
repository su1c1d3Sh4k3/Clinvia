import { useMemo, useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { format, addMinutes, startOfDay, differenceInMinutes, parseISO, isSameDay } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ThumbsUp, Clock, X, Check, Pen, ChevronLeft, ChevronRight, UserX, ArrowRight, Star, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useProfessionalNps } from "@/hooks/useAppointmentsDashboard";
import { useServiceDisplayNames } from "@/hooks/useServiceDisplayNames";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSlotMinutes } from "@/hooks/useSlotMinutes";
import { useStaff } from "@/hooks/useStaff";
import { getWorkHoursForDay } from "@/lib/professionalSchedule";
import { convenioRanges, parseTimeToMinutes } from "@/lib/convenioSchedule";

interface SchedulingCalendarProps {
    date: Date;
    professionals: any[];
    appointments: any[];
    settings?: any;
    onSlotClick: (professionalId: string, time: Date) => void;
    onEventClick: (event: any) => void;
    onStatusChange: (appointmentId: string, newStatus: string, event?: any) => void;
    onEditProfessional?: (professional: any) => void;
    canCreateAppointment?: boolean;
    canEditAppointment?: boolean;
    canEditProfessional?: boolean;
    /** Profissionais com a agenda fechada nesta data (professional_day_blocks) */
    blockedProfessionalIds?: string[];
    onToggleDayBlock?: (professionalId: string, block: boolean) => void;
    /** Solo view (controlada pela página): exibe só a agenda desse profissional */
    soloProfessionalId: string | null;
    onSoloProfessionalChange: (professionalId: string | null) => void;
}

const START_HOUR = 8;
const END_HOUR = 22;
// Alturas por hora: mobile mais compacto (tudo deriva de pxPerMin no componente)
const HOUR_HEIGHT_DESKTOP = 120;
const HOUR_HEIGHT_MOBILE = 80;
/** Agenda única: slot de 5 min ficava estreito demais, então a hora dobra de altura. */
const SOLO_HEIGHT_FACTOR = 2;
/** Largura do card flutuante de hover (px) — posicionado por portal, em coordenadas de tela. */
const HOVER_CARD_WIDTH = 256;

/** Agendamento nascido de API do n8n ou do link público = autoria da IA (regra do usuário). */
const IA_ORIGINS = new Set(["ia", "public_link"]);

export function SchedulingCalendar({ date, professionals, appointments, settings, onSlotClick, onEventClick, onStatusChange, onEditProfessional, canCreateAppointment = true, canEditAppointment = true, canEditProfessional = true, blockedProfessionalIds = [], onToggleDayBlock, soloProfessionalId, onSoloProfessionalChange }: SchedulingCalendarProps) {
    const startHour = settings?.start_hour ?? 8;
    const endHour = settings?.end_hour ?? 22;
    const workDays = settings?.work_days ?? [0, 1, 2, 3, 4, 5, 6];
    const isDayBlocked = !workDays.includes(date.getDay());

    // Solo view: clique no nome do profissional (ou na lista da barra lateral)
    // exibe apenas a agenda dele — com a grade dobrada e cards detalhados.
    const soloId = soloProfessionalId;
    const setSoloId = onSoloProfessionalChange;
    const soloProfessional = soloId ? professionals.find((p) => p.id === soloId) : undefined;
    const isSolo = !!soloProfessional;

    const isMobile = useIsMobile();
    const HOUR_HEIGHT = (isMobile ? HOUR_HEIGHT_MOBILE : HOUR_HEIGHT_DESKTOP) * (isSolo ? SOLO_HEIGHT_FACTOR : 1);
    const PX_PER_MIN = HOUR_HEIGHT / 60;

    // Tamanho do slot da conta: na agenda única a coluna de horário é marcada
    // de slot em slot (8:10 | 8:20 | 8:30) em vez de só de hora em hora.
    const { data: accountSlotMinutes } = useSlotMinutes();
    const slotMinutes = isSolo ? Math.min(60, Math.max(5, accountSlotMinutes ?? 10)) : 60;

    // Autoria do agendamento (mesma regra do ViewAppointmentModal)
    const { data: staff } = useStaff();
    const authorName = (apt: any): string => {
        if (IA_ORIGINS.has(apt.created_via || "")) return "IA";
        const member = apt.created_by ? staff?.find((m) => m.id === apt.created_by) : undefined;
        return member?.name || "Não informado";
    };

    // Média NPS por profissional (todo o histórico)
    const { data: ownerId } = useOwnerId();
    const { data: profNps } = useProfessionalNps(ownerId);
    const npsOf = (professionalId: string) => (profNps || []).find((n) => n.professional_id === professionalId);
    const { resolveServiceName } = useServiceDisplayNames();

    // Agenda fechada no dia: o cadeado só aparece se o profissional não tiver
    // NENHUM agendamento na data (cancelados/no-show não contam) — ou se o dia
    // já estiver fechado, para poder ser reaberto.
    const isDayClosed = (professionalId: string) => blockedProfessionalIds.includes(professionalId);
    const hasAppointmentsToday = (professionalId: string) =>
        appointments.some((a) =>
            a.professional_id === professionalId &&
            isSameDay(new Date(a.start_time), date) &&
            !["canceled", "no-show"].includes(a.status));
    const [unlockTarget, setUnlockTarget] = useState<any | null>(null);

    const handleLockClick = (professional: any) => {
        if (isDayClosed(professional.id)) {
            setUnlockTarget(professional);
        } else {
            onToggleDayBlock?.(professional.id, true);
        }
    };

    // Pagination state for 5+ professionals
    const [startIndex, setStartIndex] = useState(0);
    const MAX_VISIBLE = 4;
    const needsPagination = !soloProfessional && professionals.length > MAX_VISIBLE;

    // Calculate visible professionals window
    const visibleProfessionals = soloProfessional
        ? [soloProfessional]
        : needsPagination
            ? professionals.slice(startIndex, startIndex + MAX_VISIBLE)
            : professionals;

    // Reset to first when date changes (a solo view é mantida: o usuário pode
    // navegar pelos dias acompanhando o mesmo profissional)
    useEffect(() => {
        setStartIndex(0);
    }, [date]);

    // Refs for syncing horizontal scroll between header and body on mobile
    const headerRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const isSyncing = useRef(false);

    // Sync scroll between header and body
    const handleHeaderScroll = () => {
        if (isSyncing.current) return;
        isSyncing.current = true;
        if (bodyRef.current && headerRef.current) {
            bodyRef.current.scrollLeft = headerRef.current.scrollLeft;
        }
        requestAnimationFrame(() => { isSyncing.current = false; });
    };

    const handleBodyScroll = () => {
        // A janela flutuante é posicionada em coordenadas de tela: rolar invalida
        setHovered(null);
        if (isSyncing.current) return;
        isSyncing.current = true;
        if (headerRef.current && bodyRef.current) {
            headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
        }
        requestAnimationFrame(() => { isSyncing.current = false; });
    };

    // Linhas da grade + coluna de horário. Fora da agenda única são as horas
    // cheias (8:00, 9:00...); na agenda única, o slot da conta (8:10, 8:20...).
    const gridSlots = useMemo(() => {
        const slots: { minutes: number; label: string; isHour: boolean }[] = [];
        for (let m = startHour * 60; m <= endHour * 60; m += slotMinutes) {
            const h = Math.floor(m / 60);
            const mm = m % 60;
            slots.push({ minutes: m, label: `${h}:${String(mm).padStart(2, "0")}`, isHour: mm === 0 });
        }
        return slots;
    }, [startHour, endHour, slotMinutes]);

    // Card flutuante do hover: renderizado por portal no <body> para nunca ser
    // cortado pelo scroll da grade nem ficar atrás de outro agendamento (cada
    // coluna cria um contexto de empilhamento por causa do zoom-in da animação).
    const [hovered, setHovered] = useState<{ apt: any; professionalName: string; rect: DOMRect } | null>(null);
    const hoverTimer = useRef<number | null>(null);
    const cancelHoverClose = () => {
        if (hoverTimer.current) {
            window.clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
        }
    };
    const openHover = (apt: any, professionalName: string, el: HTMLElement) => {
        cancelHoverClose();
        setHovered({ apt, professionalName, rect: el.getBoundingClientRect() });
    };
    // Pequena folga para o mouse atravessar do card para a janela flutuante
    const scheduleHoverClose = () => {
        cancelHoverClose();
        hoverTimer.current = window.setTimeout(() => setHovered(null), 140);
    };
    useEffect(() => () => cancelHoverClose(), []);

    /**
     * Distribui em colunas (lanes) os agendamentos que se sobrepõem — um
     * cancelado e o novo agendamento do mesmo horário ficam lado a lado.
     * A sobreposição é medida em PIXELS (o cancelado é uma faixa de 24px,
     * não a duração cheia).
     */
    const layoutLanes = (items: { id: string; topPx: number; heightPx: number }[]) => {
        const result = new Map<string, { lane: number; lanes: number }>();
        const sorted = [...items].sort((a, b) => a.topPx - b.topPx || a.heightPx - b.heightPx);

        let cluster: typeof sorted = [];
        let clusterEnd = -Infinity;
        const flush = () => {
            const laneEnds: number[] = [];
            const laneOf = new Map<string, number>();
            for (const it of cluster) {
                let lane = laneEnds.findIndex((end) => end <= it.topPx + 0.5);
                if (lane === -1) {
                    lane = laneEnds.length;
                    laneEnds.push(0);
                }
                laneEnds[lane] = it.topPx + it.heightPx;
                laneOf.set(it.id, lane);
            }
            for (const it of cluster) {
                result.set(it.id, { lane: laneOf.get(it.id) ?? 0, lanes: laneEnds.length });
            }
            cluster = [];
            clusterEnd = -Infinity;
        };

        for (const it of sorted) {
            if (cluster.length && it.topPx >= clusterEnd - 0.5) flush();
            cluster.push(it);
            clusterEnd = Math.max(clusterEnd, it.topPx + it.heightPx);
        }
        if (cluster.length) flush();
        return result;
    };

    const getEventStyle = (event: any) => {
        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes = end.getHours() * 60 + end.getMinutes();
        const duration = endMinutes - startMinutes;

        // Offset from startHour
        const top = (startMinutes - startHour * 60) * PX_PER_MIN;

        return {
            top: `${top}px`,
            height: `${duration * PX_PER_MIN}px`,
        };
    };

    const getStatusLabel = (status: string) => ({
        pending: "Pendente",
        confirmed: "Confirmado",
        rescheduled: "Reagendado",
        waiting: "Aguardando",
        completed: "Concluído",
        canceled: "Cancelado",
        "no-show": "Não compareceu",
    } as Record<string, string>)[status] || status;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmed':
                return "bg-purple-100 border-purple-200 text-purple-700 hover:bg-purple-200";
            case 'rescheduled':
                return "bg-yellow-100 border-yellow-200 text-yellow-700 hover:bg-yellow-200";
            case 'completed':
                return "bg-green-100 border-green-200 text-green-700 hover:bg-green-200";
            case 'canceled':
                return "bg-red-100 border-red-200 text-red-700 hover:bg-red-200";
            case 'no-show':
                return "bg-orange-100 border-orange-200 text-orange-700 hover:bg-orange-200";
            case 'waiting':
                return "bg-gray-200 border-gray-300 text-gray-700 hover:bg-gray-300";
            case 'pending':
            default:
                return "bg-blue-100 border-blue-200 text-blue-700 hover:bg-blue-200";
        }
    };

    // Status vem direto do banco (waiting é setado pelo cron pg_cron)
    const getDisplayStatus = (apt: any): string => apt.status || 'pending';

    // Taxa de ocupação do dia por profissional (minutos agendados / minutos de expediente)
    const getOccupancy = (professional: any): number => {
        const profWorkDays = professional.work_days || settings?.work_days || [0, 1, 2, 3, 4, 5, 6];
        if (!profWorkDays.includes(date.getDay())) return 0;
        const wh: any = { start: "08:00", end: "22:00", break_start: null, break_end: null, ...getWorkHoursForDay(professional, date.getDay()) };
        const toMin = (s: string) => {
            const [h, m] = (s || "").split(":").map(Number);
            return (h || 0) * 60 + (m || 0);
        };
        let total = toMin(wh.end || "22:00") - toMin(wh.start || "08:00");
        if (wh.break_start && wh.break_end) total -= toMin(wh.break_end) - toMin(wh.break_start);
        if (total <= 0) return 0;
        const booked = appointments
            .filter((a) =>
                a.professional_id === professional.id &&
                isSameDay(new Date(a.start_time), date) &&
                a.type !== "absence" &&
                !["canceled", "no-show"].includes(a.status))
            .reduce((sum, a) => sum + differenceInMinutes(new Date(a.end_time), new Date(a.start_time)), 0);
        return Math.min(100, Math.round((booked / total) * 100));
    };

    return (
        <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-background">
            {/* Header - Synced horizontal scroll on mobile */}
            <div
                ref={headerRef}
                className={cn("flex border-b", !needsPagination && "overflow-x-auto [&::-webkit-scrollbar]:hidden")}
                onScroll={handleHeaderScroll}
            >
                <div className="w-12 md:w-16 shrink-0 border-r bg-muted/50" /> {/* Time column header */}
                {visibleProfessionals.map((professional) => (
                    <div
                        key={`${soloId ?? "all"}-${professional.id}`}
                        className="flex-1 p-2 md:p-4 flex flex-row items-center justify-center gap-2 md:gap-3 border-r last:border-r-0 bg-muted/20 min-w-[120px] md:min-w-[150px] relative group/header cursor-pointer animate-in fade-in zoom-in-95 duration-300"
                        title={soloId ? undefined : "Ver apenas a agenda deste profissional"}
                        onClick={() => setSoloId(soloId ? null : professional.id)}
                    >
                        <Avatar className="w-8 h-8 md:w-12 md:h-12">
                            <AvatarImage src={professional.photo_url} />
                            <AvatarFallback className="text-xs md:text-base">{professional.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col items-start">
                            <div className="flex items-center gap-1">
                                <span className="font-medium text-xs md:text-sm truncate max-w-[80px] sm:max-w-[120px] md:max-w-none">{professional.name}</span>
                                {onToggleDayBlock && (isDayClosed(professional.id) || !hasAppointmentsToday(professional.id)) && (
                                    <button
                                        type="button"
                                        title={isDayClosed(professional.id)
                                            ? "Agenda fechada neste dia — clique para liberar"
                                            : "Fechar agenda no neste dia"}
                                        className={cn(
                                            "shrink-0 rounded p-0.5 transition-colors",
                                            isDayClosed(professional.id)
                                                ? "text-red-500 hover:text-red-600"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        onClick={(e) => { e.stopPropagation(); handleLockClick(professional); }}
                                    >
                                        <Lock className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                            <span className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">{professional.role}</span>
                            {professional.commission > 0 && (
                                <span className="text-[10px] md:text-xs text-orange-500 font-medium hidden md:block">
                                    {professional.commission}% comissão
                                </span>
                            )}
                        </div>
                        {(() => {
                            const occupancy = getOccupancy(professional);
                            return (
                                <div className="relative w-8 h-8 md:w-12 md:h-12 shrink-0" title={`Ocupação da agenda: ${occupancy}%`}>
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
                                    <span className="absolute inset-0 flex items-center justify-center text-[8px] md:text-[10px] font-semibold">
                                        {occupancy}%
                                    </span>
                                </div>
                            );
                        })()}
                        {(() => {
                            const nps = npsOf(professional.id);
                            const value = nps?.avg_nps != null ? Number(nps.avg_nps) : null;
                            const pct = value != null ? Math.min(100, Math.round((value / 5) * 100)) : 0;
                            return (
                                <div
                                    className="relative w-8 h-8 md:w-12 md:h-12 shrink-0"
                                    title={value != null
                                        ? `Média NPS: ${value} / 5 (${nps!.nps_count} avaliações)`
                                        : "Sem avaliações NPS"}
                                >
                                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="5" className="stroke-muted" />
                                        <circle
                                            cx="18" cy="18" r="15" fill="none" strokeWidth="5"
                                            pathLength={100}
                                            strokeDasharray={`${pct} ${100 - pct}`}
                                            strokeLinecap="round"
                                            className="stroke-amber-500 transition-all duration-500"
                                        />
                                    </svg>
                                    <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                                        <Star className="w-2 h-2 md:w-2.5 md:h-2.5 text-amber-500 fill-amber-500" />
                                        <span className="text-[8px] md:text-[10px] font-semibold">
                                            {value != null ? value : "—"}
                                        </span>
                                    </span>
                                </div>
                            );
                        })()}
                        {soloId === professional.id && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full shadow-sm"
                                title="Restaurar exibição de todos os profissionais"
                                onClick={(e) => { e.stopPropagation(); setSoloId(null); }}
                            >
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        )}
                        {canEditProfessional && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover/header:opacity-100 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); onEditProfessional && onEditProfessional(professional); }}
                            >
                                <Pen className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                ))}
            </div>

            {/* Body - Synced horizontal scroll on mobile */}
            <div
                ref={bodyRef}
                className={cn("flex-1 overflow-y-auto relative scrollbar-none", !needsPagination && "overflow-x-auto")}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                onScroll={handleBodyScroll}
            >
                <div className="flex" style={{ height: (endHour - startHour + 1) * HOUR_HEIGHT }}>
                    {/* Time Labels */}
                    <div className="w-12 md:w-16 shrink-0 border-r bg-muted/10 flex flex-col relative">
                        {gridSlots.map((slot) => (
                            <div
                                key={slot.minutes}
                                className={cn(
                                    "absolute w-full text-right pr-1 md:pr-2 text-xs md:text-sm border-t",
                                    slot.isHour ? "text-muted-foreground" : "text-muted-foreground/60 border-dashed"
                                )}
                                style={{ top: (slot.minutes - startHour * 60) * PX_PER_MIN, height: slotMinutes * PX_PER_MIN }}
                            >
                                {slot.label}
                            </div>
                        ))}
                    </div>

                    {/* Columns */}
                    {visibleProfessionals.map((professional) => (
                        <div key={`${soloId ?? "all"}-${professional.id}`} className="flex-1 border-r last:border-r-0 relative min-w-[120px] md:min-w-[150px] group animate-in fade-in zoom-in-95 duration-300">
                            {/* Grid Lines */}
                            {gridSlots.map((slot) => {
                                const slotDate = new Date(date);
                                slotDate.setHours(Math.floor(slot.minutes / 60), slot.minutes % 60, 0, 0);

                                // Parse professional settings (horário do dia exibido, se individual)
                                const workDays = professional.work_days || settings?.work_days || [0, 1, 2, 3, 4, 5, 6];
                                const workHours: any = { start: "08:00", end: "22:00", break_start: null, break_end: null, ...getWorkHoursForDay(professional, date.getDay()) };

                                // O meio do slot decide se ele está dentro do expediente — assim a
                                // linha de hora cheia continua se comportando como antes e o slot
                                // curto da agenda única também cai no lugar certo.
                                const slotMid = slot.minutes + slotMinutes / 2;
                                const startMin = parseTimeToMinutes(workHours.start) ?? 8 * 60;
                                const endMin = parseTimeToMinutes(workHours.end) ?? 22 * 60;
                                const breakStartMin = parseTimeToMinutes(workHours.break_start);
                                const breakEndMin = parseTimeToMinutes(workHours.break_end);

                                const isDayOff = !workDays.includes(date.getDay());
                                const isBeforeStart = slotMid < startMin;
                                const isAfterEnd = slotMid >= endMin;
                                // Agenda fechada no dia: a coluna inteira vira intervalo
                                const isBreak = isDayClosed(professional.id) ||
                                    (breakStartMin != null && breakEndMin != null && slotMid >= breakStartMin && slotMid < breakEndMin);

                                const isBlocked = isDayOff || isBeforeStart || isAfterEnd || isBreak;
                                const isPast = slotDate < new Date();

                                return (
                                    <div
                                        key={slot.minutes}
                                        className={cn(
                                            "absolute w-full border-t border-dashed border-muted/50 transition-colors",
                                            !isPast && !isBlocked && canCreateAppointment && "bg-white dark:bg-transparent hover:bg-accent/50 dark:hover:bg-[#353A44] cursor-pointer",
                                            !isPast && !isBlocked && !canCreateAppointment && "bg-white dark:bg-transparent",
                                            isBlocked && "bg-muted/30 dark:bg-muted/30",
                                            isPast && "bg-[#C6C8CA] dark:bg-[#22262E]"
                                        )}
                                        style={{
                                            top: (slot.minutes - startHour * 60) * PX_PER_MIN,
                                            height: slotMinutes * PX_PER_MIN,
                                            backgroundColor: isBlocked && !isPast ? "rgba(0,0,0,0.2)" : undefined,
                                            backgroundImage: isBlocked && !isPast ? "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px)" : undefined
                                        }}
                                        onClick={() => {
                                            if (!isPast && !isBlocked && canCreateAppointment) {
                                                onSlotClick(professional.id, slotDate);
                                            }
                                        }}
                                    >
                                        {isBreak && !isPast && slot.isHour && (
                                            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-medium opacity-50 select-none">
                                                Intervalo
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Faixa dedicada a convênio — informativa: o encaixe manual segue livre */}
                            {(() => {
                                if (isDayClosed(professional.id)) return null;
                                const wd = date.getDay();
                                const days = professional.work_days || settings?.work_days || [0, 1, 2, 3, 4, 5, 6];
                                if (!days.includes(wd)) return null;
                                const wh: any = { start: "08:00", end: "22:00", break_start: null, break_end: null, ...getWorkHoursForDay(professional, wd) };
                                const ranges = convenioRanges(professional, wd, {
                                    start: parseTimeToMinutes(wh.start) ?? 0,
                                    end: parseTimeToMinutes(wh.end) ?? 24 * 60,
                                    breakStart: parseTimeToMinutes(wh.break_start),
                                    breakEnd: parseTimeToMinutes(wh.break_end),
                                });
                                return ranges.map((r) => (
                                    <div
                                        key={`conv-${r.start}`}
                                        className="absolute inset-x-0 pointer-events-none bg-amber-300/25 dark:bg-amber-400/15 border-y border-amber-400/60"
                                        style={{
                                            top: (r.start - startHour * 60) * PX_PER_MIN,
                                            height: (r.end - r.start) * PX_PER_MIN,
                                        }}
                                    >
                                        <span className="absolute top-0.5 left-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 select-none">
                                            Convênio
                                        </span>
                                    </div>
                                ));
                            })()}

                            {/* Events */}
                            {(() => {
                            const dayEvents = appointments
                                .filter((apt) => {
                                    const sameDay = isSameDay(new Date(apt.start_time), date);
                                    if (!sameDay) return false;
                                    // Absences imported from Google Calendar (clinic-wide, no specific professional) appear in ALL columns
                                    if (apt.type === "absence" && apt.professional_id === null && apt.google_event_id) return true;
                                    return apt.professional_id === professional.id;
                                });

                            // Sobreposições viram colunas lado a lado (ex.: cancelado + novo agendamento no mesmo horário)
                            const laneMap = layoutLanes(dayEvents.map((apt) => {
                                const s = new Date(apt.start_time);
                                const e = new Date(apt.end_time);
                                const collapsed = ['canceled', 'no-show'].includes(getDisplayStatus(apt));
                                return {
                                    id: apt.id,
                                    topPx: (s.getHours() * 60 + s.getMinutes() - startHour * 60) * PX_PER_MIN,
                                    heightPx: collapsed ? 24 : Math.max(1, differenceInMinutes(e, s) * PX_PER_MIN),
                                };
                            }));

                            return dayEvents
                                .map((apt) => {
                                    const displayStatus = getDisplayStatus(apt);
                                    const isCollapsed = displayStatus === 'canceled' || displayStatus === 'no-show';

                                    const aptStart = new Date(apt.start_time);
                                    const aptEnd = new Date(apt.end_time);
                                    const aptDuration = differenceInMinutes(aptEnd, aptStart);

                                    // Cancelados e no-show: faixa fina no topo
                                    const baseStyle = getEventStyle(apt);
                                    // Lado a lado quando há sobreposição (1 lane = largura cheia, como antes)
                                    const { lane, lanes } = laneMap.get(apt.id) ?? { lane: 0, lanes: 1 };
                                    const laneWidth = 100 / lanes;
                                    const eventStyle = {
                                        ...baseStyle,
                                        left: `calc(${lane * laneWidth}% + 4px)`,
                                        width: `calc(${laneWidth}% - 8px)`,
                                        ...(isCollapsed ? { height: '24px', opacity: 0.55 } : {}),
                                    };

                                    return (
                                        <div
                                            key={apt.id}
                                            className={cn(
                                                "absolute rounded-md px-1.5 py-0.5 cursor-pointer border shadow-sm transition-all z-10 hover:z-20",
                                                apt.type === "absence" ? "bg-muted text-muted-foreground border-border" : getStatusColor(displayStatus),
                                                isCollapsed && "border-dashed"
                                            )}
                                            style={eventStyle}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setHovered(null);
                                                onEventClick(apt);
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isMobile && apt.type !== "absence") openHover(apt, professional.name, e.currentTarget);
                                            }}
                                            onMouseLeave={() => {
                                                if (!isMobile && apt.type !== "absence") scheduleHoverClose();
                                            }}
                                        >
                                            {isCollapsed ? (
                                                // Cancelado/No-show: faixa fina com nome
                                                <div className="flex items-center gap-1 truncate h-full" style={{ fontSize: '11px', lineHeight: 1 }}>
                                                    {displayStatus === 'no-show' ? <UserX className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                                                    <span className="font-semibold truncate">
                                                        {apt.contacts?.push_name || apt.contact_name || 'Cliente'}
                                                    </span>
                                                    <span className="opacity-60 truncate">· {resolveServiceName(apt.service_id, apt.service_name) || 'Serviço'}</span>
                                                    <span className="opacity-50 shrink-0">{format(new Date(apt.start_time), 'HH:mm')}</span>
                                                </div>
                                            ) : (() => {
                                                const start = aptStart;
                                                const end = aptEnd;
                                                const durationInMinutes = aptDuration;
                                                // Compacto é questão de ALTURA, não de duração: na agenda
                                                // única a grade dobra e o mesmo evento comporta 2 linhas
                                                const isCompact = durationInMinutes * PX_PER_MIN < 44;

                                                // Adaptive font size: min 11px, max 15px (35min+)
                                                const fontSize = Math.max(11, Math.min(15, Math.floor(durationInMinutes / 5) + 8));

                                                // Extract first name / event title
                                                const gcalImported = apt.type === "absence" && apt.google_event_id;
                                                const gcalTitle = gcalImported && apt.description
                                                    ? apt.description.replace(/^Bloqueio importado do Google Calendar:\s*/i, "").trim() || "Bloqueio GCal"
                                                    : null;
                                                const fullName = gcalTitle ?? (apt.type === "absence" ? "Ausência" : (apt.contacts?.push_name || apt.contact_name || "Cliente"));
                                                const serviceName = resolveServiceName(apt.service_id, apt.service_name) || "Serviço";

                                                return (
                                                    <div
                                                        className="overflow-hidden h-full flex flex-col justify-center"
                                                        style={{ fontSize: `${fontSize}px`, lineHeight: 1.2 }}
                                                    >
                                                        {isCompact ? (
                                                            // Compact mode (< 40 min): single line
                                                            <div className="flex items-center gap-1 truncate">
                                                                <span className="font-bold shrink-0">{fullName}</span>
                                                                {apt.type === "appointment" && (
                                                                    <>
                                                                        <span className="opacity-50">|</span>
                                                                        <span className="truncate opacity-80">{serviceName}</span>
                                                                        <span className="opacity-50">|</span>
                                                                        <span className="opacity-70 shrink-0">
                                                                            {format(start, "HH:mm")}-{format(end, "HH:mm")}
                                                                        </span>
                                                                    </>
                                                                )}
                                                                {apt.google_event_id && (
                                                                    <svg className="w-2.5 h-2.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                                                    </svg>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            // Normal mode (>= 40 min): two lines
                                                            <div className="flex flex-col justify-center h-full">
                                                                <div className="font-bold truncate flex items-center gap-1">
                                                                    {/* Agenda única: o nome fica sozinho em negrito e o resto desce para a linha de baixo */}
                                                                    <span className="truncate">{fullName}{!isSolo && apt.type === "appointment" && ` | ${serviceName}`}</span>
                                                                    {apt.google_event_id && (
                                                                        <svg className="w-3 h-3 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                                                        </svg>
                                                                    )}
                                                                </div>
                                                                <div className="opacity-70 truncate" style={isSolo ? { fontSize: `${Math.max(10, fontSize - 2)}px`, lineHeight: 1.3 } : undefined}>
                                                                    {format(start, "HH:mm")} - {format(end, "HH:mm")}
                                                                    {isSolo && apt.type === "appointment" && (
                                                                        <> | {serviceName} | {apt.created_at ? format(new Date(apt.created_at), "dd/MM/yyyy") : "Data não informada"} | {authorName(apt)}</>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )
                                });
                            })()}
                        </div>
                    ))}
                </div>
            </div>

            {/* Pagination Controls */}
            {needsPagination && (
                <div className="flex items-center justify-end gap-2 p-2 border-t bg-muted/10">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={startIndex === 0}
                        onClick={() => setStartIndex(prev => prev - 1)}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={startIndex >= professionals.length - MAX_VISIBLE}
                        onClick={() => setStartIndex(prev => prev + 1)}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <AlertDialog open={!!unlockTarget} onOpenChange={(open) => { if (!open) setUnlockTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Liberar agenda</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deseja liberar o dia desse profissional para receber agendamentos
                            {unlockTarget ? ` (${unlockTarget.name}, ${format(date, "dd/MM/yyyy")})` : ""}?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Não</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (unlockTarget) onToggleDayBlock?.(unlockTarget.id, false);
                                setUnlockTarget(null);
                            }}
                        >
                            Sim
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Janela flutuante do hover: vive no <body> para nunca ser cortada
                pelo scroll da grade nem ficar atrás de outro agendamento. */}
            {hovered && createPortal((() => {
                const apt = hovered.apt;
                const displayStatus = getDisplayStatus(apt);
                const isFinalStatus = ['completed', 'canceled', 'no-show'].includes(displayStatus);
                const isWaiting = displayStatus === 'waiting';
                const aptStart = new Date(apt.start_time);
                const aptEnd = new Date(apt.end_time);
                const aptDuration = differenceInMinutes(aptEnd, aptStart);
                const rect = hovered.rect;

                // Abre abaixo quando o card está na parte de cima da tela; a
                // horizontal é presa à janela para nunca sair pela lateral.
                const openBelow = rect.top < 300;
                const left = Math.max(8, Math.min(rect.right - HOVER_CARD_WIDTH, window.innerWidth - HOVER_CARD_WIDTH - 8));

                return (
                    <div
                        className="fixed z-[100] w-64 bg-background/95 backdrop-blur-sm border shadow-lg rounded-lg p-3 text-foreground cursor-pointer animate-in fade-in duration-150"
                        style={{
                            left,
                            ...(openBelow
                                ? { top: rect.bottom + 6 }
                                : { bottom: window.innerHeight - rect.top + 6 }),
                        }}
                        onMouseEnter={cancelHoverClose}
                        onMouseLeave={scheduleHoverClose}
                        onClick={() => { setHovered(null); onEventClick(apt); }}
                    >
                        <div className="space-y-1 text-xs">
                            <p className="font-bold text-sm truncate">{apt.contacts?.push_name || apt.contact_name || "Cliente"}</p>
                            {(apt.contacts?.number || apt.contact_phone) && (
                                <p className="text-muted-foreground truncate">
                                    {String(apt.contacts?.number || apt.contact_phone).replace("@s.whatsapp.net", "")}
                                </p>
                            )}
                            <p><span className="text-muted-foreground">Serviço: </span>{resolveServiceName(apt.service_id, apt.service_name) || "Serviço"}</p>
                            <p><span className="text-muted-foreground">Sala: </span>{hovered.professionalName}</p>
                            <p><span className="text-muted-foreground">Horário: </span>{format(aptStart, "HH:mm")} - {format(aptEnd, "HH:mm")} ({aptDuration} min)</p>
                            <p><span className="text-muted-foreground">Status: </span><span className="font-medium">{getStatusLabel(displayStatus)}</span></p>
                            <p><span className="text-muted-foreground">Agendado por: </span>{authorName(apt)}{apt.created_at ? ` · ${format(new Date(apt.created_at), "dd/MM/yyyy")}` : ""}</p>
                        </div>

                        <div className="flex items-center gap-1 pt-2 mt-2 border-t">
                            {/* Ações para status waiting: Concluir, Cancelar, No-show */}
                            {isWaiting && canEditAppointment && (
                                <>
                                    <Button
                                        variant="ghost" size="icon" title="Concluir" className="h-7 w-7 rounded-full hover:bg-green-100 hover:text-green-600 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setHovered(null); onStatusChange(apt.id, 'completed', apt); }}
                                    >
                                        <Check className="h-4 w-4" strokeWidth={2} />
                                    </Button>
                                    <Button
                                        variant="ghost" size="icon" title="Cancelar" className="h-7 w-7 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setHovered(null); onStatusChange(apt.id, 'canceled'); }}
                                    >
                                        <X className="h-4 w-4" strokeWidth={2} />
                                    </Button>
                                    <Button
                                        variant="ghost" size="icon" title="Não compareceu" className="h-7 w-7 rounded-full hover:bg-orange-100 hover:text-orange-600 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setHovered(null); onStatusChange(apt.id, 'no-show'); }}
                                    >
                                        <UserX className="h-4 w-4" strokeWidth={2} />
                                    </Button>
                                </>
                            )}
                            {/* Ações para status normal (não-waiting, não-final) */}
                            {!isFinalStatus && !isWaiting && canEditAppointment && (
                                <>
                                    <Button
                                        variant="ghost" size="icon" title="Confirmar" className="h-7 w-7 rounded-full hover:bg-purple-100 hover:text-purple-600 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setHovered(null); onStatusChange(apt.id, 'confirmed'); }}
                                    >
                                        <ThumbsUp className="h-4 w-4" strokeWidth={2} />
                                    </Button>
                                    <Button
                                        variant="ghost" size="icon" title="Reagendar" className="h-7 w-7 rounded-full hover:bg-yellow-100 hover:text-yellow-600 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setHovered(null); onStatusChange(apt.id, 'rescheduled', apt); }}
                                    >
                                        <Clock className="h-4 w-4" strokeWidth={2} />
                                    </Button>
                                    <Button
                                        variant="ghost" size="icon" title="Cancelar" className="h-7 w-7 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setHovered(null); onStatusChange(apt.id, 'canceled'); }}
                                    >
                                        <X className="h-4 w-4" strokeWidth={2} />
                                    </Button>
                                    <Button
                                        variant="ghost" size="icon" title="Concluir" className="h-7 w-7 rounded-full hover:bg-green-100 hover:text-green-600 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setHovered(null); onStatusChange(apt.id, 'completed', apt); }}
                                    >
                                        <Check className="h-4 w-4" strokeWidth={2} />
                                    </Button>
                                </>
                            )}
                            {/* Labels para status terminais */}
                            {displayStatus === 'completed' && <div className="flex items-center gap-1 text-green-600 font-medium text-[11px]"><Check className="h-3.5 w-3.5" /> Concluído</div>}
                            {displayStatus === 'canceled' && <div className="flex items-center gap-1 text-red-600 font-medium text-[11px]"><X className="h-3.5 w-3.5" /> Cancelado</div>}
                            {displayStatus === 'no-show' && <div className="flex items-center gap-1 text-orange-600 font-medium text-[11px]"><UserX className="h-3.5 w-3.5" /> Não compareceu</div>}
                        </div>
                    </div>
                );
            })(), document.body)}
        </div>
    );
}
