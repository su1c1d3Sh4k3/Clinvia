import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import {
    Pencil, Calendar, Clock, User, DollarSign, FileText, Briefcase, Bell,
    CheckCircle2, CalendarClock, XCircle, Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { NotifyAppointmentModal } from "./NotifyAppointmentModal";

const TIMEZONE = "America/Sao_Paulo";

interface ViewAppointmentModalProps {
    appointment: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEdit: (appointment: any) => void;
    /**
     * Callback for status transitions. Maps to Scheduling.tsx `handleStatusChange`.
     * When newStatus='rescheduled' the parent opens AppointmentModal in edit mode.
     */
    onStatusChange?: (appointmentId: string, newStatus: string, appointment: any) => void;
    canEdit?: boolean;
}

export function ViewAppointmentModal({ appointment, open, onOpenChange, onEdit, onStatusChange, canEdit = true }: ViewAppointmentModalProps) {
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

    if (!appointment) return null;

    const status: string = appointment.status || "pending";
    const isFinalized = status === "completed" || status === "canceled";
    const alreadyConfirmed = status === "confirmed";

    const runStatusChange = (newStatus: string) => {
        if (!onStatusChange) return;
        onStatusChange(appointment.id, newStatus, appointment);
        // Close the view modal for terminal transitions; reschedule opens the
        // edit modal which already handles its own lifecycle.
        if (newStatus === "canceled" || newStatus === "completed" || newStatus === "rescheduled") {
            onOpenChange(false);
        }
    };

    const toZoned = (dateStr: string) => {
        return toZonedTime(dateStr, TIMEZONE);
    };

    const isPast = new Date(appointment.end_time) < new Date();
    const hasContact = !!appointment.contacts && !!appointment.contact_id;
    const isAppointment = appointment.type !== 'absence';

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                <DialogHeader className="flex flex-row items-center justify-between pr-8">
                    <DialogTitle className="text-xl font-bold truncate pr-4">
                        {appointment.type === 'absence' ? 'Ausência' : 'Detalhes do Agendamento'}
                    </DialogTitle>
                    {canEdit && (
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
                    )}
                </DialogHeader>

                <div className="space-y-6 mt-2">
                    {/* Status Badge */}
                    <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className={appointment.type === 'absence' ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-blue-100 text-blue-800 border-blue-200"}>
                            {appointment.type === 'absence' ? 'Ausência' : 'Agendamento'}
                        </Badge>
                        {status === 'confirmed' && (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                Confirmado
                            </Badge>
                        )}
                        {status === 'rescheduled' && (
                            <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300">
                                Reagendado
                            </Badge>
                        )}
                        {status === 'completed' && (
                            <Badge variant="outline" className="border-slate-400 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                Concluído
                            </Badge>
                        )}
                        {status === 'canceled' && (
                            <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300">
                                Cancelado
                            </Badge>
                        )}
                        {isPast && status !== 'completed' && status !== 'canceled' && (
                            <Badge variant="secondary">Data passada</Badge>
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

                    {/* Action buttons — only for real appointments (not absences) that aren't finalized */}
                    {isAppointment && onStatusChange && !isFinalized && canEdit && (
                        <div className="pt-2 border-t space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    className="w-full gap-2"
                                    variant="outline"
                                    onClick={() => runStatusChange("confirmed")}
                                    disabled={alreadyConfirmed}
                                >
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    {alreadyConfirmed ? "Confirmado" : "Confirmar"}
                                </Button>
                                <Button
                                    className="w-full gap-2"
                                    variant="outline"
                                    onClick={() => runStatusChange("rescheduled")}
                                >
                                    <CalendarClock className="h-4 w-4 text-yellow-600" />
                                    Reagendar
                                </Button>
                                <Button
                                    className="w-full gap-2"
                                    variant="outline"
                                    onClick={() => setCancelConfirmOpen(true)}
                                >
                                    <XCircle className="h-4 w-4 text-red-600" />
                                    Cancelar
                                </Button>
                                <Button
                                    className="w-full gap-2"
                                    variant="outline"
                                    onClick={() => runStatusChange("completed")}
                                >
                                    <Check className="h-4 w-4 text-slate-600" />
                                    Concluir
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Botão Notificar Cliente */}
                    {isAppointment && hasContact && (
                        <div className="pt-2 border-t">
                            <Button
                                className="w-full gap-2"
                                variant="outline"
                                onClick={() => setNotifyOpen(true)}
                            >
                                <Bell className="h-4 w-4" />
                                Notificar Cliente
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>

        {/* Modal de notificação */}
        <NotifyAppointmentModal
            appointment={appointment}
            open={notifyOpen}
            onOpenChange={setNotifyOpen}
        />

        {/* Confirmação de cancelamento */}
        <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar este agendamento?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta ação marca o agendamento como <strong>cancelado</strong> e
                        remove o evento do Google Calendar. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => {
                            setCancelConfirmOpen(false);
                            runStatusChange("canceled");
                        }}
                    >
                        Sim, cancelar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
