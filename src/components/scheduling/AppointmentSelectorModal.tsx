import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Calendar, Clock, User, Briefcase } from "lucide-react";

const TIMEZONE = "America/Sao_Paulo";

interface AppointmentSelectorModalProps {
    appointments: any[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (appointment: any) => void;
}

export function AppointmentSelectorModal({ appointments, open, onOpenChange, onSelect }: AppointmentSelectorModalProps) {
    const toZoned = (dateStr: string) => {
        return toZonedTime(dateStr, TIMEZONE);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Selecionar Agendamento</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-2 overflow-y-auto pr-2 mt-2">
                    {appointments.map((appointment) => (
                        <div
                            key={appointment.id}
                            className="bg-muted/30 hover:bg-muted/60 border rounded-lg p-3 cursor-pointer transition-colors"
                            onClick={() => {
                                onSelect(appointment);
                                onOpenChange(false);
                            }}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-semibold text-sm">
                                    {appointment.type === 'absence' ? 'Ausência' : 'Agendamento'}
                                </h4>
                                <span className="text-xs font-medium text-muted-foreground bg-background px-2 py-0.5 rounded-full border">
                                    {format(toZoned(appointment.start_time), "dd/MM", { locale: ptBR })}
                                </span>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                                <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{format(toZoned(appointment.start_time), "HH:mm")}</span>
                                </div>
                                {(appointment.professionals || appointment.professional) && (
                                    <div className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        <span className="truncate max-w-[100px]">
                                            {appointment.professionals?.name || appointment.professional?.name}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {appointment.services && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-background/50 p-1.5 rounded-md">
                                    <Briefcase className="w-3 h-3" />
                                    <span className="truncate">
                                        {appointment.services.name}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
