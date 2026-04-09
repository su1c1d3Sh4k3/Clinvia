import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Pencil, Calendar, Clock, User, DollarSign, FileText, Briefcase, Bell, Check, X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { NotifyAppointmentModal } from "./NotifyAppointmentModal";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const TIMEZONE = "America/Sao_Paulo";

interface ViewAppointmentModalProps {
    appointment: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEdit: (appointment: any) => void;
    canEdit?: boolean;
}

export function ViewAppointmentModal({ appointment, open, onOpenChange, onEdit, canEdit = true }: ViewAppointmentModalProps) {
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [isEditingEnd, setIsEditingEnd] = useState(false);
    const [newEndTime, setNewEndTime] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    if (!appointment) return null;

    const toZoned = (dateStr: string) => {
        return toZonedTime(dateStr, TIMEZONE);
    };

    const isPast = new Date(appointment.end_time) < new Date();
    const hasContact = !!appointment.contacts && !!appointment.contact_id;
    const isAppointment = appointment.type !== 'absence';

    const handleStartEditEnd = () => {
        setNewEndTime(format(toZoned(appointment.end_time), "HH:mm"));
        setIsEditingEnd(true);
    };

    const handleCancelEditEnd = () => {
        setIsEditingEnd(false);
        setNewEndTime("");
    };

    const handleSaveEndTime = async () => {
        setIsSaving(true);
        try {
            const [hours, minutes] = newEndTime.split(":").map(Number);

            // Reconstruct in zoned space (Sao Paulo)
            const startZoned = toZoned(appointment.start_time);
            const newEndZoned = new Date(startZoned);
            newEndZoned.setHours(hours, minutes, 0, 0);

            // Validate: end must be after start
            if (newEndZoned <= startZoned) {
                toast({ title: "Horário inválido", description: "O término deve ser depois do início.", variant: "destructive" });
                return;
            }

            // Minimum 10 minutes
            const diffMin = (newEndZoned.getTime() - startZoned.getTime()) / 60000;
            if (diffMin < 10) {
                toast({ title: "Duração mínima", description: "O agendamento deve ter pelo menos 10 minutos.", variant: "destructive" });
                return;
            }

            // Convert zoned time back to UTC ISO
            const offsetMs = new Date(appointment.end_time).getTime() - toZoned(appointment.end_time).getTime();
            const newEndISO = new Date(newEndZoned.getTime() + offsetMs).toISOString();

            // Check overlap
            const { data: isOverlap, error: overlapError } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: appointment.professional_id,
                p_start_time: appointment.start_time,
                p_end_time: newEndISO,
                p_exclude_id: appointment.id,
            });
            if (overlapError) throw overlapError;
            if (isOverlap) {
                toast({ title: "Horário indisponível", description: "Existe conflito com outro agendamento.", variant: "destructive" });
                return;
            }

            // Update DB
            const { error } = await supabase
                .from("appointments")
                .update({ end_time: newEndISO })
                .eq("id", appointment.id);
            if (error) throw error;

            // Fire-and-forget: sync Google Calendar
            if (ownerId) {
                supabase.functions.invoke("google-calendar-sync", {
                    body: { action: "sync_appointment", appointment_id: appointment.id, user_id: ownerId },
                }).catch(() => {});
            }

            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
            queryClient.invalidateQueries({ queryKey: ["contact-appointments"] });

            // Update local appointment object for immediate UI feedback
            appointment.end_time = newEndISO;

            toast({ title: "Horário atualizado!" });
            setIsEditingEnd(false);
        } catch (error: any) {
            toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

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
                            {isEditingEnd ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="font-medium">{format(toZoned(appointment.start_time), "HH:mm")} -</span>
                                    <Input
                                        type="time"
                                        value={newEndTime}
                                        onChange={(e) => setNewEndTime(e.target.value)}
                                        className="w-24 h-8 text-sm"
                                        disabled={isSaving}
                                    />
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveEndTime} disabled={isSaving}>
                                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEditEnd} disabled={isSaving}>
                                        <X className="h-3.5 w-3.5 text-red-500" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 group">
                                    <p className="font-medium">
                                        {format(toZoned(appointment.start_time), "HH:mm")} - {format(toZoned(appointment.end_time), "HH:mm")}
                                    </p>
                                    {canEdit && isAppointment && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={handleStartEditEnd}
                                            title="Ajustar horário de término"
                                        >
                                            <Pencil className="h-3 w-3 text-muted-foreground" />
                                        </Button>
                                    )}
                                </div>
                            )}
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
        </>
    );
}
