import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, MessageSquare, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Smile, Mic, Sparkles, CheckCircle, X } from "lucide-react";
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

interface DealConversationModalProps {
    contactId: string;
    contactName: string;
}

export function DealConversationModal({ contactId, contactName }: DealConversationModalProps) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [message, setMessage] = useState("");
    const [isEmojiOpen, setIsEmojiOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const sendMessageMutation = useSendMessage();

    // Check for active tickets to enable/disable button and get conversation ID
    const { data: activeConversationId } = useQuery({
        queryKey: ["active-conversation-id", contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("conversations")
                .select("id")
                .eq("contact_id", contactId)
                .in("status", ["open", "pending"])
                .limit(1);

            if (error) return null;
            return data && data.length > 0 ? data[0].id : null;
        },
        enabled: !!contactId,
    });

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [message]);

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

    const handleAiAction = async (action: 'fix' | 'improve' | 'generate') => {
        toast.info("Funcionalidade de IA em desenvolvimento");
    };

    const handleSend = async () => {
        if ((!message.trim() && !selectedFile) || !activeConversationId) return;

        try {
            setIsUploading(true);
            let mediaUrl = undefined;
            let messageType: "text" | "image" | "audio" | "video" | "document" = "text";

            if (selectedFile) {
                const fileExt = selectedFile.name.split(".").pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const { error: uploadError, data } = await supabase.storage
                    .from("chat-media")
                    .upload(fileName, selectedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from("chat-media")
                    .getPublicUrl(fileName);

                mediaUrl = publicUrl;

                if (selectedFile.type.startsWith("image/")) messageType = "image";
                else if (selectedFile.type.startsWith("audio/")) messageType = "audio";
                else if (selectedFile.type.startsWith("video/")) messageType = "video";
                else messageType = "document";
            }

            await sendMessageMutation.mutateAsync({
                conversationId: activeConversationId,
                body: message,
                mediaUrl,
                messageType,
                direction: "outbound",
            });

            setMessage("");
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            toast.success("Mensagem enviada!");
            queryClient.invalidateQueries({ queryKey: ["deal-messages", contactId] });
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
            toast.error("Erro ao enviar mensagem");
        } finally {
            setIsUploading(false);
        }
    };

    const { data: messages, isLoading } = useQuery({
        queryKey: ["deal-messages", contactId],
        queryFn: async () => {
            // Fetch messages for this contact (limit to last 50)
            const { data, error } = await supabase
                .from("messages")
                .select("*, conversations!inner(contact_id)")
                .eq("conversations.contact_id", contactId)
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            return data.reverse(); // Show oldest first
        },
        enabled: !!contactId,
    });

    // Real-time subscription
    useEffect(() => {
        if (!activeConversationId) return;

        const channel = supabase
            .channel(`deal-messages-${activeConversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `conversation_id=eq.${activeConversationId}`,
                },
                (payload) => {
                    console.log("New message received in deal modal:", payload);
                    queryClient.invalidateQueries({ queryKey: ["deal-messages", contactId] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConversationId, contactId, queryClient]);



    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-black dark:text-muted-foreground" title="Ver Conversa" disabled={!activeConversationId}>
                    <Eye className="h-3 w-3" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex justify-between items-center">
                        <span>Conversa com {contactName}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/?conversationId=${activeConversationId}`)}
                            className="ml-4"
                            disabled={!activeConversationId}
                        >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Ir para Inbox
                        </Button>
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 p-4 border rounded-md bg-muted/10">
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
                                        className={`p-3 rounded-lg ${msg.direction === 'outbound'
                                            ? 'bg-[#DCF7C5] text-gray-800 dark:bg-primary dark:text-primary-foreground'
                                            : 'bg-white dark:bg-secondary text-gray-800 dark:text-foreground'
                                            }`}
                                    >
                                        <p className="text-sm">{msg.body}</p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground mt-1">
                                        {format(new Date(msg.created_at), "dd/MM HH:mm")}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground p-4">
                            Nenhuma mensagem recente encontrada.
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
                            className="flex-1 min-h-[40px] max-h-[200px] resize-none py-3 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent"
                            disabled={isUploading || !activeConversationId}
                        />

                        <Button variant="ghost" size="icon" disabled={!activeConversationId}>
                            <Mic className="w-5 h-5" />
                        </Button>

                        {!message.trim() ? (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleAiAction('generate')}
                                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 hover:opacity-90 transition-all duration-300"
                                title="Gerar resposta com IA"
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
                                        className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 hover:opacity-90 transition-all duration-300"
                                        title="Opções de IA"
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
        </Dialog >
    );
}
