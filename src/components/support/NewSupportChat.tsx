import { useState } from "react";
import { toast } from "sonner";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSendToAi } from "@/hooks/useSupportChat";

interface NewSupportChatProps {
    /** Recebe o id do chamado criado pela 1ª mensagem. */
    onCreated: (ticketId: string) => void;
}

const EXAMPLES = [
    "Como faço uma campanha?",
    "Onde vejo o relatório de agendamentos?",
    "Como transfiro um atendimento?",
];

/**
 * Tela de boas-vindas do assistente: não há formulário de chamado — o ticket
 * nasce na 1ª mensagem (a edge fn support-ai-chat cria e dá título).
 * Compartilhada pelo widget flutuante e pela página /support.
 */
export function NewSupportChat({ onCreated }: NewSupportChatProps) {
    const [draft, setDraft] = useState("");
    const sendToAi = useSendToAi();

    const send = async (text: string) => {
        const message = text.trim();
        if (!message || sendToAi.isPending) return;
        try {
            const result = await sendToAi.mutateAsync({ message });
            setDraft("");
            onCreated(result.ticket_id);
        } catch (error: any) {
            toast.error(error.message || "Não foi possível falar com o assistente");
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
                <div className="text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center mx-auto">
                        <Sparkles className="w-6 h-6 text-violet-500" />
                    </div>
                    <p className="font-medium text-sm">Assistente Clinvia</p>
                    <p className="text-xs text-muted-foreground px-2">
                        Conheço o manual inteiro do sistema e respondo na hora. Se eu não resolver,
                        encaminho para a equipe de suporte sem você precisar repetir nada.
                    </p>
                </div>

                <div className="mt-5 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground text-center">Exemplos</p>
                    {EXAMPLES.map((ex) => (
                        <button
                            key={ex}
                            onClick={() => send(ex)}
                            disabled={sendToAi.isPending}
                            className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted/60 transition-colors disabled:opacity-50"
                        >
                            {ex}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-3 border-t shrink-0 flex gap-2 items-end">
                <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send(draft);
                        }
                    }}
                    placeholder="Qual é a sua dúvida?"
                    rows={2}
                    className="resize-none"
                />
                <Button
                    onClick={() => send(draft)}
                    disabled={!draft.trim() || sendToAi.isPending}
                    className="h-[60px] px-4 bg-[#0175EC] hover:bg-[#0165cc] text-white"
                >
                    <Send className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
