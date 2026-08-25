// Card do TEMPLATE PADRÃO de recorrência da conta (Conexões → Templates → aba
// Recorrência). Mostra as 3 mensagens padrão (Prévia / Vencimento / Pós) e
// permite editar: alerta → editor com chips de variáveis → salva em
// profiles.recurrence_default_msg_1..3 e reenvia rec_default_msgN à Meta
// (nova versão remove a antiga — user rule 2026-08-25).
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
    DEFAULT_RECURRENCE_MESSAGES,
    resolveAccountDefaultMessage,
} from "../../../supabase/functions/_shared/recurrence-default-messages";
import {
    RECURRENCE_VARIABLES,
    findUnknownRecurrenceVariables,
} from "@/lib/recurrenceTemplate";
import { syncRecurrenceTemplates } from "@/lib/recurrenceTemplateSync";

const MSG_LABELS: Record<1 | 2 | 3, { title: string; hint: string }> = {
    1: { title: "Mensagem 1 — Prévia", hint: "Enviada antes do vencimento do procedimento." },
    2: { title: "Mensagem 2 — Vencimento", hint: "Enviada quando o efeito está vencendo." },
    3: { title: "Mensagem 3 — Pós-vencimento", hint: "Enviada após o vencimento do efeito." },
};

const NUMS = [1, 2, 3] as const;

