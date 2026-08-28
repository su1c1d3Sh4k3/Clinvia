import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, CalendarDays, Sparkles, Headphones, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { chatDateTime, chatDayLabel, isSameChatDay } from "@/lib/chatDates";
import { FormattedText } from "@/components/chat/FormattedText";
import { useSendTicketMessage, useSendToAi, useTicketMessages } from "@/hooks/useSupportChat";
import type { SupportTicket } from "@/types/support";

interface SupportThreadProps {
    ticket: SupportTicket;
    senderName: string;
}

/**
 * Conversa de um chamado, do lado do cliente — usada no widget flutuante e na
 * página /support (mesma fonte de renderização para as duas telas).
 *
 * Enquanto handled_by = 'ai' a mensagem vai pela edge fn support-ai-chat (que
 * responde na hora); depois da transferência o insert é direto via RLS e a
 * resposta chega pelo realtime.
 */
export function SupportThread({ ticket, senderName }: SupportThreadProps) {
    const [draft, setDraft] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const { data: messages = [], isLoading } = useTicketMessages(ticket.id);
    const sendMessage = useSendTicketMessage();
    const sendToAi = useSendToAi();

    const withAi = ticket.handled_by === "ai";
    const isSending = sendMessage.isPending || sendToAi.isPending;

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, ticket.id, sendToAi.isPending]);

    const handleSend = async () => {
        const body = draft.trim();
        if (!body || isSending) return;
        setDraft("");
        try {
            if (withAi) {
                await sendToAi.mutateAsync({ ticketId: ticket.id, message: body });
            } else {
                await sendMessage.mutateAsync({ ticketId: ticket.id, body, senderName });
            }
        } catch (error: any) {
            setDraft(body);
            toast.error(error.message || "Não foi possível enviar a mensagem");
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {isLoading ? (
                    <p className="text-center text-sm text-muted-foreground py-6">Carregando...</p>
                ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">
                        Nenhuma mensagem ainda
                    </p>
                ) : (
                    messages.map((m, i) => {
                        const prev = messages[i - 1];
                        const showDay = !prev || !isSameChatDay(prev.created_at, m.created_at);
                        const isMine = m.sender_type === "client";
                        const isAi = m.sender_type === "ai";
                        // A pill de transferência entra antes da 1ª mensagem do suporte humano
                        const showTransfer =
                            !!ticket.transferred_at &&
                            m.sender_type === "support" &&
                            !messages.slice(0, i).some((p) => p.sender_type === "support");
                        return (
                            <div key={m.id}>
                                {showDay && (
                                    <div className="flex justify-center my-3">
                                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted border rounded-full px-3 py-1">
                                            <CalendarDays className="w-3 h-3" />
                                            {chatDayLabel(m.created_at)}
                                        </span>
                                    </div>
                                )}
                                {showTransfer && (
                                    <div className="flex justify-center my-3">
                                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted border rounded-full px-3 py-1">
                                            <ArrowRightLeft className="w-3 h-3" />
                                            Atendimento assumido pela equipe de suporte
                                        </span>
                                    </div>
                                )}
                                <div className={cn("flex mb-2", isMine ? "justify-end" : "justify-start")}>
                                    <div className="max-w-[80%]">
                                        <div
                                            className={cn(
                                                "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                                                isMine
                                                    ? "bg-[#0175EC] text-white"
                                                    : isAi
                                                      ? "bg-violet-50 dark:bg-violet-950/40 text-foreground border border-violet-200 dark:border-violet-900"
                                                      : "bg-muted text-foreground border"
                                            )}
                                        >
                                            <FormattedText text={m.body} />
                                        </div>
                                        <p
                                            className={cn(
                                                "flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5",
                                                isMine ? "justify-end" : "justify-start"
                                            )}
                                        >
                                            {!isMine &&
                                                (isAi ? (
                                                    <Sparkles className="w-3 h-3 text-violet-500" />
                                                ) : (
                                                    <Headphones className="w-3 h-3" />
                                                ))}
                                            <span>
                                                {isMine
                                                    ? m.sender_name
                                                    : isAi
                                                      ? "Assistente Clinvia"
                                                      : `Suporte · ${m.sender_name}`}{" "}
                                                · {chatDateTime(m.created_at)}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}

                {sendToAi.isPending && (
                    <div className="flex justify-start mb-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900 rounded-lg px-3 py-2">
                            <Sparkles className="w-3 h-3 text-violet-500 animate-pulse" />
                            assistente digitando...
                        </span>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t shrink-0 flex gap-2 items-end">
                <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={withAi ? "Pergunte ao assistente..." : "Escreva sua mensagem..."}
                    rows={2}
                    className="resize-none"
                />
                <Button
                    onClick={handleSend}
                    disabled={!draft.trim() || isSending}
                    className="h-[60px] px-4 bg-[#0175EC] hover:bg-[#0165cc] text-white"
                >
                    <Send className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
