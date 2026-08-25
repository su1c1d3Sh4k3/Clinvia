import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimerOff } from "lucide-react";
import { toast } from "sonner";

// Encerramento Automático de Mensagens (user rules, 2026-08-25):
// timer sempre da última msg do CLIENTE; Meta = 22h30/23h30 fixos (dentro da
// janela de 24h); UAZAPI = tempos editáveis; 2 mensagens editáveis; sub-chave
// "Fechar conversas sem interação" (default 48h, encerra sem mensagem).

const DEFAULTS = {
    auto_close_enabled: true,
    auto_close_warning_minutes: 1350,
    auto_close_final_minutes: 1410,
    auto_close_warning_message:
        "Caso não obtivermos retorno nos próximos 60 min, agradecemos seu contato e encerraremos seu atendimento",
    auto_close_final_message:
        "Estamos encerrando seu atendimento por falta de contato, esperamos nos falar novamente",
    auto_close_no_interaction_enabled: true,
    auto_close_no_interaction_hours: 48,
};

type AutoCloseConfig = typeof DEFAULTS;

const fmtMinutes = (min: number) => {
    if (!Number.isFinite(min) || min <= 0) return "—";
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h${String(m).padStart(2, "0")}`;
};

export function AutoCloseSettings() {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();
    const [form, setForm] = useState<AutoCloseConfig>(DEFAULTS);

    const { data: config, isLoading } = useQuery({
        queryKey: ["auto-close-settings", ownerId],
        enabled: !!ownerId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select(
                    "auto_close_enabled, auto_close_warning_minutes, auto_close_final_minutes, auto_close_warning_message, auto_close_final_message, auto_close_no_interaction_enabled, auto_close_no_interaction_hours",
                )
                .eq("id", ownerId!)
                .single();
            if (error) throw error;
            return data as unknown as AutoCloseConfig;
        },
    });

    useEffect(() => {
        if (config) setForm({ ...DEFAULTS, ...config });
    }, [config]);

    const saveMutation = useMutation({
        mutationFn: async (values: AutoCloseConfig) => {
            const { error } = await supabase
                .from("profiles")
                .update(values as Record<string, unknown>)
                .eq("id", ownerId!);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["auto-close-settings", ownerId] });
            toast.success("Encerramento automático atualizado");
        },
        onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
    });

    const handleSave = () => {
        if (form.auto_close_warning_minutes < 5) {
            toast.error("O tempo do aviso deve ser de pelo menos 5 minutos");
            return;
        }
        if (form.auto_close_final_minutes <= form.auto_close_warning_minutes) {
            toast.error("O tempo de encerramento deve ser maior que o do aviso");
            return;
        }
        if (form.auto_close_no_interaction_hours < 1) {
            toast.error("O tempo de conversas sem interação deve ser de pelo menos 1 hora");
            return;
        }
        if (!form.auto_close_warning_message.trim() || !form.auto_close_final_message.trim()) {
            toast.error("As duas mensagens são obrigatórias");
            return;
        }
        saveMutation.mutate(form);
    };

    return (
        <Card>
            <CardHeader className="p-4 md:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base md:text-lg flex items-center gap-2">
                            <TimerOff className="h-5 w-5 text-primary" />
                            Encerramento Automático de Mensagens
                        </CardTitle>
                        <CardDescription className="text-xs md:text-sm">
                            Conversas em que o cliente para de responder recebem um aviso e, sem retorno,
                            são encerradas automaticamente — o ticket é resolvido e o card do CRM vai para
                            a etapa <strong>Sem Contato</strong>. O tempo conta sempre a partir da última
                            mensagem do cliente; se ele responder, o ciclo recomeça. Na API Oficial (Meta)
                            os tempos são fixos em 22h30 (aviso) e 23h30 (encerramento) para nunca estourar
                            a janela de 24h. Grupos e Instagram ficam de fora.
                        </CardDescription>
                    </div>
                    <Switch
                        checked={form.auto_close_enabled}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, auto_close_enabled: v }))}
                        disabled={isLoading}
                    />
                </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 space-y-4">
                {form.auto_close_enabled && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="ac-warning-msg">Mensagem de aviso</Label>
                            <Textarea
                                id="ac-warning-msg"
                                rows={2}
                                value={form.auto_close_warning_message}
                                onChange={(e) => setForm((f) => ({ ...f, auto_close_warning_message: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ac-final-msg">Mensagem de encerramento</Label>
                            <Textarea
                                id="ac-final-msg"
                                rows={2}
                                value={form.auto_close_final_message}
                                onChange={(e) => setForm((f) => ({ ...f, auto_close_final_message: e.target.value }))}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="ac-warn-min">
                                    API não oficial — aviso (minutos após a última mensagem do cliente)
                                </Label>
                                <Input
                                    id="ac-warn-min"
                                    type="number"
                                    min={5}
                                    value={form.auto_close_warning_minutes}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, auto_close_warning_minutes: Number(e.target.value) }))
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    = {fmtMinutes(form.auto_close_warning_minutes)}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ac-final-min">API não oficial — encerramento (minutos)</Label>
                                <Input
                                    id="ac-final-min"
                                    type="number"
                                    min={10}
                                    value={form.auto_close_final_minutes}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, auto_close_final_minutes: Number(e.target.value) }))
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    = {fmtMinutes(form.auto_close_final_minutes)}
                                </p>
                            </div>
                        </div>
                    </>
                )}

                <div className="flex items-start justify-between gap-4 border-t pt-4">
                    <div className="space-y-1">
                        <Label>Fechar conversas sem interação</Label>
                        <p className="text-xs text-muted-foreground">
                            Conversas em que o cliente nunca respondeu são encerradas sem mensagem
                            (o card também vai para Sem Contato).
                        </p>
                    </div>
                    <Switch
                        checked={form.auto_close_no_interaction_enabled}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, auto_close_no_interaction_enabled: v }))}
                        disabled={isLoading}
                    />
                </div>
                {form.auto_close_no_interaction_enabled && (
                    <div className="space-y-2 max-w-xs">
                        <Label htmlFor="ac-noint-hours">Encerrar após (horas sem interação)</Label>
                        <Input
                            id="ac-noint-hours"
                            type="number"
                            min={1}
                            value={form.auto_close_no_interaction_hours}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, auto_close_no_interaction_hours: Number(e.target.value) }))
                            }
                        />
                    </div>
                )}

                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isLoading || saveMutation.isPending}>
                        {saveMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
