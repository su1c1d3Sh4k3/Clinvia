import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Pencil, Calendar, Clock, AlertCircle, Tag, Link as LinkIcon, User, AlignLeft, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const TIMEZONE = "America/Sao_Paulo";

interface TaskDetailsModalProps {
    taskId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEdit: (taskId: string) => void;
}

export function TaskDetailsModal({ taskId, open, onOpenChange, onEdit }: TaskDetailsModalProps) {
    const queryClient = useQueryClient();

    const { data: task, isLoading } = useQuery({
        queryKey: ["task-details", taskId],
        queryFn: async () => {
            if (!taskId) return null;
            const { data, error } = await supabase
                .from("tasks")
                .select(`
                    *,
                    crm_deals (
                        id,
                        title
                    ),
                    contacts (
                        id,
                        push_name,
                        profile_pic_url
                    )
                `)
                .eq("id", taskId)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!taskId && open,
    });

    const completeTaskMutation = useMutation({
        mutationFn: async () => {
            if (!taskId) return;
            const { error } = await supabase
                .from("tasks")
                .update({ status: 'completed' })
                .eq("id", taskId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            queryClient.invalidateQueries({ queryKey: ["task-details", taskId] });
            toast.success("Tarefa marcada como concluída!");
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error("Erro ao concluir tarefa: " + error.message);
        },
    });

    if (!taskId) return null;

    const urgencyColors = {
        low: "bg-green-100 text-green-800",
        medium: "bg-yellow-100 text-yellow-800",
        high: "bg-red-100 text-red-800",
    };

    const urgencyLabels = {
        low: "Baixa",
        medium: "Média",
        high: "Alta",
    };

    const typeLabels: Record<string, string> = {
        activity: "Atividade",
        schedule: "Agendamento",
        absence: "Ausência",
        busy: "Ocupado",
        reminder: "Lembrete",
    };

    // Helper to convert UTC string to Zoned Date
    const toZoned = (dateStr: string) => {
        return toZonedTime(dateStr, TIMEZONE);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader className="flex flex-row items-center justify-between pr-8">
                    <DialogTitle className="text-xl font-bold truncate pr-4">
                        {isLoading ? "Carregando..." : task?.title}
                    </DialogTitle>
                    {!isLoading && task && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-12 top-4 rounded-sm ring-offset-background transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            onClick={() => {
                                onOpenChange(false);
                                onEdit(taskId);
                            }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 text-center text-muted-foreground">Carregando detalhes...</div>
                ) : task ? (
                    <div className="space-y-6 mt-2">
                        {/* Status and Type Badges */}
                        <div className="flex gap-2">
                            <Badge variant="outline" className="capitalize">
                                {typeLabels[task.type] || task.type}
                            </Badge>
                            <Badge className={urgencyColors[task.urgency] || "bg-gray-100"}>
                                {urgencyLabels[task.urgency] || task.urgency}
                            </Badge>
                            {task.status === 'completed' && (
                                <Badge className="bg-green-500 text-white">Concluída</Badge>
                            )}
                        </div>

                        {/* Date and Time */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                                    <Calendar className="h-3 w-3" />
                                    Data
                                </div>
                                <p className="font-medium">
                                    {format(toZoned(task.start_time), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                                </p>
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                                    <Clock className="h-3 w-3" />
                                    Horário
                                </div>
                                <p className="font-medium">
                                    {format(toZoned(task.start_time), "HH:mm")} - {format(toZoned(task.end_time), "HH:mm")}
                                </p>
                            </div>
                        </div>

                        {/* Linked Items */}
                        {(task.crm_deals || task.contacts) && (
                            <div className="space-y-3 pt-2 border-t">
                                {task.crm_deals && (
                                    <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-md">
                                        <div className="p-2 bg-blue-100 text-blue-700 rounded-full">
                                            <DollarSignIcon className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground font-medium">Negociação</p>
                                            <p className="font-medium text-sm">{task.crm_deals.title}</p>
                                        </div>
                                    </div>
                                )}
                                {task.contacts && (
                                    <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-md">
                                        {task.contacts.profile_pic_url ? (
                                            <img src={task.contacts.profile_pic_url} className="w-8 h-8 rounded-full object-cover" />
                                        ) : (
                                            <div className="p-2 bg-green-100 text-green-700 rounded-full">
                                                <User className="h-4 w-4" />
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-xs text-muted-foreground font-medium">Contato</p>
                                            <p className="font-medium text-sm">{task.contacts.push_name}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Description */}
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                                <AlignLeft className="h-3 w-3" />
                                Descrição
                            </div>
                            <div className="text-sm leading-relaxed text-[#1E2229] dark:text-white">
                                {task.description || <span className="text-muted-foreground italic">Sem descrição.</span>}
                            </div>
                        </div>

                        {/* Mark as Completed Button */}
                        {task.status !== 'completed' && (
                            <div className="pt-4 border-t flex justify-end">
                                <Button
                                    onClick={() => completeTaskMutation.mutate()}
                                    disabled={completeTaskMutation.isPending}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    {completeTaskMutation.isPending ? "Salvando..." : "Marcar como concluído"}
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-8 text-center text-muted-foreground">Tarefa não encontrada.</div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function DollarSignIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    )
}
