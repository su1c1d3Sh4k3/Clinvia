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
import { MessageSquare, X, Send, Paperclip, Smile, Sparkles, CheckCircle, Mic, StopCircle, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { MessageBubble } from "@/components/MessageBubble";
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

    // Audio Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

    // Fetch conversation details (to check for Instagram/WhatsApp channel)
    const { data: conversation } = useQuery({
        queryKey: ["conversation-details", activeConversationId],
        queryFn: async () => {
            if (!activeConversationId) return null;
            const { data, error } = await supabase
                .from("conversations")
                .select("*")
                .eq("id", activeConversationId)
                .single();
            if (error) return null;
            return data;
        },
        enabled: !!activeConversationId
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

    const uploadFile = async (file: File): Promise<string | null> => {
        try {
            const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileName = `${Date.now()}_${safeName}`;
            const filePath = fileName;

            const { error: uploadError } = await supabase.storage
                .from('media')
                .upload(filePath, file, {
                    contentType: file.type,
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('media')
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error) {
            console.error('Error uploading file:', error);
            toast.error("Erro ao fazer upload do arquivo");
            return null;
        }
    };

    // Start audio recording
    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Detect if this is an Instagram conversation
            const conversationChannel = (conversation as any)?.channel;
            const isInstagram = conversationChannel === 'instagram';

            let mimeType = 'audio/webm;codecs=opus';
            let fileExtension = 'webm';

            if (isInstagram) {
                if (MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')) {
                    mimeType = 'audio/mp4;codecs=mp4a.40.2';
                    fileExtension = 'm4a';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                    fileExtension = 'm4a';
                } else if (MediaRecorder.isTypeSupported('audio/wav')) {
                    mimeType = 'audio/wav';
                    fileExtension = 'wav';
                }
            } else {
                if (MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')) {
                    mimeType = 'audio/mp4;codecs=mp4a.40.2';
                    fileExtension = 'm4a';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                    fileExtension = 'm4a';
                }
            }

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const baseMimeType = mimeType.split(';')[0];
                const audioBlob = new Blob(audioChunksRef.current, { type: baseMimeType });
                const audioFile = new File([audioBlob], `audio_${Date.now()}.${fileExtension}`, { type: baseMimeType });
                setSelectedFile(audioFile);

                stream.getTracks().forEach(track => track.stop());

                if (recordingIntervalRef.current) {
                    clearInterval(recordingIntervalRef.current);
                    recordingIntervalRef.current = null;
                }
                setRecordingTime(0);
            };

            mediaRecorder.start(100);
            setIsRecording(true);
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            toast.success("Gravação iniciada");
        } catch (error) {
            console.error("Error starting recording:", error);
            toast.error("Erro ao acessar microfone. Verifique as permissões.");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            // toast.success("Áudio gravado!"); // Optional feedback
        }
    };

    const handleCancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            setSelectedFile(null); // Ensure no file is selected
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
                recordingIntervalRef.current = null;
            }
            setRecordingTime(0);
            toast.info("Gravação cancelada");
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSend = async () => {
        if (!message.trim() && !selectedFile) return;
        if (!activeConversationId) {
            toast.error("Nenhuma conversa ativa encontrada");
            return;
        }

        try {
            let mediaUrl: string | undefined = undefined;
            let messageType: "text" | "image" | "audio" | "video" | "document" = "text";

            if (selectedFile) {
                setIsUploading(true);
                const url = await uploadFile(selectedFile);
                if (!url) {
                    setIsUploading(false);
                    return;
                }
                mediaUrl = url;

                if (selectedFile.type.startsWith('image/')) messageType = 'image';
                else if (selectedFile.type.startsWith('audio/')) messageType = 'audio';
                else if (selectedFile.type.startsWith('video/')) messageType = 'video';
                else messageType = 'document';

                setIsUploading(false);
            }

            // Determine if caption is needed (for docs/images/video with text)
            let caption = undefined;
            if (mediaUrl && message.trim()) {
                caption = message.trim();
            }

            await sendMessageMutation.mutateAsync({
                conversationId: activeConversationId,
                body: messageType === 'text' ? message.trim() : (selectedFile?.name || "Arquivo"), // Fallback body
                messageType,
                mediaUrl,
                caption,
                direction: 'outbound'
            });

            setMessage("");
            setSelectedFile(null);
            queryClient.invalidateQueries({ queryKey: ["deal-messages", activeConversationId] });
        } catch (error) {
            console.error("Error sending message:", error);
            toast.error("Erro ao enviar mensagem");
            setIsUploading(false);
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
                                    className={`flex max-w-[80%] ${msg.direction === 'outbound'
                                        ? 'ml-auto justify-end'
                                        : 'mr-auto justify-start'
                                        }`}
                                >
                                    <MessageBubble
                                        message={msg}
                                    // searchTerm="" // Modal doesn't have search yet
                                    />
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
                        {isRecording ? (
                            <div className="flex-1 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 p-2 rounded-md animate-pulse">
                                <span className="text-red-500 font-bold animate-pulse">● Gravando</span>
                                <span className="text-sm font-mono ml-2">{formatTime(recordingTime)}</span>
                                <div className="flex-1" />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancelRecording}
                                    className="text-red-500 hover:text-red-700 hover:bg-red-100"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleStopRecording}
                                    className="text-green-600 hover:text-green-700 hover:bg-green-100"
                                >
                                    <CheckCircle className="w-5 h-5" />
                                </Button>
                            </div>
                        ) : (
                            <>
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

                                {!message.trim() && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleStartRecording}
                                        disabled={!activeConversationId || isUploading}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        <Mic className="w-5 h-5" />
                                    </Button>
                                )}

                                {!message.trim() && !selectedFile ? (
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
                                    !selectedFile && (
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
                                    )
                                )}

                                {(message.trim() || selectedFile) && (
                                    <Button
                                        onClick={handleSend}
                                        disabled={sendMessageMutation.isPending || isUploading || !activeConversationId}
                                    >
                                        {isUploading ? "..." : <Send className="w-4 h-4" />}
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
