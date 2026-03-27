import { useState, useEffect, useRef, useCallback } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useSendMessage } from "@/hooks/useSendMessage";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { Bell, Send, User, Loader2, FileText, RotateCcw, ChevronDown, ChevronUp, Save } from "lucide-react";

const TIMEZONE = "America/Sao_Paulo";

export const DEFAULT_NOTIFICATION_TEMPLATE =
    "Olá, {nome}! Seu agendamento do procedimento de {procedimento} com {profissional} foi realizado para o dia {data} às {hora}, seu procedimento tem duração estimada de {tempo} minutos. Qualquer dúvida, estamos à disposição, pode entrar em contato.";

const TEMPLATE_SHORTCUTS = [
    { label: "{nome}", title: "Nome do cliente" },
    { label: "{procedimento}", title: "Nome do serviço" },
    { label: "{profissional}", title: "Nome do profissional" },
    { label: "{data}", title: "Data do agendamento" },
    { label: "{hora}", title: "Horário de início" },
    { label: "{tempo}", title: "Duração em minutos" },
];

function buildNotificationMessage(appointment: any, template: string): string {
    const contact = appointment?.contacts;
    const clientName = contact?.push_name || contact?.name || "Cliente";
    const serviceName =
        appointment?.products_services?.name ||
        appointment?.service_name ||
        "procedimento";
    const professionalName =
        appointment?.professional_name || "profissional";

    const startZoned = toZonedTime(appointment.start_time, TIMEZONE);
    const dateStr = format(startZoned, "dd/MM/yyyy", { locale: ptBR });
    const startTime = format(startZoned, "HH:mm");

    const durationMs =
        new Date(appointment.end_time).getTime() -
        new Date(appointment.start_time).getTime();
    const durationMin = Math.round(durationMs / 60000);

    return template
        .replace(/\{nome\}/g, clientName)
        .replace(/\{procedimento\}/g, serviceName)
        .replace(/\{profissional\}/g, professionalName)
        .replace(/\{data\}/g, dateStr)
        .replace(/\{hora\}/g, startTime)
        .replace(/\{tempo\}/g, String(durationMin));
}

interface NotifyAppointmentModalProps {
    appointment: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function NotifyAppointmentModal({
    appointment,
    open,
    onOpenChange,
}: NotifyAppointmentModalProps) {
    const [selectedInstanceId, setSelectedInstanceId] = useState("");
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showTemplateEditor, setShowTemplateEditor] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(DEFAULT_NOTIFICATION_TEMPLATE);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const templateRef = useRef<HTMLTextAreaElement>(null);
    const { data: ownerId } = useOwnerId();
    const sendMessageMutation = useSendMessage();
    const queryClient = useQueryClient();

    // Busca template salvo nas configurações de agendamento
    const { data: settings } = useQuery({
        queryKey: ["scheduling_settings", ownerId],
        queryFn: async () => {
            if (!ownerId) return null;
            const { data } = await supabase
                .from("scheduling_settings")
                .select("notification_template")
                .eq("user_id", ownerId)
                .maybeSingle();
            return data;
        },
        enabled: !!ownerId,
    });

    // Sincroniza o template de edição com o salvo
    useEffect(() => {
        const tmpl = settings?.notification_template || DEFAULT_NOTIFICATION_TEMPLATE;
        setEditingTemplate(tmpl);
    }, [settings]);

    // Gera a mensagem usando o template salvo (ou padrão)
    useEffect(() => {
        if (appointment && open) {
            const template =
                settings?.notification_template || DEFAULT_NOTIFICATION_TEMPLATE;
            setMessage(buildNotificationMessage(appointment, template));
        }
    }, [appointment, open, settings]);

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
            if (match) { setSelectedInstanceId(match.id); return; }
        }
        setSelectedInstanceId(instances[0].id);
    }, [instances, appointment]);

    // Insere atalho na posição do cursor
    const insertShortcut = useCallback((shortcut: string) => {
        const el = templateRef.current;
        if (!el) {
            setEditingTemplate((prev) => prev + shortcut);
            return;
        }
        const start = el.selectionStart ?? editingTemplate.length;
        const end = el.selectionEnd ?? editingTemplate.length;
        const next = editingTemplate.slice(0, start) + shortcut + editingTemplate.slice(end);
        setEditingTemplate(next);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + shortcut.length, start + shortcut.length);
        });
    }, [editingTemplate]);

    // Salva template no banco
    const handleSaveTemplate = async () => {
        if (!ownerId) return;
        setIsSavingTemplate(true);
        try {
            const { error } = await supabase
                .from("scheduling_settings")
                .upsert({ user_id: ownerId, notification_template: editingTemplate }, { onConflict: "user_id" });
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["scheduling_settings", ownerId] });
            // Regenera a mensagem com o novo template
            setMessage(buildNotificationMessage(appointment, editingTemplate));
            toast.success("Template salvo!");
            setShowTemplateEditor(false);
        } catch (err: any) {
            toast.error("Erro ao salvar template: " + err.message);
        } finally {
            setIsSavingTemplate(false);
        }
    };

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
                const { data: { user } } = await supabase.auth.getUser();
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
            <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
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
                        <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
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
                                <img src={contact.profile_pic_url} alt={contact.push_name}
                                    className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-4 w-4 text-primary" />
                                </div>
                            )}
                            <div>
                                <p className="text-sm font-medium">{contact?.push_name || "Sem nome"}</p>
                                {contact?.number && (
                                    <p className="text-xs text-muted-foreground">{contact.number.split("@")[0]}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mensagem editável */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Mensagem</Label>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setShowTemplateEditor((v) => !v)}
                            >
                                <FileText className="w-3.5 h-3.5" />
                                Personalizar template
                                {showTemplateEditor
                                    ? <ChevronUp className="w-3 h-3" />
                                    : <ChevronDown className="w-3 h-3" />}
                            </Button>
                        </div>

                        {/* Editor de template (expansível) */}
                        {showTemplateEditor && (
                            <div className="rounded-lg border bg-muted/20 p-3 space-y-3 animate-in slide-in-from-top-2">
                                <p className="text-xs text-muted-foreground">
                                    Edite o template padrão. Clique nos atalhos para inserir na posição do cursor.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {TEMPLATE_SHORTCUTS.map(({ label, title }) => (
                                        <button
                                            key={label}
                                            type="button"
                                            title={title}
                                            onClick={() => insertShortcut(label)}
                                            className="px-2 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <Textarea
                                    ref={templateRef}
                                    value={editingTemplate}
                                    onChange={(e) => setEditingTemplate(e.target.value)}
                                    rows={4}
                                    className="resize-none text-xs leading-relaxed font-mono"
                                    autoComplete="off"
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1 text-xs text-muted-foreground"
                                        onClick={() => setEditingTemplate(DEFAULT_NOTIFICATION_TEMPLATE)}
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Restaurar padrão
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-7 gap-1.5 text-xs"
                                        onClick={handleSaveTemplate}
                                        disabled={isSavingTemplate}
                                    >
                                        {isSavingTemplate
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : <Save className="w-3 h-3" />}
                                        Salvar template
                                    </Button>
                                </div>
                            </div>
                        )}

                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={6}
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
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={isSending || !selectedInstanceId || !message.trim()}
                        className="gap-2"
                    >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {isSending ? "Enviando..." : "Enviar Notificação"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
