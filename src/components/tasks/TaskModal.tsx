import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaff, useCurrentTeamMember } from "@/hooks/useStaff";
import { useUserRole } from "@/hooks/useUserRole";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { format, setHours, setMinutes, addMinutes } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TIMEZONE = "America/Sao_Paulo";

interface TaskModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    boardId?: string;
    taskId?: string | null;
    initialDate?: Date;
    initialStartTime?: string; // HH:mm
    initialDealId?: string;
    initialContactId?: string;
}

interface TaskFormValues {
    title: string;
    urgency: "low" | "medium" | "high";
    due_date: string; // YYYY-MM-DDTHH:mm
    description: string;
    start_time: string; // YYYY-MM-DDTHH:mm
    end_time: string; // YYYY-MM-DDTHH:mm
    type: "activity" | "schedule" | "absence" | "busy" | "reminder";
    recurrence: "daily" | "once";
    status: "pending" | "open" | "finished" | "completed";
    crm_deal_id?: string;
    contact_id?: string;
    board_id?: string;
    responsible_id: string; // NOVO - Obrigatório
}

export function TaskModal({ open, onOpenChange, boardId, taskId, initialDate, initialStartTime, initialDealId, initialContactId }: TaskModalProps) {
    const queryClient = useQueryClient();
    const [openDealCombo, setOpenDealCombo] = useState(false);
    const [openContactCombo, setOpenContactCombo] = useState(false);

    // Staff/Team hooks para o campo Responsável
    const { data: staffMembers } = useStaff();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const { data: userRole } = useUserRole();
    const isAgent = userRole === 'agent';

    // Local state for split date/time fields
    const [startDate, setStartDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [endDate, setEndDate] = useState("");
    const [endTime, setEndTime] = useState("");

    const { register, handleSubmit, reset, setValue, watch } = useForm<TaskFormValues>({
        defaultValues: {
            title: "",
            urgency: "medium",
            type: "activity",
            recurrence: "once",
            status: "pending",
            board_id: boardId || "",
            responsible_id: "",
        },
    });

    useEffect(() => {
        register("board_id", { required: !boardId });
    }, [register, boardId]);

    const selectedDealId = watch("crm_deal_id");
    const selectedContactId = watch("contact_id");
    const selectedBoardId = watch("board_id") || boardId;

    // Fetch available boards
    const { data: boards } = useQuery({
        queryKey: ["task_boards_select"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("task_boards")
                .select("id, name");
            if (error) throw error;
            return data;
        },
        enabled: open && !boardId,
    });

    // Fetch board configuration for time slots
    const { data: board } = useQuery({
        queryKey: ["task-board-config", selectedBoardId],
        queryFn: async () => {
            if (!selectedBoardId) return null;
            const { data, error } = await supabase
                .from("task_boards")
                .select("start_hour, end_hour, interval_minutes")
                .eq("id", selectedBoardId)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: open && !!selectedBoardId,
    });

    // Generate time slots
    const timeSlots = useMemo(() => {
        // Use defaults if board is not loaded yet or missing config
        const startHour = board?.start_hour ?? 8;
        const endHour = board?.end_hour ?? 18;
        const interval = board?.interval_minutes ?? 30;

        const slots = [];
        const now = new Date();
        const isToday = startDate === format(now, "yyyy-MM-dd");

        let current = setHours(setMinutes(new Date(), 0), startHour);
        const end = setHours(setMinutes(new Date(), 0), endHour);

        while (current < end) {
            if (isToday) {
                if (current > now) {
                    slots.push(format(current, "HH:mm"));
                }
            } else {
                slots.push(format(current, "HH:mm"));
            }
            current = addMinutes(current, interval);
        }
        return slots;
    }, [board, startDate]);

    // Fetch deals
    const { data: deals } = useQuery({
        queryKey: ["crm_deals_select"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_deals")
                .select("id, title, contact_id");
            if (error) throw error;
            return data;
        },
        enabled: open,
    });

    // Fetch contacts
    const { data: contacts } = useQuery({
        queryKey: ["contacts_select"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("contacts")
                .select("id, push_name, number");
            if (error) throw error;
            return data;
        },
        enabled: open,
    });

    // Fetch task details if editing
    const { data: task } = useQuery({
        queryKey: ["task", taskId],
        queryFn: async () => {
            if (!taskId) return null;
            const { data, error } = await supabase
                .from("tasks")
                .select("*")
                .eq("id", taskId)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!taskId && open,
    });

    useEffect(() => {
        if (task) {
            setValue("title", task.title);
            setValue("urgency", task.urgency);
            setValue("description", task.description || "");
            setValue("type", task.type);
            setValue("recurrence", task.recurrence);
            setValue("status", task.status);
            setValue("crm_deal_id", task.crm_deal_id || undefined);
            setValue("contact_id", task.contact_id || undefined);
            setValue("board_id", task.board_id);
            setValue("responsible_id", task.responsible_id || currentTeamMember?.id || "");

            if (task.due_date) setValue("due_date", format(toZonedTime(task.due_date, TIMEZONE), "yyyy-MM-dd'T'HH:mm"));

            // Set split fields
            if (task.start_time) {
                const start = toZonedTime(task.start_time, TIMEZONE);
                setStartDate(format(start, "yyyy-MM-dd"));
                setStartTime(format(start, "HH:mm"));
                setValue("start_time", task.start_time);
            }
            if (task.end_time) {
                const end = toZonedTime(task.end_time, TIMEZONE);
                setEndDate(format(end, "yyyy-MM-dd"));
                setEndTime(format(end, "HH:mm"));
                setValue("end_time", task.end_time);
            }

        } else {
            reset({
                title: "",
                urgency: "medium",
                type: "activity",
                recurrence: "once",
                status: "pending",
                description: "",
                crm_deal_id: initialDealId || undefined,
                contact_id: initialContactId || undefined,
                board_id: boardId || "",
                responsible_id: currentTeamMember?.id || "",
            });

            if (initialDate && initialStartTime) {
                const dateStr = format(initialDate, "yyyy-MM-dd");
                setStartDate(dateStr);
                setStartTime(initialStartTime);
                setEndDate(dateStr);

                // Calculate end time (default 30 mins or next slot)
                const [hours, mins] = initialStartTime.split(':').map(Number);
                const startObj = new Date(initialDate);
                startObj.setHours(hours, mins);
                const endObj = addMinutes(startObj, board?.interval_minutes || 30);
                setEndTime(format(endObj, "HH:mm"));

                setValue("start_time", `${dateStr}T${initialStartTime}`);
                setValue("end_time", format(endObj, "yyyy-MM-dd'T'HH:mm"));
                setValue("due_date", format(endObj, "yyyy-MM-dd'T'HH:mm"));
            } else {
                setStartDate("");
                setStartTime("");
                setEndDate("");
                setEndTime("");
            }
        }
    }, [task, open, reset, setValue, initialDate, initialStartTime, initialDealId, initialContactId, boardId]);

    // Auto-fill contact when deal is selected
    useEffect(() => {
        if (selectedDealId && deals) {
            const deal = deals.find(d => d.id === selectedDealId);
            if (deal && deal.contact_id) {
                setValue("contact_id", deal.contact_id);
            }
        }
    }, [selectedDealId, deals, setValue]);

    const mutation = useMutation({
        mutationFn: async (values: TaskFormValues) => {
            // Validações
            if (!currentTeamMember?.user_id) throw new Error("Usuário não autenticado ou sem team member");
            if (!currentTeamMember?.id) throw new Error("Team member ID não encontrado");

            const targetBoardId = values.board_id || boardId;
            if (!targetBoardId) throw new Error("Selecione um quadro de tarefas");

            // Combine date and time and convert to UTC based on Sao Paulo timezone
            const startDateTimeStr = `${startDate}T${startTime}:00`;
            const endDateTimeStr = `${endDate}T${endTime}:00`;

            const startDateTime = fromZonedTime(startDateTimeStr, TIMEZONE);
            const endDateTime = fromZonedTime(endDateTimeStr, TIMEZONE);

            const payload = {
                ...values,
                start_time: startDateTime.toISOString(),
                end_time: endDateTime.toISOString(),
                board_id: targetBoardId,
                user_id: currentTeamMember.user_id, // user_id do admin (vem de team_members.user_id)
                crm_deal_id: values.crm_deal_id || null,
                contact_id: values.contact_id || null,
                responsible_id: values.responsible_id || currentTeamMember.id, // id do team_member responsável
            };

            if (taskId) {
                const { error } = await supabase
                    .from("tasks")
                    .update(payload)
                    .eq("id", taskId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("tasks")
                    .insert(payload);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            toast.success(taskId ? "Tarefa atualizada!" : "Tarefa criada!");
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error("Erro ao salvar tarefa: " + error.message);
        },
    });

    const onSubmit = (data: TaskFormValues) => {
        mutation.mutate(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{taskId ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto flex-1 px-3 scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                    {!boardId && (
                        <div className="space-y-2">
                            <Label htmlFor="board_id">Quadro de Tarefas</Label>
                            <Select
                                onValueChange={(val: string) => setValue("board_id", val, { shouldValidate: true })}
                                value={watch("board_id")}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um quadro" />
                                </SelectTrigger>
                                <SelectContent>
                                    {boards?.map((board) => (
                                        <SelectItem key={board.id} value={board.id}>
                                            {board.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Campo Responsável - Obrigatório */}
                    <div className="space-y-2">
                        <Label htmlFor="responsible_id">Responsável *</Label>
                        <Select
                            onValueChange={(val: string) => setValue("responsible_id", val, { shouldValidate: true })}
                            value={watch("responsible_id")}
                            disabled={isAgent} // Agentes não podem alterar, apenas ver ele mesmo
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o responsável" />
                            </SelectTrigger>
                            <SelectContent>
                                {isAgent
                                    ? currentTeamMember && (
                                        <SelectItem key={currentTeamMember.id} value={currentTeamMember.id}>
                                            {currentTeamMember.name}
                                        </SelectItem>
                                    )
                                    : staffMembers?.map((member) => (
                                        <SelectItem key={member.id} value={member.id}>
                                            {member.name}
                                        </SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="title">Título</Label>
                        <Input id="title" {...register("title", { required: true })} placeholder="Nome da tarefa" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="type">Tipo</Label>
                            <Select onValueChange={(val: any) => setValue("type", val)} defaultValue={watch("type")}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="activity">Atividade (Verde)</SelectItem>
                                    <SelectItem value="schedule">Agendamento (Azul)</SelectItem>
                                    <SelectItem value="absence">Ausência (Amarelo)</SelectItem>
                                    <SelectItem value="busy">Ocupado (Laranja)</SelectItem>
                                    <SelectItem value="reminder">Lembrete (Roxo)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="urgency">Urgência</Label>
                            <Select onValueChange={(val: any) => setValue("urgency", val)} defaultValue={watch("urgency")}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a urgência" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Baixa</SelectItem>
                                    <SelectItem value="medium">Média</SelectItem>
                                    <SelectItem value="high">Alta</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Vincular Negociação</Label>
                            <Popover open={openDealCombo} onOpenChange={setOpenDealCombo}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={openDealCombo}
                                        className="w-full justify-between px-3"
                                    >
                                        <span className="truncate">
                                            {selectedDealId
                                                ? deals?.find((deal) => deal.id === selectedDealId)?.title
                                                : "Selecione uma negociação..."}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0">
                                    <Command>
                                        <CommandInput placeholder="Buscar negociação..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhuma negociação encontrada.</CommandEmpty>
                                            <CommandGroup>
                                                {deals?.map((deal) => (
                                                    <CommandItem
                                                        key={deal.id}
                                                        value={deal.title}
                                                        onSelect={() => {
                                                            setValue("crm_deal_id", deal.id === selectedDealId ? undefined : deal.id);
                                                            setOpenDealCombo(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                selectedDealId === deal.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {deal.title}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label>Vincular Contato</Label>
                            <Popover open={openContactCombo} onOpenChange={setOpenContactCombo}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={openContactCombo}
                                        className="w-full justify-between px-3"
                                        disabled={!!selectedDealId}
                                    >
                                        <span className="truncate">
                                            {selectedContactId
                                                ? contacts?.find((contact) => contact.id === selectedContactId)?.push_name || "Contato"
                                                : "Selecione um contato..."}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0">
                                    <Command>
                                        <CommandInput placeholder="Buscar contato..." />
                                        <CommandList>
                                            <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                                            <CommandGroup>
                                                {contacts?.map((contact) => (
                                                    <CommandItem
                                                        key={contact.id}
                                                        value={contact.push_name}
                                                        onSelect={() => {
                                                            setValue("contact_id", contact.id === selectedContactId ? undefined : contact.id);
                                                            setOpenContactCombo(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                selectedContactId === contact.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {contact.push_name}
                                                        <span className="ml-2 text-xs text-muted-foreground">{contact.number}</span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Início</Label>
                            <div className="flex gap-2">
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    required
                                    min={format(new Date(), "yyyy-MM-dd")}
                                />
                                <Select value={startTime} onValueChange={setStartTime}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Horário" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {timeSlots.map((time) => (
                                            <SelectItem key={time} value={time}>
                                                {time}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Fim</Label>
                            <div className="flex gap-2">
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    required
                                    min={format(new Date(), "yyyy-MM-dd")}
                                />
                                <Select value={endTime} onValueChange={setEndTime}>
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Horário" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {timeSlots.map((time) => (
                                            <SelectItem key={time} value={time}>
                                                {time}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="due_date">Vencimento</Label>
                        <Input id="due_date" type="datetime-local" {...register("due_date")} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea id="description" {...register("description")} placeholder="Detalhes da tarefa..." />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="recurrence">Recorrência</Label>
                            <Select onValueChange={(val: any) => setValue("recurrence", val)} defaultValue={watch("recurrence")}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="once">Única</SelectItem>
                                    <SelectItem value="daily">Diária</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Salvando..." : "Salvar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
