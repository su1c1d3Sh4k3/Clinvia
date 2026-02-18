import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface BiaChatWindowProps {
    isOpen: boolean;
    onClose: () => void;
    messages: ChatMessage[];
    isLoading: boolean;
    onSendMessage: (message: string) => void;
    onClearHistory: () => void;
}

export const BiaChatWindow = ({
    isOpen,
    onClose,
    messages,
    isLoading,
    onSendMessage,
    onClearHistory
}: BiaChatWindowProps) => {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Markdown rendering seguro — escapa HTML primeiro, depois processa markdown
    const formatMessageContent = (content: string): string => {
        // 1. Escape HTML para segurança (anti-XSS)
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 2. Inline code `código`
        formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);padding:1px 4px;border-radius:3px;font-size:0.85em">$1</code>');

        // 3. Negrito **texto**
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // 4. Itálico *texto*
        formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // 5. Headers ### → bold (simplificado para chat)
        formatted = formatted.replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>');

        // 6. Bullet lists (- item ou • item)
        formatted = formatted.replace(/^[-•]\s+(.+)$/gm, '  • $1');

        // 7. Numbered lists (1. item)
        formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, (match) => `  ${match}`);

        // 8. Links [texto](url) (abre em nova aba)
        formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#0175EC;text-decoration:underline">$1</a>');

        return formatted;
    };

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input.trim());
            setInput("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className={cn(
                "fixed bottom-20 right-4 z-50 w-[380px] h-[500px] rounded-2xl overflow-hidden",
                "flex flex-col shadow-2xl",
                "animate-in slide-in-from-bottom-5 duration-300",
                // Cores do inbox - modo claro
                "bg-[#F8FAFC] dark:bg-[hsl(var(--background))]",
                "border border-gray-200 dark:border-gray-800"
            )}
            style={{
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)'
            }}
        >
            {/* Header */}
            <div className="bg-[#0175EC] text-white px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-base">Bia</h3>
                        <p className="text-xs text-white/80">Assistente de suporte Clinbia</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClearHistory}
                        className="px-3 py-1.5 text-xs font-medium bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                    >
                        LIMPAR
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                        <Sparkles className="w-12 h-12 mb-4 text-[#0175EC] opacity-50" />
                        <p className="font-medium text-gray-700 dark:text-gray-300">Olá! Sou a Bia 👋</p>
                        <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">
                            Tô aqui pra te ajudar com a plataforma!
                        </p>
                        <p className="text-xs mt-3 text-gray-400 dark:text-gray-500">
                            Pode mandar sua dúvida que eu te ajudo 💬
                        </p>
                    </div>
                ) : (
                    <>
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={cn(
                                    "flex",
                                    message.role === 'user' ? "justify-end" : "justify-start"
                                )}
                            >
                                <div
                                    className={cn(
                                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                                        message.role === 'user'
                                            ? "bg-[#0175EC] text-white rounded-br-md"
                                            : "bg-white dark:bg-[hsl(var(--card))] text-gray-800 dark:text-gray-200 rounded-bl-md border border-gray-100 dark:border-gray-800 shadow-sm"
                                    )}
                                >
                                    <p
                                        className="whitespace-pre-wrap leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }}
                                    />
                                    <span
                                        className={cn(
                                            "text-[10px] mt-1 block",
                                            message.role === 'user' ? "text-white/70" : "text-gray-400"
                                        )}
                                    >
                                        {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100 dark:border-gray-800 shadow-sm">
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 bg-[#0175EC] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-[#0175EC] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-[#0175EC] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Input Area */}
            <form
                onSubmit={handleSubmit}
                className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[hsl(var(--card))] shrink-0"
            >
                <div className="flex items-center gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite sua dúvida..."
                        disabled={isLoading}
                        className={cn(
                            "flex-1 px-4 py-2.5 rounded-full text-sm",
                            "bg-gray-100 dark:bg-gray-800",
                            "border-0 focus:outline-none focus:ring-2 focus:ring-[#0175EC]",
                            "placeholder:text-gray-400 dark:placeholder:text-gray-500",
                            "text-gray-800 dark:text-gray-200",
                            "disabled:opacity-50"
                        )}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            "bg-[#0175EC] text-white",
                            "hover:bg-[#0165CC] transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};
