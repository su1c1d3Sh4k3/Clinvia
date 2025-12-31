import { useMemo, useRef, useEffect } from "react";
import { format, addMinutes, startOfDay, differenceInMinutes, parseISO, isSameDay } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ThumbsUp, Clock, X, Check, Pen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SchedulingCalendarProps {
    date: Date;
    professionals: any[];
    appointments: any[];
    settings?: any;
    onSlotClick: (professionalId: string, time: Date) => void;
    onEventClick: (event: any) => void;
    onStatusChange: (appointmentId: string, newStatus: string, event?: any) => void;
    onEditProfessional?: (professional: any) => void;
}

const START_HOUR = 8;
const END_HOUR = 22;
const HOUR_HEIGHT = 60;

export function SchedulingCalendar({ date, professionals, appointments, settings, onSlotClick, onEventClick, onStatusChange, onEditProfessional }: SchedulingCalendarProps) {
    const startHour = settings?.start_hour ?? 8;
    const endHour = settings?.end_hour ?? 22;
    const workDays = settings?.work_days ?? [0, 1, 2, 3, 4, 5, 6];
    const isDayBlocked = !workDays.includes(date.getDay());

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
        if (isSyncing.current) return;
        isSyncing.current = true;
        if (headerRef.current && bodyRef.current) {
            headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
        }
        requestAnimationFrame(() => { isSyncing.current = false; });
    };

    const timeSlots = useMemo(() => {
        const slots = [];
        for (let i = startHour; i <= endHour; i++) {
            slots.push(i);
        }
        return slots;
    }, [startHour, endHour]);

    const getEventStyle = (event: any) => {
        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes = end.getHours() * 60 + end.getMinutes();
        const duration = endMinutes - startMinutes;

        // Offset from startHour
        const top = (startMinutes - startHour * 60);

        return {
            top: `${top}px`,
            height: `${duration}px`,
        };
    };

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
            case 'pending':
            default:
                return "bg-blue-100 border-blue-200 text-blue-700 hover:bg-blue-200";
        }
    };

    return (
        <div className="flex flex-col h-full border rounded-lg overflow-hidden bg-background">
            {/* Header - Synced horizontal scroll on mobile */}
            <div
                ref={headerRef}
                className="flex border-b overflow-x-auto [&::-webkit-scrollbar]:hidden"
                onScroll={handleHeaderScroll}
            >
                <div className="w-12 md:w-16 shrink-0 border-r bg-muted/50" /> {/* Time column header */}
                {professionals.map((professional) => (
                    <div key={professional.id} className="flex-1 p-2 md:p-4 flex flex-row items-center justify-center gap-2 md:gap-3 border-r last:border-r-0 bg-muted/20 min-w-[120px] md:min-w-[150px] relative group/header">
                        <Avatar className="w-8 h-8 md:w-12 md:h-12">
                            <AvatarImage src={professional.photo_url} />
                            <AvatarFallback className="text-xs md:text-base">{professional.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col items-start">
                            <span className="font-medium text-xs md:text-sm truncate max-w-[60px] md:max-w-none">{professional.name}</span>
                            <span className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">{professional.role}</span>
                            {professional.commission > 0 && (
                                <span className="text-[10px] md:text-xs text-orange-500 font-medium hidden md:block">
                                    {professional.commission}% comissão
                                </span>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover/header:opacity-100 transition-opacity"
                            onClick={() => onEditProfessional && onEditProfessional(professional)}
                        >
                            <Pen className="h-3 w-3" />
                        </Button>
                    </div>
                ))}
            </div>

            {/* Body - Synced horizontal scroll on mobile */}
            <div
                ref={bodyRef}
                className="flex-1 overflow-x-auto overflow-y-auto relative scrollbar-none"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                onScroll={handleBodyScroll}
            >
                <div className="flex min-h-[660px]" style={{ height: (endHour - startHour + 1) * HOUR_HEIGHT }}>
                    {/* Time Labels */}
                    <div className="w-12 md:w-16 shrink-0 border-r bg-muted/10 flex flex-col relative">
                        {timeSlots.map((hour) => (
                            <div key={hour} className="absolute w-full text-right pr-1 md:pr-2 text-[10px] md:text-xs text-muted-foreground border-t" style={{ top: (hour - startHour) * 60, height: 60 }}>
                                {hour}:00
                            </div>
                        ))}
                    </div>

                    {/* Columns */}
                    {professionals.map((professional) => (
                        <div key={professional.id} className="flex-1 border-r last:border-r-0 relative min-w-[120px] md:min-w-[150px] group">
                            {/* Grid Lines */}
                            {timeSlots.map((hour) => {
                                const slotDate = new Date(date);
                                slotDate.setHours(hour, 0, 0, 0);


                                // Parse professional settings
                                const workDays = professional.work_days || settings?.work_days || [0, 1, 2, 3, 4, 5, 6];
                                const workHours = professional.work_hours || { start: "08:00", end: "22:00", break_start: null, break_end: null };

                                const startH = parseInt(workHours.start?.split(':')[0] || "8");
                                const endH = parseInt(workHours.end?.split(':')[0] || "22");
                                const breakStartH = workHours.break_start ? parseInt(workHours.break_start.split(':')[0]) : -1;
                                const breakEndH = workHours.break_end ? parseInt(workHours.break_end.split(':')[0]) : -1;

                                const isDayOff = !workDays.includes(date.getDay());
                                const isBeforeStart = hour < startH;
                                const isAfterEnd = hour >= endH;
                                const isBreak = hour >= breakStartH && hour < breakEndH;

                                const isBlocked = isDayOff || isBeforeStart || isAfterEnd || isBreak;
                                const isPast = slotDate < new Date();

                                return (
                                    <div
                                        key={hour}
                                        className={cn(
                                            "absolute w-full border-t border-dashed border-muted/50 transition-colors",
                                            !isPast && !isBlocked && "bg-white dark:bg-transparent hover:bg-accent/50 dark:hover:bg-[#353A44] cursor-pointer",
                                            isBlocked && "bg-muted/30 dark:bg-muted/30",
                                            isPast && "bg-[#C6C8CA] dark:bg-[#22262E]"
                                        )}
                                        style={{
                                            top: (hour - startHour) * 60,
                                            height: 60,
                                            backgroundColor: isBlocked && !isPast ? "rgba(0,0,0,0.2)" : undefined,
                                            backgroundImage: isBlocked && !isPast ? "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px)" : undefined
                                        }}
                                        onClick={() => {
                                            if (!isPast && !isBlocked) {
                                                onSlotClick(professional.id, slotDate);
                                            }
                                        }}
                                    >
                                        {isBreak && !isPast && (
                                            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground font-medium opacity-50 select-none">
                                                Intervalo
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Events */}
                            {appointments
                                .filter((apt) => apt.professional_id === professional.id && isSameDay(new Date(apt.start_time), date))
                                .map((apt) => {
                                    const isFinalStatus = apt.status === 'completed' || apt.status === 'canceled';

                                    return (
                                        <div
                                            key={apt.id}
                                            className={cn(
                                                "absolute left-1 right-1 rounded-md px-1.5 py-0.5 cursor-pointer border shadow-sm transition-all z-10 group/card",
                                                apt.type === "absence" ? "bg-muted text-muted-foreground border-border" : getStatusColor(apt.status || 'pending')
                                            )}
                                            style={getEventStyle(apt)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventClick(apt);
                                            }}
                                        >
                                            {/* Actions Overlay - Floating Above */}
                                            {apt.type !== "absence" && (
                                                <div className="absolute -top-9 right-0 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-all duration-200 bg-background/95 backdrop-blur-sm border shadow-sm rounded-full p-1 z-50">
                                                    {!isFinalStatus && (
                                                        <>
                                                            <div className="relative group/btn">
                                                                <Button
                                                                    variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-purple-100 hover:text-purple-600 transition-colors"
                                                                    onClick={(e) => { e.stopPropagation(); onStatusChange(apt.id, 'confirmed'); }}
                                                                >
                                                                    <ThumbsUp className="h-3.5 w-3.5" strokeWidth={2} />
                                                                </Button>
                                                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                                                    Confirmar
                                                                </span>
                                                            </div>

                                                            <div className="relative group/btn">
                                                                <Button
                                                                    variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-yellow-100 hover:text-yellow-600 transition-colors"
                                                                    onClick={(e) => { e.stopPropagation(); onStatusChange(apt.id, 'rescheduled', apt); }}
                                                                >
                                                                    <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                                                                </Button>
                                                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                                                    Reagendar
                                                                </span>
                                                            </div>

                                                            <div className="relative group/btn">
                                                                <Button
                                                                    variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
                                                                    onClick={(e) => { e.stopPropagation(); onStatusChange(apt.id, 'canceled'); }}
                                                                >
                                                                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                                                                </Button>
                                                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                                                    Cancelar
                                                                </span>
                                                            </div>

                                                            <div className="relative group/btn">
                                                                <Button
                                                                    variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-green-100 hover:text-green-600 transition-colors"
                                                                    onClick={(e) => { e.stopPropagation(); onStatusChange(apt.id, 'completed', apt); }}
                                                                >
                                                                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                                                                </Button>
                                                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                                                    Concluir
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                    {apt.status === 'completed' && <div className="px-2 py-1 flex items-center gap-1 text-green-600 font-medium text-[10px]"><Check className="h-3 w-3" /> Concluído</div>}
                                                    {apt.status === 'canceled' && <div className="px-2 py-1 flex items-center gap-1 text-red-600 font-medium text-[10px]"><X className="h-3 w-3" /> Cancelado</div>}
                                                </div>
                                            )}

                                            {(() => {
                                                const start = new Date(apt.start_time);
                                                const end = new Date(apt.end_time);
                                                const durationInMinutes = differenceInMinutes(end, start);
                                                const isCompact = durationInMinutes < 40;

                                                // Adaptive font size: min 8px (10min), max 12px (60min+)
                                                const fontSize = Math.max(8, Math.min(12, Math.floor(durationInMinutes / 5) + 4));

                                                // Extract first name only
                                                const fullName = apt.type === "absence" ? "Ausência" : (apt.contacts?.push_name || apt.contact_name || "Cliente");
                                                const firstName = fullName.split(' ')[0];
                                                const serviceName = apt.products_services?.name || "Serviço";

                                                return (
                                                    <div
                                                        className="overflow-hidden h-full flex flex-col justify-center"
                                                        style={{ fontSize: `${fontSize}px`, lineHeight: 1.2 }}
                                                    >
                                                        {isCompact ? (
                                                            // Compact mode (< 40 min): single line
                                                            <div className="flex items-center gap-1 truncate">
                                                                <span className="font-bold shrink-0">{firstName}</span>
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
                                                            </div>
                                                        ) : (
                                                            // Normal mode (>= 40 min): two lines
                                                            <div className="flex flex-col justify-center h-full">
                                                                <div className="font-bold truncate">
                                                                    {firstName} {apt.type === "appointment" && `| ${serviceName}`}
                                                                </div>
                                                                <div className="opacity-70">
                                                                    {format(start, "HH:mm")} - {format(end, "HH:mm")}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )
                                })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
