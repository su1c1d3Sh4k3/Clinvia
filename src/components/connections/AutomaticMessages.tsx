import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Loader2, Plus, Pencil, Clock, Bot, MessageSquareText } from "lucide-react";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle
} from "@/components/ui/dialog";
// Corpos default — FONTE ÚNICA em supabase/functions/_shared/uazapi-automation-messages.ts
// (arquivo puro, sem imports Deno — compartilhado entre edge e frontend)
import { DEFAULT_UAZAPI_BODIES as DEFAULT_BODIES } from "../../../supabase/functions/_shared/uazapi-automation-messages";

// ── Mensagens automáticas da API não oficial (UAZAPI) ───────────────────────
// Espelham os 4 templates de sistema da Meta, com corpo editável e switch
// independente. Sem aprovação: edições valem imediatamente.

const AUTO_MSG_META: Record<string, {
    label: string;
    interval: string;
    vars: { key: string; label: string }[];
    buttonsNote?: string;
}> = {
    sys_confirm_24h_v1: {
        label: "Confirmação 24h (1 agendamento)",
        interval: "Esta mensagem é enviada automaticamente ~24 horas antes do agendamento (no dia anterior), quando o cliente tem 1 agendamento no dia.",
        vars: [
            { key: "nome_cliente", label: "Nome do cliente" },
            { key: "horario", label: "Horário" },
            { key: "clinica", label: "Nome da clínica" },
            { key: "servico", label: "Serviço" },
            { key: "profissional", label: "Profissional" },
        ],
        buttonsNote: "Os botões de resposta rápida (Sim, pode confirmar / Vou precisar reagendar / Não vou poder ir) são fixos e enviados automaticamente junto com a mensagem.",
    },
    sys_confirm_multi_v1: {
        label: "Confirmação 24h (vários agendamentos)",
        interval: "Esta mensagem é enviada automaticamente ~24 horas antes, quando o cliente tem 2 ou mais agendamentos no mesmo dia.",
        vars: [
            { key: "nome_cliente", label: "Nome do cliente" },
            { key: "clinica", label: "Nome da clínica" },
            { key: "agendamentos", label: "Lista de agendamentos" },
        ],
        buttonsNote: "Os botões de resposta rápida (Sim, pode confirmar / Vou precisar reagendar / Não vou poder ir) são fixos e enviados automaticamente junto com a mensagem.",
    },
    sys_reminder_2h_v1: {
        label: "Lembrete 2h antes",
        interval: "Esta mensagem é enviada automaticamente 2 horas antes do agendamento.",
        vars: [
            { key: "nome_cliente", label: "Nome do cliente" },
            { key: "horarios", label: "Horário(s)" },
            { key: "clinica", label: "Nome da clínica" },
        ],
    },
    sys_feedback_24h_v1: {
        label: "Pesquisa de satisfação (24h depois)",
        interval: "Esta mensagem é enviada automaticamente ~24 horas após o atendimento (pesquisa de satisfação).",
        vars: [
            { key: "nome_cliente", label: "Nome do cliente" },
            { key: "clinica", label: "Nome da clínica" },
        ],
        buttonsNote: "Os botões de avaliação (Excelente / Muito bom / Regular / Precisa melhorar / Insatisfeito) são fixos e enviados automaticamente junto com a mensagem.",
    },
};

const AUTO_MSG_ORDER = Object.keys(AUTO_MSG_META);


