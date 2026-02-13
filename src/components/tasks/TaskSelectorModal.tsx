import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TIMEZONE = "America/Sao_Paulo";

interface TaskSelectorModalProps {
    tasks: any[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (taskId: string) => void;
}

export function TaskSelectorModal({ tasks, open, onOpenChange, onSelect }: TaskSelectorModalProps) {
    const toZoned = (dateStr: string) => {
        return toZonedTime(dateStr, TIMEZONE);
    };

    const urgencyColors: Record<string, string> = {
        low: "bg-green-100 text-green-800 border-green-200",
        medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
        high: "bg-red-100 text-red-800 border-red-200",
    };

    const urgencyLabels: Record<string, string> = {
        low: "Baixa",
        medium: "Média",
        high: "Alta",
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Selecionar Tarefa</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-2 overflow-y-auto pr-2 mt-2">
                    {tasks.map((task) => (
                        <div
                            key={task.id}
                            className="bg-muted/30 hover:bg-muted/60 border rounded-lg p-3 cursor-pointer transition-colors"
                            onClick={() => {
                                onSelect(task.id);
                                onOpenChange(false);
                            }}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-semibold text-sm line-clamp-1 flex-1 mr-2">{task.title}</h4>
                                {task.urgency && (
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 border-0 ${urgencyColors[task.urgency] || ''}`}>
                                        {urgencyLabels[task.urgency] || task.urgency}
                                    </Badge>
                                )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    <span>{format(toZoned(task.due_date || task.start_time), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