export const RecurrenceDefaultTemplateCard = () => {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();

    const [alertOpen, setAlertOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [drafts, setDrafts] = useState<Record<1 | 2 | 3, string>>({ 1: "", 2: "", 3: "" });
    const [focusedMsg, setFocusedMsg] = useState<1 | 2 | 3>(1);
    const textareaRefs = {
        1: useRef<HTMLTextAreaElement>(null),
        2: useRef<HTMLTextAreaElement>(null),
        3: useRef<HTMLTextAreaElement>(null),
    };

    const { data: profileMsgs, isLoading } = useQuery({
        queryKey: ["recurrence-default-msgs", ownerId],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from("profiles")
                .select("recurrence_default_msg_1, recurrence_default_msg_2, recurrence_default_msg_3")
                .eq("id", ownerId)
                .maybeSingle();
            if (error) throw error;
            return data as {
                recurrence_default_msg_1: string | null;
                recurrence_default_msg_2: string | null;
                recurrence_default_msg_3: string | null;
            } | null;
        },
        enabled: !!ownerId,
    });

    const overrideOf = (n: 1 | 2 | 3): string | null =>
        (profileMsgs?.[`recurrence_default_msg_${n}` as const] as string | null) ?? null;

    const resolved = (n: 1 | 2 | 3) => resolveAccountDefaultMessage(n, overrideOf(n));
    const isCustomized = NUMS.some((n) => (overrideOf(n) || "").trim().length > 0);

    const openEditor = () => {
        setDrafts({ 1: resolved(1), 2: resolved(2), 3: resolved(3) });
        setAlertOpen(false);
        setEditOpen(true);
    };

    const insertVariable = (key: string) => {
        const n = focusedMsg;
        const el = textareaRefs[n].current;
        const token = `{{${key}}}`;
        const text = drafts[n];
        const start = el?.selectionStart ?? text.length;
        const end = el?.selectionEnd ?? start;
        const next = text.slice(0, start) + token + text.slice(end);
        setDrafts((d) => ({ ...d, [n]: next }));
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            el.selectionStart = el.selectionEnd = start + token.length;
        });
    };

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!ownerId) throw new Error("Sem usuário");
            for (const n of NUMS) {
                if (!drafts[n].trim()) throw new Error(`A ${MSG_LABELS[n].title} não pode ficar vazia.`);
                const unknown = findUnknownRecurrenceVariables(drafts[n]);
                if (unknown.length > 0) {
                    throw new Error(
                        `Variável desconhecida na ${MSG_LABELS[n].title}: ${unknown.map((k) => `{{${k}}}`).join(", ")}. Use os botões de variáveis.`,
                    );
                }
            }
            const update: Record<string, string | null> = {};
            for (const n of NUMS) {
                const t = drafts[n].trim();
                // Igual ao texto embutido = sem override (volta ao padrão do sistema)
                update[`recurrence_default_msg_${n}`] = t === DEFAULT_RECURRENCE_MESSAGES[n] ? null : t;
            }
            const { error } = await (supabase as any)
                .from("profiles")
                .update(update)
                .eq("id", ownerId);
            if (error) throw error;
        },
        onSuccess: () => {
            setEditOpen(false);
            toast.success("Template padrão salvo", {
                description: "Nova versão enviada para aprovação da Meta. Enquanto não aprovada, os disparos de recorrência em instâncias Meta ficam pausados.",
            });
            // Nova versão na Meta (remove a antiga e submete a nova); sem Meta = no-op
            syncRecurrenceTemplates({ syncDefault: true });
            queryClient.invalidateQueries({ queryKey: ["recurrence-default-msgs"] });
            queryClient.invalidateQueries({ queryKey: ["meta-templates"] });
            queryClient.invalidateQueries({ queryKey: ["recurrence-template-badges"] });
        },
        onError: (err: any) => {
            toast.error("Erro ao salvar", { description: err.message });
        },
    });

    return (
        <>
            <Card className="border-primary/30">
                <CardHeader className="p-4 md:p-6 pb-2 md:pb-3 flex flex-row items-start justify-between space-y-0 gap-3">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Template padrão da conta
                            {isCustomized ? (
                                <Badge variant="outline" className="text-[10px]">Personalizado</Badge>
                            ) : (
                                <Badge variant="secondary" className="text-[10px]">Padrão do sistema</Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                            As 3 mensagens abaixo são usadas por todos os serviços com recorrência
                            ativa que não têm template personalizado próprio.
                        </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setAlertOpen(true)}>
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                </CardHeader>
                <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-3">
                    {isLoading ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        NUMS.map((n) => (
                            <div key={n} className="rounded-md border p-3 bg-muted/20">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium">{MSG_LABELS[n].title}</span>
                                    <span className="text-[11px] text-muted-foreground">{MSG_LABELS[n].hint}</span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{resolved(n)}</p>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Editar o template padrão?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ao salvar, uma nova versão será criada: o template antigo é removido da
                            Meta e o novo é enviado para aprovação. As campanhas de recorrência que
                            usam o padrão passam a usar a nova versão automaticamente — em
                            instâncias Meta, os disparos ficam pausados até a aprovação.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={openEditor}>Continuar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg">
                    <DialogHeader>
                        <DialogTitle>Editar template padrão de recorrência</DialogTitle>
                        <DialogDescription>
                            Clique numa variável para inseri-la na mensagem em edição.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-1.5">
                            {RECURRENCE_VARIABLES.map((v) => (
                                <Button
                                    key={v.key}
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-6 text-[11px] px-2"
                                    onClick={() => insertVariable(v.key)}
                                >
                                    <Plus className="h-3 w-3 mr-0.5" /> {v.label}
                                </Button>
                            ))}
                        </div>
                        {NUMS.map((n) => (
                            <div key={n} className="space-y-1.5">
                                <Label className="text-xs">{MSG_LABELS[n].title}</Label>
                                <Textarea
                                    ref={textareaRefs[n]}
                                    value={drafts[n]}
                                    rows={4}
                                    onFocus={() => setFocusedMsg(n)}
                                    onChange={(e) => setDrafts((d) => ({ ...d, [n]: e.target.value }))}
                                />
                            </div>
                        ))}
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() => setDrafts({
                                1: DEFAULT_RECURRENCE_MESSAGES[1],
                                2: DEFAULT_RECURRENCE_MESSAGES[2],
                                3: DEFAULT_RECURRENCE_MESSAGES[3],
                            })}
                        >
                            <RotateCcw className="h-3 w-3 mr-1" /> Restaurar textos padrão
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
                        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                            {saveMutation.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
                            ) : (
                                "Salvar e enviar para aprovação"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
