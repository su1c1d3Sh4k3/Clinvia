import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Pencil, Calendar, Clock, User, DollarSign, FileText, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

const TIMEZONE = "America/Sao_Paulo";

interface ViewAppointmentModalProps {
    appointment: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEdit: (appointment: any) => void;
}

export function ViewAppointmentModal({ appointment, open, onOpenChange, onEdit }: ViewAppointmentModalProps) {
    if (!appointment) return null;

    const toZoned = (dateStr: string) => {
        return toZonedTime(dateStr, TIMEZONE);
    };

    const isPast = new Date(appointment.end_time) < new Date();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader className="flex flex-row items-center justify-between pr-8">
                    <DialogTitle className="text-xl font-bold truncate pr-4">
                        {appointment.type === 'absence' ? 'Ausência' : 'Detalhes do Agendamento'}
                    </DialogTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-12 top-4 rounded-sm ring-offset-background transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                            onOpenChange(false);
                            onEdit(appointment);
                        }}
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                </DialogHeader>

                <div className="space-y-6 mt-2">
                    {/* Status Badge */}
                    <div className="flex gap-2">
                        <Badge variant="outline" className={appointment.type === 'absence' ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-blue-100 text-blue-800 border-blue-200"}>
                            {appointment.type === 'absence' ? 'Ausência' : 'Agendamento'}
                        </Badge>
                        {isPast && (
                            <Badge variant="secondary">Finalizado</Badge>
                        )}
                        {appointment.price > 0 && (
                            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                                {formatCurrency(appointment.price)}
                            </Badge>
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
                                {format(toZoned(appointment.start_time), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                                <Clock className="h-3 w-3" />
                                Horário
                            </div>
                            <p className="font-medium">
                                {format(toZoned(appointment.start_time), "HH:mm")} - {format(toZoned(appointment.end_time), "HH:mm")}
                            </p>
                        </div>
                    </div>

                    {/* Professional Info */}
                    {(appointment.professionals || appointment.professional) && (
                        <div className="space-y-1 pt-2 border-t">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-2">
                                <Briefcase className="h-3 w-3" />
                                Profissional
                            </div>
                            <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-md">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                    <User className="h-4 w-4" />
                                </div>
                                <p className="font-medium text-sm">
                                    {appointment.professionals?.name || appointment.professional?.name}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Service Info */}
                    {appointment.services && (
                        <div className="space-y-1 pt-2 border-t">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-2">
                                <DollarSign className="h-3 w-3" />
                                Serviço
                            </div>
                            <p className="font-medium p-2 bg-muted/30 rounded-md">
                                {appointment.services.name}
                            </p>
                        </div>
                    )}

                    {/* Contact Info (if available) */}
                    {appointment.contacts && (
                        <div className="space-y-1 pt-2 border-t">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider mb-2">
                                <User className="h-3 w-3" />
                                Cliente
                            </div>
                            <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-md">
                                {appointment.contacts.profile_pic_url ? (
                                    <img src={appointment.contacts.profile_pic_url} className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                                        <User className="h-4 w-4" />
                                    </div>
                                )}
                                <div>
                                    <p className="font-medium text-sm">{appointment.contacts.push_name}</p>
                                    {appointment.contacts.number && (
                                        <p className="text-xs text-muted-foreground">{appointment.contacts.number.split('@')[0]}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-bold tracking-wider">
                            <FileText className="h-3 w-3" />
                            Observações
                        </div>
                        <div className="text-sm leading-relaxed text-[#1E2229] dark:text-white p-3 bg-muted/20 rounded-md min-h-[60px]">
                            {appointment.description || <span className="text-muted-foreground italic">Sem observações.</span>}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
