import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Send, Paperclip, Smile, Sparkles, CheckCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useSendMessage } from "@/hooks/useSendMessage";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface ConversationChatModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contactId: string;
    contactName: string;
}

/**
 * Controlled modal for viewing and sending messages in queue conversations
 */
export function ConversationChatModal({
    open,
    onOpenChange,
    contactId,
    contactName,
}: ConversationChatModalProps) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [message, setMessage] = useState("");
    const [isEmojiOpen, setIsEmojiOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const sendMessageMutation = useSendMessage();
    const { data: ownerId } = useOwnerId();

    // Get active conversation ID
    const { data: activeConversationId } = useQuery({
        queryKey: ["active-conversation-id", contactId, ownerId],
        queryFn: async () => {
            if (!ownerId) return null;

            const { data, error } = await supabase
                .from("conversations")
                .select("id")
                .eq("contact_id", contactId)
                .eq("user_id", ownerId)
                .in("status", ["open", "pending"])
                .limit(1);

            if (error) return null;
            return data && data.length > 0 ? data[0].id : null;
        },
        enabled: !!contactId && !!ownerId && open,
    });

    // Fetch messages
    const { data: messages, isLoading } = useQuery({
        queryKey: ["deal-messages", activeConversationId],
        queryFn: async () => {
            if (!activeConversationId) return [];

            const { data, error } = await supabase
                .from("messages")
                .select("*")
                .eq("conversation_id", activeConversationId)
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data;
        },
        enabled: !!activeConversationId && open,
    });

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [message]);

    // Track modal opens to force scroll every time
    const [modalOpenCount, setModalOpenCount] = useState(0);

    useEffect(() => {
        if (open) {
            setModalOpenCount(prev => prev + 1);
        }
    }, [open]);

    // Auto-scroll to bottom when messages change or modal opens
    useEffect(() => {
        if (scrollContainerRef.current && messages && messages.length > 0 && open) {
            setTimeout(() => {
                if (scrollContainerRef.current) {
                    const scrollElement = scrollContainerRef.current.querySelector('[data-radix-scroll-area-viewport]');
                    if (scrollElement) {
                        scrollElement.scrollTop = scrollElement.scrollHeight;
                    }
                }
            }, 100);
        }
    }, [messages, open, modalOpenCount]);

    // Real-time subscription
    useEffect(() => {
        if (!activeConversationId || !open) return;

        const channel = supabase
            .channel(`queue-modal-${activeConversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `conversation_id=eq.${activeConversationId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["deal-messages", activeConversationId] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConversationId, open, queryClient]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleEmojiClick = (emojiData: EmojiClickData) => {
        setMessage((prev) => prev + emojiData.emoji);
        setIsEmojiOpen(false);
    };

    const handleSend = async () => {
        if (!message.trim() && !selectedFile) return;
        if (!activeConversationId) {
            toast.error("Nenhuma conversa ativa encontrada");
            return;
        }

        try {
            if (selectedFile) {
                setIsUploading(true);
                // Handle file upload logic here if needed
                setIsUploading(false);
            }

            await sendMessageMutation.mutateAsync({
                conversationId: activeConversationId,
                message: message.trim(),
            });

            setMessage("");
            setSelectedFile(null);
            queryClient.invalidateQueries({ queryKey: ["deal-messages", activeConversationId] });
        } catch (error) {
            console.error("Error sending message:", error);
            toast.error("Erro ao enviar mensagem");
        }
    };

    const handleAiAction = async (action: 'generate' | 'fix' | 'improve') => {
        toast.info(`Ação de IA: ${action} (em desenvolvimento)`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex justify-between items-center">
                        <span>Conversa com {contactName}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                navigate(`/?conversationId=${activeConversationId}`);
                                onOpenChange(false);
                            }}
                            disabled={!activeConversationId}
                        >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Ir para Inbox
                        </Button>
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea ref={scrollContainerRef} className="flex-1 p-4 border rounded-md bg-muted/10">
                    {isLoading ? (
                        <div className="flex justify-center p-4">Carregando mensagens...</div>
                    ) : messages && messages.length > 0 ? (
                        <div className="space-y-4">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex flex-col max-w-[80%] ${msg.direction === 'outbound'
                                        ? 'ml-auto items-end'
                                        : 'mr-auto items-start'
                                        }`}
                                >
                                    <div
                                        className={`p-3 rounded-lg break-words overflow-hidden ${msg.direction === 'outbound'
                                            ? 'bg-[#DCF7C5] text-gray-800 dark:bg-primary dark:text-primary-foreground'
                                            : 'bg-white dark:bg-secondary text-gray-800 dark:text-foreground'
                                            }`}
                                        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                    >
                                        <p className="text-sm break-words whitespace-pre-wrap">{msg.body}</p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground mt-1">
                                        {format(new Date(msg.created_at), "dd/MM HH:mm")}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground p-4">
                            Nenhuma mensagem encontrada.
                        </div>
                    )}
                </ScrollArea>

                {/* Input Area */}
                <div className="p-4 border-t border-border">
                    {selectedFile && (
                        <div className="mb-2 p-2 bg-muted rounded-md flex items-center justify-between">
                            <span className="text-sm truncate max-w-[200px]">{selectedFile.name}</span>
                            <Button variant="ghost" size="sm" onClick={handleRemoveFile}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    )}

                    <div className="flex gap-2 items-center">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                        <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={!activeConversationId}>
                            <Paperclip className="w-5 h-5" />
                        </Button>

                        <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" disabled={!activeConversationId}>
                                    <Smile className="w-5 h-5" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0 border-none">
                                <EmojiPicker onEmojiClick={handleEmojiClick} />
                            </PopoverContent>
                        </Popover>

                        <Textarea
                            ref={textareaRef}
                            placeholder={activeConversationId ? "Digite sua mensagem..." : "Nenhuma conversa ativa"}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            rows={1}
                            className="flex-1 min-h-[40px] max-h-[200px] resize-none py-3"
                            disabled={isUploading || !activeConversationId}
                        />

                        {!message.trim() ? (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleAiAction('generate')}
                                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 hover:opacity-90"
                                disabled={!activeConversationId}
                            >
                                <Sparkles className="w-5 h-5" />
                            </Button>
                        ) : (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 hover:opacity-90"
                                        disabled={!activeConversationId}
                                    >
                                        <Sparkles className="w-5 h-5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleAiAction('fix')}>
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Correção ortográfica
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAiAction('improve')}>
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Melhorar a frase
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        <Button
                            onClick={handleSend}
                            disabled={(!message.trim() && !selectedFile) || sendMessageMutation.isPending || isUploading || !activeConversationId}
                        >
                            {isUploading ? "..." : <Send className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
