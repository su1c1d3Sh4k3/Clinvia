import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
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
import { ToneReferencePreview } from "./ToneReferencePreview";
import { ToneSlider } from "./ToneSlider";
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

const NAO_MUDA = [
    "O formato continua o mesmo: no máximo 20 palavras por linha, texto puro, sem caixa alta no nome do procedimento.",
    "As travas, o fluxo do atendimento e os limites de compliance não mudam com o tom.",
    "Recusa direta e pedido de descadastro encerram a conversa na hora, em qualquer abordagem.",
    "O tom vale para a conta inteira: todas as conexões falam do mesmo jeito.",
];

interface ToneTabProps {
    ownerId?: string;
    /** jsonb salvo em ia_config.tone_settings. */
    savedSettings?: unknown;
}

export function ToneTab({ ownerId, savedSettings }: ToneTabProps) {
    const queryClient = useQueryClient();
    const [settings, setSettings] = useState<ToneSettings>(DEFAULT_TONE_SETTINGS);
    const [avisos, setAvisos] = useState<ToneAviso[]>([]);

    useEffect(() => {
        if (savedSettings) setSettings(normalizeToneSettings(savedSettings));
    }, [savedSettings]);

    /**
     * As regras de combinação corrigem o valor NA TELA: o controle afetado se move
     * sozinho e o aviso aparece embaixo dele.
     */
    const aplicar = (patch: Partial<ToneSettings>) => {
        const { settings: ajustado, avisos: novos } = composeTone({ ...settings, ...patch });
        setSettings(ajustado);
        setAvisos(novos);
    };

    const avisoDe = (campo: ToneAviso["campo"]) => avisos.find((a) => a.campo === campo)?.texto;

    const contexto = settings.contexto_marca || "";
    const contextoCheck = useMemo(() => checkContextoMarca(contexto), [contexto]);

    const salvar = useMutation({
        mutationFn: async () => {
            const { settings: final, inject } = composeTone({
                ...settings,
                contexto_marca: sanitizeContexto(contexto) || undefined,
            });

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
            toast.success("Tom de voz salvo!");
        },
        onError: (error: any) => {
            console.error("[ToneTab] Error saving tone:", error);
            toast.error("Erro ao salvar o tom de voz");
        },
    });

    return (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <div className="space-y-4">
                <Card data-tour="tom-voz">
                    <CardHeader>
                        <CardTitle>Como a IA fala</CardTitle>
                        <CardDescription>
                            Cada controle muda o jeito de escrever, nunca o que a IA pode ou não
                            fazer. A conversa ao lado mostra o resultado na hora.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {TONE_AXES_VOZ.map((axis) => (
                            <ToneSlider
                                key={axis}
                                axis={axis}
                                value={settings[axis]}
                                onChange={(v) => aplicar({ [axis]: v } as Partial<ToneSettings>)}
                                aviso={avisoDe(axis)}
                            />
                        ))}

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Tratamento</Label>
                                <Select
                                    value={settings.tratamento}
                                    onValueChange={(v) =>
                                        aplicar({ tratamento: v as ToneTratamento })
                                    }
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
                                <p className="text-xs text-muted-foreground">
                                    Vale para a conversa inteira, sem misturar as duas formas.
                                </p>
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
                                {avisoDe("emoji") ? (
                                    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                        <span>{avisoDe("emoji")}</span>
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        {LIB_EMOJI[settings.emoji].instrucao}
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card data-tour="tom-comercial">
                    <CardHeader>
                        <CardTitle>Abordagem comercial</CardTitle>
                        <CardDescription>
                            O único controle que muda comportamento: quantas vezes a IA tenta
                            depois que o cliente recua.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ToneSlider
                            axis="comercial"
                            value={settings.comercial}
                            onChange={(v) => aplicar({ comercial: v })}
                            aviso={avisoDe("comercial")}
                        />
                    </CardContent>
                </Card>

                <Card data-tour="tom-marca">
                    <CardHeader>
                        <CardTitle>Sobre a clínica</CardTitle>
                        <CardDescription>
                            Uma descrição curta para dar contexto. Não é instrução: a IA não
                            promete nem oferece nada com base neste campo.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Textarea
                            value={contexto}
                            onChange={(e) =>
                                setSettings({ ...settings, contexto_marca: e.target.value })
                            }
                            maxLength={CONTEXTO_MARCA_MAX}
                            rows={3}
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
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                <Card>
                    <CardHeader>
                        <CardTitle>Conversa de referência</CardTitle>
                        <CardDescription>
                            Um exemplo de como a IA escreve com esta configuração. Não é um roteiro:
                            a IA continua respondendo ao que o cliente disser.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ToneReferencePreview settings={settings} />
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <Accordion type="single" collapsible>
                            <AccordionItem value="nao-muda" className="border-none">
                                <AccordionTrigger className="py-0 text-sm">
                                    O que o tom não muda
                                </AccordionTrigger>
                                <AccordionContent className="pt-3">
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                        {NAO_MUDA.map((t) => (
                                            <li key={t}>{t}</li>
                                        ))}
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button
                        onClick={() => salvar.mutate()}
                        disabled={salvar.isPending || contextoCheck.bloqueado || !ownerId}
                    >
                        {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar
                    </Button>
                </div>
            </div>
        </div>
    );
}
