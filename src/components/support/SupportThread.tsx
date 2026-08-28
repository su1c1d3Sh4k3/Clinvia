import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { chatDateTime, chatDayLabel, isSameChatDay } from "@/lib/chatDates";
import { FormattedText } from "@/components/chat/FormattedText";
import { useSendTicketMessage, useTicketMessages } from "@/hooks/useSupportChat";
import type { SupportTicket } from "@/types/support";

interface SupportThreadProps {
    ticket: SupportTicket;
    senderName: string;
}

/**
 * Conversa de um chamado, do lado do cliente — usada no widget flutuante e na
 * página /support (mesma fonte de renderização para as duas telas).
 */
export function SupportThread({ ticket, senderName }: SupportThreadProps) {
    const [draft, setDraft] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const { data: messages = [], isLoading } = useTicketMessages(ticket.id);
    const sendMessage = useSendTicketMessage();

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, ticket.id]);

    const handleSend = async () => {
        const body = draft.trim();
        if (!body) return;
        try {
            await sendMessage.mutateAsync({ ticketId: ticket.id, body, senderName });
            setDraft("");
        } catch (error: any) {
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
                                <div className={cn("flex mb-2", isMine ? "justify-end" : "justify-start")}>
                                    <div className="max-w-[80%]">
                                        <div
                                            className={cn(
                                                "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                                                isMine
                                                    ? "bg-[#0175EC] text-white"
                                                    : "bg-muted text-foreground border"
                                            )}
                                        >
                                            <FormattedText text={m.body} />
                                        </div>
                                        <p
                                            className={cn(
                                                "text-[10px] text-muted-foreground mt-0.5",
                                                isMine ? "text-right" : "text-left"
                                            )}
                                        >
                                            {isMine ? m.sender_name : `Suporte · ${m.sender_name}`} ·{" "}
                                            {chatDateTime(m.created_at)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })
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
                    placeholder="Escreva sua mensagem..."
                    rows={2}
                    className="resize-none"
                />
                <Button
                    onClick={handleSend}
                    disabled={!draft.trim() || sendMessage.isPending}
                    className="h-[60px] px-4 bg-[#0175EC] hover:bg-[#0165cc] text-white"
                >
                    <Send className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
