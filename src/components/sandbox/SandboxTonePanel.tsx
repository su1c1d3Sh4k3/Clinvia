import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Rocket, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToneSlider } from "@/components/ia/ToneSlider";
import {
    CONTEXTO_MARCA_MAX,
    DEFAULT_TONE_SETTINGS,
    LIB_EMOJI,
    LIB_TRATAMENTO,
    TONE_AXES_VOZ,
    checkContextoMarca,
    composeTone,
    normalizeToneSettings,
    sanitizeContexto,
    type ToneAviso,
    type ToneEmoji,
    type ToneSettings,
    type ToneTratamento,
} from "@/lib/tone";
import { useOwnerId } from "@/hooks/useOwnerId";

/**
 * Tom de voz dentro do ambiente de teste.
 *
 * "Salvar no teste" grava em `sandbox_sessions` — a próxima mensagem do chat já
 * sai com o inject novo e a IA de produção não muda nada. "Salvar em produção"
 * é o mesmo salvar da aba Tom de voz: aí sim vale para os atendimentos reais.
 */

interface SandboxTonePanelProps {
    sessionId: string | undefined;
    /** jsonb salvo em sandbox_sessions.tone_settings (cópia de trabalho). */
    savedSettings: unknown;
}

export function SandboxTonePanel({ sessionId, savedSettings }: SandboxTonePanelProps) {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();
    const [settings, setSettings] = useState<ToneSettings>(DEFAULT_TONE_SETTINGS);
    const [avisos, setAvisos] = useState<ToneAviso[]>([]);
    const [carregado, setCarregado] = useState(false);

    // Enquanto o cliente não salvou nada no teste, o ponto de partida é o tom de produção
    const { data: producao } = useQuery({
        queryKey: ["sandbox", "tone-producao", ownerId],
        enabled: !!ownerId,
        staleTime: 60_000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("ia_config" as any)
                .select("tone_settings")
                .eq("user_id", ownerId!)
                .maybeSingle();
            if (error) throw error;
            return (data as any)?.tone_settings ?? null;
        },
    });

    useEffect(() => {
        if (carregado) return;
        const base = savedSettings ?? producao;
        if (base) {
            setSettings(normalizeToneSettings(base));
            setCarregado(true);
        }
    }, [savedSettings, producao, carregado]);

    const aplicar = (patch: Partial<ToneSettings>) => {
        const { settings: ajustado, avisos: novos } = composeTone({ ...settings, ...patch });
        setSettings(ajustado);
        setAvisos(novos);
    };

    const avisoDe = (campo: ToneAviso["campo"]) => avisos.find((a) => a.campo === campo)?.texto;

    const contexto = settings.contexto_marca || "";
    const contextoCheck = useMemo(() => checkContextoMarca(contexto), [contexto]);

    const compor = () =>
        composeTone({ ...settings, contexto_marca: sanitizeContexto(contexto) || undefined });

    const salvarNoTeste = useMutation({
        mutationFn: async () => {
            const { settings: final, inject } = compor();
            const { error } = await supabase
                .from("sandbox_sessions" as any)
                .update({
                    tone_settings: final,
                    tone_inject: inject,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", sessionId!);
            if (error) throw error;
            return final;
        },
        onSuccess: (final) => {
            setSettings(final);
            queryClient.invalidateQueries({ queryKey: ["sandbox", "session"] });
            toast.success("Tom salvo no teste — a próxima mensagem já usa este ajuste.");
        },
        onError: (error: any) => {
            console.error("[SandboxTonePanel] erro ao salvar no teste:", error);
            toast.error("Não foi possível salvar o tom no ambiente de teste.");
        },
    });

    const salvarEmProducao = useMutation({
        mutationFn: async () => {
            const { settings: final, inject } = compor();
            const { error } = await supabase.from("ia_config" as any).upsert(
                {
                    user_id: ownerId,
                    tone_settings: final,
                    tone_inject: inject,
                    tone_inject_generated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" },
            );
            if (error) throw error;
            return final;
        },
        onSuccess: (final) => {
            setSettings(final);
            queryClient.invalidateQueries({ queryKey: ["ia-config"] });
            toast.success("Tom publicado em produção: os atendimentos reais já falam assim.");
        },
        onError: (error: any) => {
            console.error("[SandboxTonePanel] erro ao salvar em produção:", error);
            toast.error("Não foi possível publicar o tom em produção.");
        },
    });

    const salvando = salvarNoTeste.isPending || salvarEmProducao.isPending;
    const bloqueado = salvando || contextoCheck.bloqueado;

    return (
        <Card data-tour="sandbox-tom">
            <CardHeader>
                <CardTitle className="text-base">Tom de voz do teste</CardTitle>
                <CardDescription>
                    Mexa nos controles e salve no teste: a próxima mensagem do chat já sai com o
                    novo jeito de falar. A IA de produção só muda quando você publicar.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                    {TONE_AXES_VOZ.map((axis) => (
                        <ToneSlider
                            key={axis}
                            axis={axis}
                            value={settings[axis]}
                            onChange={(v) => aplicar({ [axis]: v } as Partial<ToneSettings>)}
                            aviso={avisoDe(axis)}
                        />
                    ))}
                    <ToneSlider
                        axis="comercial"
                        value={settings.comercial}
                        onChange={(v) => aplicar({ comercial: v })}
                        aviso={avisoDe("comercial")}
                    />

                    <div className="space-y-2">
                        <Label>Tratamento</Label>
                        <Select
                            value={settings.tratamento}
                            onValueChange={(v) => aplicar({ tratamento: v as ToneTratamento })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(["voce", "senhor"] as ToneTratamento[]).map((t) => (
                                    <SelectItem key={t} value={t}>
                                        {LIB_TRATAMENTO[t].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Emoji</Label>
                        <Select
                            value={settings.emoji}
                            onValueChange={(v) => aplicar({ emoji: v as ToneEmoji })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(["nunca", "raro", "natural"] as ToneEmoji[]).map((e) => (
                                    <SelectItem key={e} value={e}>
                                        {LIB_EMOJI[e].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {avisoDe("emoji") && (
                            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>{avisoDe("emoji")}</span>
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Sobre a clínica</Label>
                    <Textarea
                        value={contexto}
                        onChange={(e) => setSettings({ ...settings, contexto_marca: e.target.value })}
                        maxLength={CONTEXTO_MARCA_MAX}
                        rows={2}
                        placeholder="Clínica de dermatologia com 15 anos, público 40+, foco em resultado natural."
                    />
                    <div className="flex items-start justify-between gap-3">
                        <p
                            className={
                                contextoCheck.mensagem
                                    ? "flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500"
                                    : "text-xs text-muted-foreground"
                            }
                        >
                            {contextoCheck.mensagem && (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            )}
                            <span>{contextoCheck.mensagem || "Opcional."}</span>
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                            {contexto.length}/{CONTEXTO_MARCA_MAX}
                        </span>
                    </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                    <Button
                        variant="outline"
                        onClick={() => salvarNoTeste.mutate()}
                        disabled={bloqueado || !sessionId}
                    >
                        {salvarNoTeste.isPending
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            : <Save className="mr-2 h-4 w-4" />}
                        Salvar no teste
                    </Button>
                    <Button
                        onClick={() => salvarEmProducao.mutate()}
                        disabled={bloqueado || !ownerId}
                    >
                        {salvarEmProducao.isPending
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            : <Rocket className="mr-2 h-4 w-4" />}
                        Salvar em produção
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
