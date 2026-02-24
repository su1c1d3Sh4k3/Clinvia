import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Pencil, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, setHours, setMinutes, differenceInMinutes, startOfDay, addMinutes } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { TaskModal } from "./TaskModal";
import { TaskDetailsModal } from "./TaskDetailsModal";
import { ViewDealModal } from "@/components/crm/ViewDealModal";
import { ContactModal } from "@/components/ContactModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember, useStaff } from "@/hooks/useStaff";

const TIMEZONE = "America/Sao_Paulo";

interface TaskBoardProps {
    boardId: string;
}

export function TaskBoard({ boardId }: TaskBoardProps) {
    const queryClient = useQueryClient();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<"day" | "week">("week");
    const [selectedTask, setSelectedTask] = useState<string | null>(null);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isTaskDetailsModalOpen, setIsTaskDetailsModalOpen] = useState(false);
    const [newTaskDefaults, setNewTaskDefaults] = useState<{ date: Date, startTime: string } | undefined>(undefined);

    // Modal states for linked info
    const [selectedDeal, setSelectedDeal] = useState<any>(null);
    const [isDealModalOpen, setIsDealModalOpen] = useState(false);
    const [selectedContact, setSelectedContact] = useState<any>(null);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);

    // Hooks para filtro por responsável (agentes veem apenas suas tasks)
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const { data: staffMembers } = useStaff();
    const isAgent = userRole === 'agent';

    // Helper to convert UTC string to Zoned Date (for display)
    const toZoned = (dateStr: string) => {
        return toZonedTime(dateStr, TIMEZONE);
    };

    // Helper to convert Zoned Date to UTC (for saving)
    const toUTC = (date: Date) => {
        return fromZonedTime(date, TIMEZONE);
    };

    // Fetch board configuration
    const { data: board } = useQuery({
        queryKey: ["task-board", boardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("task_boards")
                .select("*")
                .eq("id", boardId)
                .single();
            if (error) throw error;
            return data;
        },
    });

    // Update task statuses on mount
    useEffect(() => {
        const updateStatuses = async () => {
            await supabase.rpc('update_all_task_statuses');
            queryClient.invalidateQueries({ queryKey: ["tasks", boardId] });
        };
        updateStatuses();
    }, [boardId, queryClient]);

    // Fetch tasks
    const { data: tasks } = useQuery({
        queryKey: ["tasks", boardId],
        queryFn: async () => {
            // Simplified query to ensure stability while fetching necessary data
            const { data, error } = await supabase
                .from("tasks")
                .select(`
                    *,
                    crm_deals (
                        id,
                        title,
                        value,
                        priority,
                        created_at,
                        description,
                        contact_id,
                        contacts (
                            id,
                            push_name,
                            profile_pic_url,
                            number
                        )
                    ),
                    contacts (
                        id,
                        push_name,
                        profile_pic_url
                    )
                `)
                .eq("board_id", boardId);

            if (error) {
                console.error("Error fetching tasks:", error);
                throw error;
            }
            return data;
        },
    });

    // Filtro: agentes veem apenas suas próprias tasks
    const filteredTasks = useMemo(() => {
        if (!tasks) return [];
        if (isAgent && currentTeamMember?.id) {
            return tasks.filter((t: any) => t.responsible_id === currentTeamMember.id);
        }
        return tasks;
    }, [tasks, isAgent, currentTeamMember]);

    const updateTaskMutation = useMutation({
        mutationFn: async ({ id, ...updates }: { id: string, start_time?: string, end_time?: string }) => {
            const { error } = await supabase
                .from("tasks")
                .update(updates)
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks", boardId] });
            toast.success("Tarefa atualizada!");
        },
        onError: (error) => {
            toast.error("Erro ao atualizar tarefa: " + error.message);
        },
    });

    const days = useMemo(() => {
        if (viewMode === "day") return [currentDate];
        const start = startOfWeek(currentDate, { weekStartsOn: 0 });
        const end = endOfWeek(currentDate, { weekStartsOn: 0 });
        return eachDayOfInterval({ start, end });
    }, [currentDate, viewMode]);

    const timeSlots = useMemo(() => {
        if (!board) return [];

        let startHour = board.start_hour;
        let endHour = board.end_hour;

        // Adjust range to include all tasks
        if (tasks) {
            tasks.forEach((task: any) => {
                const taskStart = toZoned(task.start_time).getHours();
                const taskEnd = toZoned(task.end_time).getHours() + (toZoned(task.end_time).getMinutes() > 0 ? 1 : 0);

                if (taskStart < startHour) startHour = taskStart;
                if (taskEnd > endHour) endHour = taskEnd;
            });
        }

        const slots = [];
        let current = setHours(setMinutes(new Date(), 0), startHour);
        const end = setHours(setMinutes(new Date(), 0), endHour);

        while (current < end) {
            slots.push(format(current, "HH:mm"));
            current = addMinutes(current, board.interval_minutes);
        }
        return { slots, startHour, endHour };
    }, [board, tasks]);

    // Helper to get effective start hour for positioning
    const effectiveStartHour = timeSlots.startHour;
    const slots = timeSlots.slots;

    const handlePrev = () => setCurrentDate(prev => addDays(prev, viewMode === "week" ? -7 : -1));
    const handleNext = () => setCurrentDate(prev => addDays(prev, viewMode === "week" ? 7 : 1));
    const handleToday = () => setCurrentDate(new Date());

    const handleSlotClick = (date: Date, time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        const slotDate = new Date(date);
        slotDate.setHours(hours, minutes, 0, 0);

        if (slotDate < new Date()) {
            toast.error("Não é possível criar tarefas em horários passados.");
            return;
        }

        setNewTaskDefaults({ date, startTime: time });
        setSelectedTask(null);
        setIsTaskModalOpen(true);
    };

    const handleTaskClick = (e: React.MouseEvent, taskId: string) => {
        e.stopPropagation();
        setSelectedTask(taskId);
        setNewTaskDefaults(undefined);
        setIsTaskDetailsModalOpen(true);
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, taskId: string, durationMinutes: number, isPast: boolean) => {
        if (isPast) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData("taskId", taskId);
        e.dataTransfer.setData("duration", durationMinutes.toString());
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetDate: Date, targetTime: string) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData("taskId");
        const durationStr = e.dataTransfer.getData("duration");

        if (!taskId || !durationStr) return;

        const durationMinutes = parseInt(durationStr);
        const [hours, minutes] = targetTime.split(':').map(Number);

        // Construct local date time
        const newStartTimeLocal = new Date(targetDate);
        newStartTimeLocal.setHours(hours, minutes, 0, 0);

        if (newStartTimeLocal < new Date()) {
            toast.error("Não é possível mover tarefas para o passado.");
            return;
        }

        const newEndTimeLocal = addMinutes(newStartTimeLocal, durationMinutes);

        // Convert to UTC for saving
        const newStartTimeUTC = toUTC(newStartTimeLocal);
        const newEndTimeUTC = toUTC(newEndTimeLocal);

        updateTaskMutation.mutate({
            id: taskId,
            start_time: newStartTimeUTC.toISOString(),
            end_time: newEndTimeUTC.toISOString()
        });
    };

    // Resize Logic
    const [isResizing, setIsResizing] = useState(false);
    const [resizeTask, setResizeTask] = useState<{ id: string, start: Date, end: Date, startY: number, direction: 'top' | 'bottom' } | null>(null);
    const ignoreClickRef = useRef(false);

    const handleResizeStart = (e: React.MouseEvent, task: any, direction: 'top' | 'bottom', isPast: boolean) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent text selection

        if (isPast) return;

        setIsResizing(true);
        setResizeTask({
            id: task.id,
            start: toZoned(task.start_time),
            end: toZoned(task.end_time),
            startY: e.clientY,
            direction
        });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || !resizeTask || !board) return;
            // Visual feedback could be added here
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (isResizing && resizeTask && board) {
                // Set ignore click flag
                ignoreClickRef.current = true;
                setTimeout(() => {
                    ignoreClickRef.current = false;
                }, 200);

                const deltaY = e.clientY - resizeTask.startY;
                const minutesPerPixel = board.interval_minutes / 60;
                const deltaMinutes = deltaY * minutesPerPixel;

                // Symmetric rounding to avoid bias at 0.5
                const snappedDeltaMinutes = Math.round(deltaMinutes / board.interval_minutes) * board.interval_minutes;

                if (snappedDeltaMinutes !== 0) {
                    if (resizeTask.direction === 'bottom') {
                        const newEndTimeLocal = addMinutes(resizeTask.end, snappedDeltaMinutes);
                        // Min duration check: at least 1 interval
                        const minEndTimeLocal = addMinutes(resizeTask.start, board.interval_minutes);

                        if (newEndTimeLocal >= minEndTimeLocal) {
                            updateTaskMutation.mutate({
                                id: resizeTask.id,
                                end_time: toUTC(newEndTimeLocal).toISOString()
                            });
                        }
                    } else {
                        // Top Resize
                        const newStartTimeLocal = addMinutes(resizeTask.start, snappedDeltaMinutes);
                        // Min duration check: at least 1 interval
                        const maxStartTimeLocal = addMinutes(resizeTask.end, -board.interval_minutes);

                        if (newStartTimeLocal <= maxStartTimeLocal) {
                            if (newStartTimeLocal < new Date()) {
                                toast.error("Não é possível redimensionar para o passado.");
                            } else {
                                updateTaskMutation.mutate({
                                    id: resizeTask.id,
                                    start_time: toUTC(newStartTimeLocal).toISOString()
                                });
                            }
                        }
                    }
                }

                setIsResizing(false);
                setResizeTask(null);
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, resizeTask, board, updateTaskMutation]);


    const getTaskStyle = (task: any) => {
        if (!board) return {};
        const start = toZoned(task.start_time);
        const end = toZoned(task.end_time);
        const isPast = end < new Date();

        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes = end.getHours() * 60 + end.getMinutes();
        const boardStartMinutes = effectiveStartHour * 60;

        const top = ((startMinutes - boardStartMinutes) / board.interval_minutes) * 60; // 60px height per slot
        const height = ((endMinutes - startMinutes) / board.interval_minutes) * 60;

        const colors: Record<string, string> = {
            activity: "bg-green-100 border-green-300 text-green-900",
            schedule: "bg-blue-100 border-blue-300 text-blue-900",
            absence: "bg-yellow-100 border-yellow-300 text-yellow-900",
            busy: "bg-orange-100 border-orange-300 text-orange-900",
            reminder: "bg-purple-100 border-purple-300 text-purple-900",
        };

        const statusBorders: Record<string, string> = {
            finished: "!border-[#EF4444] border-2",
            open: "!border-[#4485EE] border-2",
            completed: "!border-[#22C55E] border-2",
            pending: "",
        };

        return {
            top: `${top}px`,
            height: `${height}px`,
            className: cn(
                "absolute left-1 right-1 rounded-md p-2 text-xs border shadow-sm overflow-hidden cursor-pointer hover:brightness-95 transition-all z-10 select-none group flex flex-col gap-1",
                isPast ? "bg-gray-100 text-gray-500 grayscale opacity-80" : (colors[task.type] || "bg-gray-100 border-gray-300"),
                statusBorders[task.status]
            )
        };
    };

    const renderTaskContent = (task: any, height: number) => {
        const showDescription = height >= 80;
        const showLinkedInfo = height >= 120;

        const priorityColors: Record<string, string> = {
            low: "bg-[#22C55E] hover:bg-[#22C55E]/90 text-white",
            medium: "bg-[#272C35] hover:bg-[#272C35]/90 text-white",
            high: "bg-[#EF4444] hover:bg-[#EF4444]/90 text-white",
        };

        const StatusIcon = () => {
            if (task.status === 'finished') return <AlertCircle className="w-3 h-3 text-[#EF4444] mr-1 shrink-0" />;
            if (task.status === 'open') return <Clock className="w-3 h-3 text-[#4485EE] mr-1 shrink-0" />;
            if (task.status === 'completed') return <CheckCircle2 className="w-3 h-3 text-[#22C55E] mr-1 shrink-0" />;
            return null;
        };

        return (
            <>
                {/* Priority 1: Title and Date */}
                <div className="flex items-center font-bold text-base leading-tight truncate">
                    <StatusIcon />
                    <span className="truncate">{task.title}</span>
                </div>
                <div className="text-[10px] opacity-70 truncate">
                    {format(toZoned(task.created_at), "dd/MM HH:mm")}
                    {task.responsible_id && staffMembers && (
                        <span className="ml-2">
                            • {staffMembers.find((s: any) => s.id === task.responsible_id)?.name || ""}
                        </span>
                    )}
                </div>

                {/* Priority 2: Description */}
                {showDescription && task.description && (
                    <div className="text-xs opacity-80 line-clamp-2 mt-1 text-foreground">
                        {task.description}
                    </div>
                )}

                {/* Priority 3: Linked Info */}
                {showLinkedInfo && (
                    <div className="mt-auto pt-1 flex flex-col gap-1">
                        {task.crm_deals && (
                            <div
                                className={cn(
                                    "flex items-center gap-1 p-1 rounded-md cursor-pointer transition-colors",
                                    task.crm_deals.priority ? priorityColors[task.crm_deals.priority] : "bg-white/50 hover:bg-white/80"
                                )}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDeal(task.crm_deals);
                                    setIsDealModalOpen(true);
                                }}
                            >
                                <span className="font-semibold truncate flex-1">{task.crm_deals.title}</span>
                                {task.crm_deals.contacts && (
                                    <div className="flex items-center gap-1">
                                        {task.crm_deals.contacts.profile_pic_url && (
                                            <img src={task.crm_deals.contacts.profile_pic_url} className="w-4 h-4 rounded-full object-cover" />
                                        )}
                                        <span className="truncate max-w-[60px]">{task.crm_deals.contacts.push_name.split(' ')[0]}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {!task.crm_deals && task.contacts && (
                            <div
                                className="flex items-center gap-1 bg-white/50 p-1 rounded cursor-pointer hover:bg-white/80 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedContact(task.contacts);
                                    setIsContactModalOpen(true);
                                }}
                            >
                                {task.contacts.profile_pic_url && (
                                    <img src={task.contacts.profile_pic_url} className="w-4 h-4 rounded-full object-cover" />
                                )}
                                <span className="font-semibold truncate">{task.contacts.push_name}</span>
                            </div>
                        )}
                    </div>
                )}
            </>
        );
    };

    if (!board) return <div className="p-4">Carregando quadro...</div>;

    return (
        <div className="h-full flex flex-col select-none">
            <div className="flex items-center justify-between p-4 border-b bg-card">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={handlePrev}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={handleToday}>Hoje</Button>
                    <Button variant="outline" size="icon" onClick={handleNext}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="font-medium capitalize ml-2">
                        {viewMode === "week"
                            ? `${format(days[0], "dd/MM", { locale: ptBR })} a ${format(days[6], "dd/MM", { locale: ptBR })}`
                            : format(currentDate, "dd 'de' MMMM", { locale: ptBR })
                        }
                    </span>
                </div>
                <div className="flex bg-muted text-primary-foreground rounded-lg p-1">
                    <button
                        className={cn("px-3 py-1 rounded-md text-sm font-medium transition-all", viewMode === "day" && "bg-background text-foreground shadow-sm")}
                        onClick={() => setViewMode("day")}
                    >
                        Dia
                    </button>
                    <button
                        className={cn("px-3 py-1 rounded-md text-sm font-medium transition-all", viewMode === "week" && "bg-background text-foreground shadow-sm")}
                        onClick={() => setViewMode("week")}
                    >
                        Semana
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-background scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent hover:scrollbar-thumb-primary/40 transition-colors">
                <div className="flex min-w-[800px]">
                    {/* Time Column */}
                    <div className="w-16 flex-shrink-0 border-r bg-muted/30 sticky left-0 z-20">
                        <div className="h-10 border-b bg-muted/50" /> {/* Header spacer */}
                        {slots.map((time) => (
                            <div key={time} className="h-[60px] border-b flex items-start justify-center pt-2 text-xs text-muted-foreground">
                                {time}
                            </div>
                        ))}
                    </div>

                    {/* Days Columns */}
                    {days.map((day) => (
                        <div key={day.toISOString()} className="flex-1 min-w-[120px] border-r relative group/day">
                            {/* Header */}
                            <div className={cn(
                                "h-10 border-b flex flex-col items-center justify-center sticky top-0 bg-background z-20",
                                isSameDay(day, new Date()) && "bg-primary text-primary-foreground"
                            )}>
                                <span className="text-xs text-muted-foreground capitalize">{format(day, "EEEE", { locale: ptBR })}</span>
                                <span className={cn(
                                    "text-sm font-bold h-6 w-6 flex items-center justify-center rounded-full",
                                    isSameDay(day, new Date()) && "bg-primary dark:bg-primary text-primary-foreground"
                                )}>
                                    {format(day, "d")}
                                </span>
                            </div>

                            {/* Grid Slots */}
                            <div className="relative">
                                {slots.map((time) => {
                                    const [hours, minutes] = time.split(':').map(Number);
                                    const slotDate = new Date(day);
                                    slotDate.setHours(hours, minutes, 0, 0);
                                    const isPast = slotDate < new Date();

                                    return (
                                        <div
                                            key={`${day.toISOString()}-${time}`}
                                            className={cn(
                                                "h-[60px] border-b border-dashed border-[#b7b5b5] dark:border-border transition-colors",
                                                isPast ? "bg-gray-100/50 cursor-not-allowed" : "hover:bg-muted/30 cursor-pointer"
                                            )}
                                            onClick={() => handleSlotClick(day, time)}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, day, time)}
                                        />
                                    );
                                })}

                                {/* Tasks Layer */}
                                {filteredTasks?.filter((task: any) => isSameDay(toZoned(task.start_time), day)).map((task: any) => {
                                    const style = getTaskStyle(task);
                                    const duration = differenceInMinutes(toZoned(task.end_time), toZoned(task.start_time));
                                    const height = parseFloat(style.height);
                                    const isPast = toZoned(task.end_time) < new Date();

                                    return (
                                        <div
                                            key={task.id}
                                            style={{ top: style.top, height: style.height }}
                                            className={style.className}
                                            onClick={(e) => {
                                                if (ignoreClickRef.current) return;
                                                handleTaskClick(e, task.id);
                                            }}
                                            draggable={!isPast}
                                            onDragStart={(e) => handleDragStart(e, task.id, duration, isPast)}
                                        >
                                            {/* Top Resize Handle */}
                                            {!isPast && (
                                                <div
                                                    className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                                    onMouseDown={(e) => handleResizeStart(e, task, 'top', isPast)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            )}

                                            {!isPast && (
                                                <div
                                                    className="absolute top-1 right-1 z-30 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5 hover:bg-black/5 rounded-sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedTask(task.id);
                                                        setNewTaskDefaults(undefined);
                                                        setIsTaskModalOpen(true);
                                                    }}
                                                >
                                                    <Pencil className="w-3 h-3 text-foreground" />
                                                </div>
                                            )}

                                            {renderTaskContent(task, height)}

                                            {/* Bottom Resize Handle */}
                                            {!isPast && (
                                                <div
                                                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                                    onMouseDown={(e) => handleResizeStart(e, task, 'bottom', isPast)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <TaskModal
                open={isTaskModalOpen}
                onOpenChange={setIsTaskModalOpen}
                boardId={boardId}
                taskId={selectedTask}
                initialDate={newTaskDefaults?.date}
                initialStartTime={newTaskDefaults?.startTime}
            />

            <TaskDetailsModal
                taskId={selectedTask}
                open={isTaskDetailsModalOpen}
                onOpenChange={setIsTaskDetailsModalOpen}
                onEdit={(id) => {
                    setIsTaskDetailsModalOpen(false);
                    setIsTaskModalOpen(true);
                }}
            />

            {selectedDeal && (
                <ViewDealModal
                    deal={selectedDeal}
                    open={isDealModalOpen}
                    onOpenChange={setIsDealModalOpen}
                />
            )}

            {selectedContact && (
                <ContactModal
                    contactToEdit={selectedContact}
                    open={isContactModalOpen}
                    onOpenChange={setIsContactModalOpen}
                />
            )}
        </div>
    );
}
