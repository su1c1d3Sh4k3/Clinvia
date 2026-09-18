import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Eraser, Loader2, Megaphone, Send, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FormattedText } from "@/components/chat/FormattedText";
import { cn } from "@/lib/utils";
import type { SandboxMessage } from "@/hooks/useSandbox";

/**
 * Chat do ambiente de teste.
 *
 * Quem digita é o PACIENTE fictício (balão à direita); a IA responde à esquerda
 * assim que o fluxo do n8n chamar `api-send-message-sandbox`. Por isso a lista
 * fica em polling curto enquanto a resposta não chega.
 *
 * LIMPAR não é uma mensagem: manda o gatilho para o fluxo esvaziar a memória do
 * Redis e corta o histórico que a IA enxerga daqui pra frente.
 */

const HORA = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
});

interface SandboxChatProps {
    mensagens: SandboxMessage[];
    carregando: boolean;
    aguardandoResposta: boolean;
    enviando: boolean;
    agendaMode: "real" | "livre";
    onEnviar: (texto: string) => void;
    onLimpar: () => void;
    onTrocarAgenda: (modo: "real" | "livre") => void;
    pacienteNome: string;
}

export function SandboxChat({
    mensagens,
    carregando,
    aguardandoResposta,
    enviando,
    agendaMode,
    onEnviar,
    onLimpar,
    onTrocarAgenda,
    pacienteNome,
}: SandboxChatProps) {
    const [texto, setTexto] = useState("");
    const fimRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fimRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [mensagens.length, aguardandoResposta]);

    const enviar = () => {
        const limpo = texto.trim();
        if (!limpo) return;
        if (limpo.toUpperCase() === "LIMPAR") {
            toast.info("Use o botão Limpar memória para reiniciar o contexto da IA.");
            return;
        }
        onEnviar(limpo);
        setTexto("");
    };

    return (
        <Card className="flex flex-col h-[640px]" data-tour="sandbox-chat">
            <CardHeader className="shrink-0 flex-row items-center justify-between gap-3 space-y-0 border-b py-3">
                <div className="min-w-0">
                    <CardTitle className="text-base truncate">
                        Conversa com {pacienteNome}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Nada sai por WhatsApp: as mensagens vivem só neste ambiente.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Select
                        value={agendaMode}
                        onValueChange={(v) => onTrocarAgenda(v as "real" | "livre")}
                    >
                        <SelectTrigger className="h-8 w-[168px] text-xs" data-tour="sandbox-agenda">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="real">Agenda Real</SelectItem>
                            <SelectItem value="livre">Agenda Liberada</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={onLimpar} disabled={enviando}>
                        <Eraser className="mr-1.5 h-3.5 w-3.5" />
                        Limpar memória
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto space-y-3 py-4">
                {carregando && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                )}

                {!carregando && mensagens.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                        <Bot className="h-8 w-8 opacity-40" />
                        <p>Escreva como se fosse o paciente e veja a IA responder.</p>
                    </div>
                )}

                {mensagens.map((m) => {
                    if (m.role === "system") {
                        return (
                            <div key={m.id} className="flex justify-center">
                                <div className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                                    {m.content}
                                </div>
                            </div>
                        );
                    }

                    const doPaciente = m.role === "user";
                    const simulado = !doPaciente && m.message_type !== "text";

                    return (
                        <div
                            key={m.id}
                            className={cn(
                                "flex gap-2",
                                doPaciente ? "justify-end" : "justify-start",
                            )}
                        >
                            {!doPaciente && (
                                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    {simulado
                                        ? <Megaphone className="h-3.5 w-3.5" />
                                        : <Bot className="h-3.5 w-3.5" />}
                                </div>
                            )}
                            <div
                                className={cn(
                                    "max-w-[78%] rounded-lg px-3 py-2 text-sm",
                                    doPaciente
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted",
                                )}
                            >
                                {simulado && (
                                    <Badge variant="secondary" className="mb-1.5 text-[10px]">
                                        {m.message_type === "template"
                                            ? "Mensagem automática"
                                            : "Campanha"}
                                    </Badge>
                                )}
                                <div className="whitespace-pre-wrap break-words">
                                    <FormattedText text={m.content} />
                                </div>
                                <div
                                    className={cn(
                                        "mt-1 text-[10px]",
                                        doPaciente
                                            ? "text-primary-foreground/70"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {HORA.format(new Date(m.created_at))}
                                </div>
                            </div>
                            {doPaciente && (
                                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                                    <User className="h-3.5 w-3.5" />
                                </div>
                            )}
                        </div>
                    );
                })}

                {aguardandoResposta && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        A IA está pensando...
                    </div>
                )}

                <div ref={fimRef} />
            </CardContent>

            <div className="shrink-0 border-t p-3">
                <div className="flex items-end gap-2">
                    <Textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                enviar();
                            }
                        }}
                        rows={2}
                        placeholder="Escreva como o paciente falaria..."
                        className="resize-none"
                    />
                    <Button onClick={enviar} disabled={enviando || !texto.trim()} size="icon">
                        {enviando
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Send className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
        </Card>
    );
}
