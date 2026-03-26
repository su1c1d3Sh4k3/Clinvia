import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useSendMessage } from "@/hooks/useSendMessage";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Bell, Send, User, Loader2 } from "lucide-react";

const TIMEZONE = "America/Sao_Paulo";

interface NotifyAppointmentModalProps {
    appointment: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function buildNotificationMessage(appointment: any): string {
    const contact = appointment?.contacts;
    const service = appointment?.services;
    const professional = appointment?.professionals || appointment?.professional;

    const clientName = contact?.push_name || contact?.name || "Cliente";
    const serviceName = service?.name || "procedimento";
    const professionalName = professional?.name || "profissional";

    const startZoned = toZonedTime(appointment.start_time, TIMEZONE);
    const dateStr = format(startZoned, "dd/MM/yyyy", { locale: ptBR });
    const startTime = format(startZoned, "HH:mm");

    const durationMs =
        new Date(appointment.end_time).getTime() -
        new Date(appointment.start_time).getTime();
    const durationMin = Math.round(durationMs / 60000);

    return (
        `Olá, ${clientName}! Seu agendamento do procedimento de ${serviceName} com ` +
        `${professionalName} foi realizado para o dia ${dateStr} às ${startTime}, ` +
        `seu procedimento tem duração estimada de ${durationMin} minutos. ` +
        `Qualquer dúvida, estamos à disposição, pode entrar em contato.`
    );
}

export function NotifyAppointmentModal({
    appointment,
    open,
    onOpenChange,
}: NotifyAppointmentModalProps) {
    const [selectedInstanceId, setSelectedInstanceId] = useState("");
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const { data: ownerId } = useOwnerId();
    const sendMessageMutation = useSendMessage();

    // Gera a mensagem pre-preenchida sempre que o agendamento mudar
    useEffect(() => {
        if (appointment && open) {
            setMessage(buildNotificationMessage(appointment));
        }
    }, [appointment, open]);

    // Busca instâncias conectadas
    const { data: instances } = useQuery({
        queryKey: ["connected-instances-notify"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instances")
                .select("id, name, status")
                .eq("status", "connected");
            if (error) throw error;
            return data ?? [];
        },
        enabled: open,
    });

    // Pré-seleciona a instância do contato ou a primeira disponível
    useEffect(() => {
        if (!instances || instances.length === 0) return;

        const contactInstanceId = appointment?.contacts?.instance_id;
        if (contactInstanceId) {
            const match = instances.find((i) => i.id === contactInstanceId);
            if (match) {
                setSelectedInstanceId(match.id);
                return;
            }
        }
        setSelectedInstanceId(instances[0].id);
    }, [instances, appointment]);

    const handleSend = async () => {
        if (!selectedInstanceId || !message.trim()) {
            toast.error("Selecione uma instância e escreva a mensagem.");
            return;
        }
        if (!appointment?.contact_id) {
            toast.error("Este agendamento não possui contato associado.");
            return;
        }
        if (!ownerId) {
            toast.error("ID da organização não encontrado.");
            return;
        }

        setIsSending(true);
        try {
            // Busca conversa aberta para esse contato + instância
            const { data: existingConvs } = await supabase
                .from("conversations")
                .select("id")
                .eq("contact_id", appointment.contact_id)
                .eq("instance_id", selectedInstanceId)
                .in("status", ["open", "pending"])
                .order("created_at", { ascending: false })
                .limit(1);

            let conversationId: string | null = null;

            if (existingConvs && existingConvs.length > 0) {
                conversationId = existingConvs[0].id;
            } else {
                // Cria nova conversa com a instância selecionada
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) throw new Error("Usuário não autenticado");

                const { data: member } = await supabase
                    .from("team_members")
                    .select("id")
                    .eq("auth_user_id", user.id)
                    .single();

                const { data: newConv, error: convError } = await supabase
                    .from("conversations")
                    .insert({
                        contact_id: appointment.contact_id,
                        instance_id: selectedInstanceId,
                        user_id: ownerId,
                        status: "open",
                        source: "panel",
                        assigned_agent_id: member?.id ?? null,
                    })
                    .select("id")
                    .single();

                if (convError) throw convError;
                conversationId = newConv.id;
            }

            await sendMessageMutation.mutateAsync({
                conversationId: conversationId!,
                body: message,
                messageType: "text",
                direction: "outbound",
            } as any);

            toast.success("Notificação enviada com sucesso!");
            onOpenChange(false);
        } catch (err: any) {
            toast.error("Erro ao enviar: " + (err.message ?? "Tente novamente."));
        } finally {
            setIsSending(false);
        }
    };

    if (!appointment) return null;

    const contact = appointment.contacts;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-primary" />
                        Notificar Cliente
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Seleção de instância */}
                    <div className="space-y-2">
                        <Label>Instância WhatsApp</Label>
                        <Select
                            value={selectedInstanceId}
                            onValueChange={setSelectedInstanceId}
                        >
                            <SelectTrigger autoComplete="off">
                                <SelectValue placeholder="Selecione uma instância" />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                {instances?.map((instance) => (
                                    <SelectItem key={instance.id} value={instance.id}>
                                        {instance.name}
                                    </SelectItem>
                                ))}
                                {(!instances || instances.length === 0) && (
                                    <SelectItem value="_none" disabled>
                                        Nenhuma instância conectada
                                    </SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Contato (imutável) */}
                    <div className="space-y-2">
                        <Label>Cliente</Label>
                        <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
                            {contact?.profile_pic_url ? (
                                <img
                                    src={contact.profile_pic_url}
                                    alt={contact.push_name}
                                    className="w-8 h-8 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-4 w-4 text-primary" />
                                </div>
                            )}
                            <div>
                                <p className="text-sm font-medium">
                                    {contact?.push_name || "Sem nome"}
                                </p>
                                {contact?.number && (
                                    <p className="text-xs text-muted-foreground">
                                        {contact.number.split("@")[0]}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mensagem editável */}
                    <div className="space-y-2">
                        <Label>Mensagem</Label>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={7}
                            className="resize-none text-sm leading-relaxed"
                            autoComplete="off"
                            placeholder="Mensagem de notificação..."
                        />
                        <p className="text-xs text-muted-foreground">
                            Você pode editar a mensagem antes de enviar.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSending}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={
                            isSending || !selectedInstanceId || !message.trim()
                        }
                        className="gap-2"
                    >
                        {isSending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        {isSending ? "Enviando..." : "Enviar Notificação"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