const AutomaticMessages = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();

    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editName, setEditName] = useState<string | null>(null);
    const [editBodyText, setEditBodyText] = useState("");
    const editBodyRef = useRef<HTMLTextAreaElement>(null);

    const { data: rows, isLoading } = useQuery({
        queryKey: ["uazapi-automation-messages", ownerId],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("uazapi_automation_messages")
                .select("template_name, body, enabled")
                .eq("user_id", ownerId);
            if (error) throw error;
            return (data || []) as { template_name: string; body: string | null; enabled: boolean }[];
        },
        enabled: !!ownerId,
    });

    const getRow = (name: string) => rows?.find((r) => r.template_name === name);
    const getBody = (name: string) => getRow(name)?.body || DEFAULT_BODIES[name];
    const isEnabled = (name: string) => getRow(name)?.enabled !== false;

    const upsertMutation = useMutation({
        mutationFn: async (payload: { template_name: string; body?: string; enabled?: boolean }) => {
            if (!ownerId) throw new Error("Sem usuário");
            const { error } = await (supabase as any)
                .from("uazapi_automation_messages")
                .upsert(
                    {
                        user_id: ownerId,
                        template_name: payload.template_name,
                        ...(payload.body !== undefined ? { body: payload.body } : {}),
                        ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id,template_name" }
                );
            if (error) throw error;
            return payload;
        },
        onSuccess: (payload) => {
            queryClient.invalidateQueries({ queryKey: ["uazapi-automation-messages"] });
            if (payload.enabled !== undefined) {
                toast({ title: payload.enabled ? "Envio automático ativado" : "Envio automático desativado" });
            } else {
                toast({ title: "Mensagem atualizada!", description: "A alteração vale imediatamente para os próximos envios." });
                setEditDialogOpen(false);
            }
        },
        onError: (err: any) => {
            toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
        },
    });

    const openEditDialog = (name: string) => {
        setEditName(name);
        setEditBodyText(getBody(name));
        setEditDialogOpen(true);
    };

    const saveEdit = () => {
        if (!editName) return;
        const body = editBodyText.trim();
        if (!body) return;
        const validKeys = AUTO_MSG_META[editName].vars.map((v) => v.key);
        const unknown = [...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)]
            .map((m) => m[1])
            .filter((k) => !validKeys.includes(k));
        if (unknown.length > 0) {
            toast({
                title: "Variável desconhecida",
                description: `{{${unknown[0]}}} não existe nesta mensagem. Use os botões de variáveis.`,
                variant: "destructive",
            });
            return;
        }
        upsertMutation.mutate({ template_name: editName, body });
    };

    const insertEditVariable = (key: string) => {
        const token = `{{${key}}}`;
        const el = editBodyRef.current;
        if (!el) {
            setEditBodyText((t) => t + token);
            return;
        }
        const start = el.selectionStart ?? editBodyText.length;
        const end = el.selectionEnd ?? start;
        setEditBodyText(editBodyText.slice(0, start) + token + editBodyText.slice(end));
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + token.length;
        });
    };

    const editMeta = editName ? AUTO_MSG_META[editName] : null;

    return (
        <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
            <Card>
                <CardHeader className="p-4 md:p-6">
                    <CardTitle className="text-base md:text-lg">Mensagens Automáticas (API não oficial)</CardTitle>
                    <p className="text-muted-foreground text-xs md:text-sm">
                        Mensagens de confirmação, lembrete e pesquisa de satisfação enviadas automaticamente pelo WhatsApp
                        conectado via API não oficial. Edições valem imediatamente, sem necessidade de aprovação.
                    </p>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {AUTO_MSG_ORDER.map((name) => {
                                const meta = AUTO_MSG_META[name];
                                return (
                                    <div key={name} className="border rounded-lg p-3 md:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <MessageSquareText className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-medium text-sm">{meta.label}</span>
                                                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 border">
                                                        <Bot className="h-3 w-3 mr-1" /> Mensagem Automatizada
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
                                                    {getBody(name)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div title={isEnabled(name) ? "Envio automático ativado" : "Envio automático desativado"}>
                                                <Switch
                                                    checked={isEnabled(name)}
                                                    onCheckedChange={(v) => upsertMutation.mutate({ template_name: name, enabled: v })}
                                                    disabled={upsertMutation.isPending}
                                                    className="scale-90"
                                                />
                                            </div>
                                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditDialog(name)}>
                                                <Pencil className="h-3 w-3 mr-1" /> Editar
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Editar Mensagem Automática</DialogTitle>
                        <DialogDescription>
                            "{editMeta?.label}" — a alteração vale imediatamente para os próximos envios.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {editMeta && (
                            <div className="rounded-md bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-700 dark:text-blue-400 flex gap-2">
                                <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{editMeta.interval}</span>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Corpo da mensagem</Label>
                            <Textarea
                                ref={editBodyRef}
                                value={editBodyText}
                                onChange={(e) => setEditBodyText(e.target.value)}
                                rows={6}
                            />
                        </div>
                        {editMeta && (
                            <div className="space-y-2">
                                <Label>Variaveis (clique para inserir no texto)</Label>
                                <div className="flex flex-wrap gap-2">
                                    {editMeta.vars.map((v) => (
                                        <Button
                                            key={v.key}
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            className="h-7 text-xs"
                                            onClick={() => insertEditVariable(v.key)}
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> {v.label}
                                        </Button>
                                    ))}
                                </div>
                                {editMeta.buttonsNote && (
                                    <p className="text-xs text-muted-foreground">{editMeta.buttonsNote}</p>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={saveEdit} disabled={upsertMutation.isPending || !editBodyText.trim()}>
                            {upsertMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
                            ) : (
                                <><Pencil className="h-4 w-4 mr-2" /> Salvar alteracoes</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AutomaticMessages;
