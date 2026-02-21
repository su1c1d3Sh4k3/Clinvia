import React, { useState, useRef, useEffect } from "react";
import { useInternalChats, useInternalMessages, useCreateInternalChat, InternalChat } from "@/hooks/useInternalChat";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, MessageCircle, Send, Users, UserRound, ArrowLeft, Check, Paperclip, X, FileText, Image as ImageIcon, Video, Mic, File as FileIcon, StopCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

const InternalInbox = () => {
    const { user } = useAuth();
    const { data: ownerId } = useOwnerId();
    const { chats, isLoadingChats } = useInternalChats();
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [messageText, setMessageText] = useState("");
    const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);

    // Tab and Group States
    const [activeTab, setActiveTab] = useState<'conversas' | 'times'>('conversas');
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [groupName, setGroupName] = useState("");

    // Media Upload State
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Audio Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const { messages, isLoading: isLoadingMessages, sendMessage } = useInternalMessages(activeChatId);
    const { createChat, isCreating } = useCreateInternalChat();

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Fetch all team members for the new chat modal
    const { data: teamMembers, isLoading: isLoadingMembers, isError: isErrorMembers } = useQuery({
        queryKey: ['team_members_internal', ownerId],
        enabled: !!ownerId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('team_members')
                .select('auth_user_id, name, role, profile_pic_url')
                .eq('user_id', ownerId); // Force exact tenant filter
            if (error) {
                console.error("Erro ao buscar membros da equipe:", error);
                throw error;
            }
            return data.filter(m => m.auth_user_id && m.auth_user_id !== user?.id); // Exclude self
        }
    });

    const activeChat = chats?.find(c => c.id === activeChatId);

    const getChatNameAndAvatar = (chat: InternalChat) => {
        if (chat.type === 'group' && chat.name) {
            return { name: chat.name, avatar: null, isGroup: true };
        }
        // Para direct chat, pegar o outro participante
        const otherParticipant = chat.participants?.find(p => p.user_id !== user?.id);
        return {
            name: otherParticipant?.profile?.name || 'Usuário Desconhecido',
            avatar: otherParticipant?.profile?.profile_pic_url,
            isGroup: false
        };
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
            if (file.size > MAX_FILE_SIZE) {
                toast.error("O arquivo deve ter no máximo 50MB");
                return;
            }
            setSelectedFile(file);
        }
    };

    const removeSelectedFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const getMediaType = (type: string) => {
        if (type.startsWith("image/")) return "image";
        if (type.startsWith("video/")) return "video";
        if (type.startsWith("audio/")) return "audio";
        return "document";
    };

    const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setMessageText(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    }

    // Effect to reset textarea height when message is cleared (e.g. after sending)
    useEffect(() => {
        if (messageText === "" && textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    }, [messageText]);

    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });

                stream.getTracks().forEach(t => t.stop());
                if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
                setRecordingTime(0);

                // Auto-enviar áudio após parar a gravação
                handleSendMessage(undefined, audioFile);
            };

            mediaRecorder.start(100);
            setIsRecording(true);
            recordingIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
            toast.success("Gravação iniciada");
        } catch (e) {
            console.error(e);
            toast.error("Erro no microfone");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSendMessage = async (e?: React.FormEvent, overrideFile?: File) => {
        if (e) e.preventDefault();

        const fileToSend = overrideFile || selectedFile;

        // Pode enviar se tiver texto OU arquivo selecionado
        if ((!messageText.trim() && !fileToSend) || !activeChatId || !user) return;

        const text = messageText;
        if (!overrideFile) {
            setMessageText("");
        }

        try {
            let mediaUrl = undefined;
            let mediaType = undefined;
            let fileName = undefined;

            if (fileToSend) {
                setIsUploading(true);
                const fileExt = fileToSend.name.split('.').pop() || 'tmp';
                const safeName = Math.random().toString(36).substring(2, 15);
                const filePath = `${activeChatId}/${Date.now()}_${safeName}.${fileExt}`;

                // Utilizando um bucket genérico "chat_media"
                const { error: uploadError, data } = await supabase.storage
                    .from('chat_media')
                    .upload(filePath, fileToSend);

                if (uploadError) {
                    console.error("Upload error:", uploadError);
                    throw new Error("Erro no upload do arquivo");
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('chat_media')
                    .getPublicUrl(filePath);

                mediaUrl = publicUrl;
                mediaType = getMediaType(fileToSend.type);
                fileName = fileToSend.name;

                if (!overrideFile) {
                    removeSelectedFile(); // clear after logic grab
                }
            }

            await sendMessage({
                chatId: activeChatId,
                senderId: user.id,
                body: text,
                mediaUrl,
                mediaType,
                fileName
            });
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : "Erro ao enviar mensagem");
            setMessageText(text); // revert
        } finally {
            setIsUploading(false);
        }
    };

    const handleCreateDirectChat = async (targetUserId: string) => {
        try {
            // Check if direct chat already exists locally
            const existingChat = chats?.find(c =>
                c.type === 'direct' &&
                c.participants?.some(p => p.user_id === targetUserId) &&
                c.participants?.length === 2
            );

            if (existingChat) {
                setActiveChatId(existingChat.id);
                setIsNewChatModalOpen(false);
                return;
            }

            const newChat = await createChat({ targetUserIds: [targetUserId], type: 'direct' });
            setActiveChatId(newChat.id);
            setIsNewChatModalOpen(false);
            toast.success("Chat iniciado");
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : "Não foi possível criar o chat");
        }
    };

    const handleCreateGroupChat = async () => {
        if (!groupName.trim() || selectedMembers.length === 0) {
            toast.error("Preencha o nome e selecione pelo menos um membro.");
            return;
        }
        try {
            const newChat = await createChat({ targetUserIds: selectedMembers, type: 'group', name: groupName.trim() });
            setActiveChatId(newChat.id);
            setIsNewChatModalOpen(false);
            setGroupName("");
            setSelectedMembers([]);
            toast.success("Grupo criado com sucesso");
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : "Não foi possível criar o grupo");
        }
    };

    const toggleMemberSelection = (userId: string) => {
        setSelectedMembers(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const filteredChats = chats?.filter(chat => {
        // Tab filtering
        if (activeTab === 'conversas' && chat.type === 'group') return false;
        if (activeTab === 'times' && chat.type === 'direct') return false;

        // Search filtering
        if (!searchQuery) return true;
        const info = getChatNameAndAvatar(chat);
        return info.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className="flex bg-background dark:bg-[#0B0D10] h-[calc(100vh-theme(spacing.16))] mt-16 lg:mt-0 lg:h-screen w-full overflow-hidden">

            {/* SIDEBAR: Lista de Chats */}
            <div className={cn(
                "w-full lg:w-80 lg:min-w-80 border-r border-[#1E2229] flex flex-col bg-background/95 dark:bg-[#12151A] transition-all",
                activeChatId ? "hidden lg:flex" : "flex"
            )}>
                {/* Sidebar Header */}
                <div className="p-4 flex flex-col gap-4 border-b border-border/50 dark:border-[#1E2229]">
                    <div className="flex items-center justify-between">
                        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground/90">
                            Chat Interno
                        </h1>

                        <Dialog
                            open={isNewChatModalOpen}
                            onOpenChange={(open) => {
                                setIsNewChatModalOpen(open);
                                if (!open) {
                                    setSelectedMembers([]);
                                    setGroupName("");
                                }
                            }}
                        >
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                                    <Plus className="w-5 h-5" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>
                                        {activeTab === 'conversas' ? 'Nova Conversa' : 'Novo Time'}
                                    </DialogTitle>
                                </DialogHeader>

                                {activeTab === 'times' && (
                                    <div className="pt-4 pb-2">
                                        <label className="text-xs font-semibold text-muted-foreground mb-1 block">NOME DO TIME</label>
                                        <Input
                                            placeholder="Ex: Marketing, Gestão..."
                                            value={groupName}
                                            onChange={(e) => setGroupName(e.target.value)}
                                        />
                                        <label className="text-xs font-semibold text-muted-foreground mt-4 block">SELECIONE OS MEMBROS</label>
                                    </div>
                                )}

                                <ScrollArea className={cn("mt-2", activeTab === 'times' ? "h-[200px]" : "h-[300px]")}>
                                    <div className="space-y-1">
                                        {isLoadingMembers ? (
                                            <div className="flex justify-center p-8">
                                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                                            </div>
                                        ) : isErrorMembers ? (
                                            <p className="text-center text-destructive text-sm pt-8">Erro ao carregar os membros. Tente novamente.</p>
                                        ) : teamMembers?.length === 0 ? (
                                            <p className="text-center text-muted-foreground text-sm pt-8">Nenhum membro encontrado na equipe.</p>
                                        ) : (
                                            teamMembers?.map(member => {
                                                const isSelected = selectedMembers.includes(member.auth_user_id);

                                                // Render direct format or Group selection format
                                                if (activeTab === 'conversas') {
                                                    return (
                                                        <div
                                                            key={member.auth_user_id}
                                                            className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors"
                                                            onClick={() => handleCreateDirectChat(member.auth_user_id)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <Avatar>
                                                                    <AvatarImage src={member.profile_pic_url || undefined} />
                                                                    <AvatarFallback>{member.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                                </Avatar>
                                                                <div>
                                                                    <p className="font-medium text-sm">{member.name}</p>
                                                                    <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                                                                </div>
                                                            </div>
                                                            <Button variant="ghost" size="sm">Mensagem</Button>
                                                        </div>
                                                    );
                                                } else {
                                                    return (
                                                        <div
                                                            key={member.auth_user_id}
                                                            className={cn(
                                                                "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors border border-transparent",
                                                                isSelected ? "bg-primary/5 border-primary/20" : "hover:bg-muted/50"
                                                            )}
                                                            onClick={() => toggleMemberSelection(member.auth_user_id)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className={cn(
                                                                    "w-5 h-5 rounded flex items-center justify-center border transition-colors",
                                                                    isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                                                                )}>
                                                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                                                </div>
                                                                <Avatar className="h-8 w-8">
                                                                    <AvatarImage src={member.profile_pic_url || undefined} />
                                                                    <AvatarFallback>{member.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                                </Avatar>
                                                                <div>
                                                                    <p className="font-medium text-sm">{member.name}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })
                                        )}
                                    </div>
                                </ScrollArea>

                                {activeTab === 'times' && (
                                    <DialogFooter className="mt-4">
                                        <Button
                                            className="w-full"
                                            onClick={handleCreateGroupChat}
                                            disabled={!groupName.trim() || selectedMembers.length === 0 || isCreating}
                                        >
                                            {isCreating ? "Criando..." : "Criar Time"}
                                        </Button>
                                    </DialogFooter>
                                )}
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar conversas..."
                            className="pl-9 h-9 bg-background"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* TABS (Conversas / Times) */}
                    <div className="flex bg-muted/30 dark:bg-[#1A1E24] p-1 rounded-full mt-1">
                        <button
                            onClick={() => setActiveTab('conversas')}
                            className={cn(
                                "flex-1 text-sm py-1.5 rounded-full transition-all duration-300",
                                activeTab === 'conversas' ? "bg-background dark:bg-[#2A2F38] text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Conversas
                        </button>
                        <button
                            onClick={() => setActiveTab('times')}
                            className={cn(
                                "flex-1 text-sm py-1.5 rounded-full transition-all duration-300",
                                activeTab === 'times' ? "bg-background dark:bg-[#2A2F38] text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Equipes
                        </button>
                    </div>
                </div>

                {/* Chats List */}
                <ScrollArea className="flex-1">
                    {isLoadingChats ? (
                        <div className="p-4 space-y-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="space-y-2 flex-1">
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-3 w-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredChats?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                            <MessageCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
                            <p className="text-muted-foreground text-sm">Nenhuma conversa encontrada</p>
                        </div>
                    ) : (
                        <div className="flex flex-col p-2 gap-1">
                            {filteredChats?.map(chat => {
                                const info = getChatNameAndAvatar(chat);
                                const isActive = activeChatId === chat.id;

                                return (
                                    <button
                                        key={chat.id}
                                        onClick={() => setActiveChatId(chat.id)}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-[1.25rem] transition-all w-full text-left outline-none border border-transparent",
                                            isActive
                                                ? "bg-primary/10 dark:bg-primary/5 border-primary/20 dark:border-primary/10 shadow-[0_0_15px_-3px_rgba(0,177,242,0.1)]"
                                                : "hover:bg-muted/50 dark:hover:bg-[#1A1E24]"
                                        )}
                                    >
                                        <div className="relative shrink-0">
                                            <Avatar className="h-12 w-12 border border-border/50 dark:border-[#2A2F38] shadow-sm">
                                                {info.isGroup ? (
                                                    <AvatarFallback className="bg-primary/10 text-primary"><Users className="w-5 h-5" /></AvatarFallback>
                                                ) : (
                                                    <>
                                                        <AvatarImage src={info.avatar || undefined} className="object-cover" />
                                                        <AvatarFallback className="bg-secondary text-secondary-foreground">
                                                            {info.name.substring(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </>
                                                )}
                                            </Avatar>
                                            {/* Status indicator (simulated online state based on group chat or recent message, can be ignored or enhanced) */}
                                            {!info.isGroup && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background dark:border-[#12151A] rounded-full"></span>}
                                        </div>

                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex justify-between items-baseline mb-0.5">
                                                <h3 className={cn("font-medium text-[15px] truncate pr-2", isActive ? "text-foreground" : "text-foreground/90")}>
                                                    {info.name}
                                                </h3>
                                                {chat.last_message && (
                                                    <span className="text-[11px] text-muted-foreground/70 shrink-0 whitespace-nowrap font-medium">
                                                        {format(new Date(chat.last_message.created_at), "HH:mm")}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[13px] text-muted-foreground/80 truncate w-full">
                                                {chat.last_message ? chat.last_message.body : "Nova conversa"}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* MAIN CHAT AREA */}
            <div className={cn(
                "flex-1 flex flex-col bg-background/50 dark:bg-[#0B0D10] relative",
                !activeChatId ? "hidden lg:flex" : "flex"
            )}>
                {!activeChatId ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                            <MessageCircle className="w-10 h-10 text-primary" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Comunicação Interna</h2>
                        <p className="text-muted-foreground max-w-sm">
                            Selecione uma conversa na barra lateral ou inicie um novo chat com os membros da sua equipe.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Header da Conversa Ativa */}
                        <div className="h-[73px] px-6 border-b border-border/40 dark:border-[#1E2229] flex items-center justify-between bg-background/95 dark:bg-[#12151A]/80 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="lg:hidden -ml-2 hover:bg-muted/50 dark:hover:bg-[#1A1E24]"
                                    onClick={() => setActiveChatId(null)}
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>

                                {activeChat && (
                                    <>
                                        <div className="relative">
                                            <Avatar className="h-10 w-10 border border-border/50 dark:border-[#2A2F38]">
                                                {getChatNameAndAvatar(activeChat).isGroup ? (
                                                    <AvatarFallback className="bg-primary/10 text-primary"><Users className="w-5 h-5" /></AvatarFallback>
                                                ) : (
                                                    <>
                                                        <AvatarImage src={getChatNameAndAvatar(activeChat).avatar || undefined} className="object-cover" />
                                                        <AvatarFallback>{getChatNameAndAvatar(activeChat).name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </>
                                                )}
                                            </Avatar>
                                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background dark:border-[#12151A] rounded-full"></span>
                                        </div>
                                        <div className="flex flex-col">
                                            <h2 className="font-semibold text-[15px] leading-tight text-foreground/90">
                                                {getChatNameAndAvatar(activeChat).name}
                                            </h2>
                                            <span className="text-[12px] font-medium text-muted-foreground/70 tracking-wide mt-0.5">
                                                {getChatNameAndAvatar(activeChat).isGroup ? 'GRUPO' : 'COLABORADOR'}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Ações Extras Opcionais no Topo */}
                            <div>
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-[#1A1E24]">
                                    <Search className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Mensagens Body (Ambient Background) */}
                        <ScrollArea className="flex-1 p-4 lg:p-6 bg-transparent">
                            <div className="flex flex-col gap-4 w-full h-full pb-4">
                                {isLoadingMessages ? (
                                    <div className="flex items-center justify-center p-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                    </div>
                                ) : messages?.length === 0 ? (
                                    <div className="text-center text-muted-foreground p-8 my-auto text-sm">
                                        Envie uma mensagem para iniciar a conversa.
                                    </div>
                                ) : (
                                    messages?.map((msg, index) => {
                                        const isMe = msg.sender_id === user?.id;
                                        const showAvatar = !isMe && (index === 0 || messages[index - 1].sender_id !== msg.sender_id);
                                        // achar dados de remetente (se for em grupo precisaríamos buscar de parts)
                                        const senderProfile = activeChat?.participants?.find(p => p.user_id === msg.sender_id)?.profile;

                                        return (
                                            <div
                                                key={msg.id}
                                                className={cn(
                                                    "flex w-full gap-2",
                                                    isMe ? "justify-end" : "justify-start",
                                                    !showAvatar && !isMe ? "pl-10" : ""
                                                )}
                                            >
                                                {showAvatar && (
                                                    <Avatar className="h-8 w-8 shrink-0 mt-1">
                                                        <AvatarImage src={senderProfile?.profile_pic_url} />
                                                        <AvatarFallback className="text-[10px]">{senderProfile?.name?.substring(0, 2) || 'U'}</AvatarFallback>
                                                    </Avatar>
                                                )}

                                                <div className={cn(
                                                    "px-5 py-3 text-base shadow-sm relative group max-w-[90%] lg:max-w-[85%]",
                                                    isMe
                                                        ? "bg-[#0070c0] text-white rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl"
                                                        : "bg-surface dark:bg-[#1E2229] border border-border/40 dark:border-white/5 text-foreground rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl"
                                                )}>
                                                    {activeChat?.type === 'group' && !isMe && showAvatar && (
                                                        <span className="text-[11px] font-bold text-primary/90 mb-1 block tracking-wide">
                                                            {senderProfile?.name}
                                                        </span>
                                                    )}

                                                    {/* Media Renderer */}
                                                    {msg.media_url && (
                                                        <div className={cn("mb-2 relative rounded-lg overflow-hidden border border-white/10 dark:border-black/20", isMe ? "bg-white/10" : "bg-black/5")}>
                                                            {msg.media_type === 'image' && (
                                                                <a href={msg.media_url} target="_blank" rel="noreferrer">
                                                                    <img src={msg.media_url} alt="anexo" className="max-w-full max-h-[300px] object-cover hover:opacity-90 transition-opacity rounded-lg" />
                                                                </a>
                                                            )}
                                                            {msg.media_type === 'video' && (
                                                                <video src={msg.media_url} controls className="max-w-full max-h-[300px] rounded-lg" />
                                                            )}
                                                            {msg.media_type === 'audio' && (
                                                                <div className={cn("p-2 w-72 max-w-full rounded-lg flex items-center justify-between gap-3", isMe ? "bg-black/10" : "bg-white/5")}>
                                                                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", isMe ? "bg-white text-[#0070c0]" : "bg-primary text-primary-foreground")}>
                                                                        <Mic className="w-5 h-5" />
                                                                    </div>
                                                                    <audio src={msg.media_url} controls className="w-full h-10 custom-audio-player" />
                                                                </div>
                                                            )}
                                                            {msg.media_type === 'document' && (
                                                                <a href={msg.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 hover:bg-black/5 transition-colors">
                                                                    <div className={cn("p-2 rounded-lg", isMe ? "bg-white flex text-[#0070c0]" : "bg-primary text-primary-foreground")}>
                                                                        <FileText className="w-6 h-6" />
                                                                    </div>
                                                                    <div className="flex-1 overflow-hidden">
                                                                        <p className="text-sm font-semibold pr-2 truncate">
                                                                            {msg.file_name || "Documento"}
                                                                        </p>
                                                                    </div>
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}

                                                    {msg.body && (
                                                        <p className="whitespace-pre-wrap leading-relaxed break-words">{msg.body}</p>
                                                    )}

                                                    <span className={cn(
                                                        "text-[10px] flex justify-end mt-1 font-medium",
                                                        isMe ? "text-primary-foreground/70" : "text-muted-foreground/60"
                                                    )}>
                                                        {format(new Date(msg.created_at), "HH:mm")}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </ScrollArea>

                        {/* Input Box - Pill Shape Design & File Selection */}
                        <div className="p-2 lg:p-4 bg-transparent w-full flex flex-col gap-2 pb-6 px-4 lg:px-24">
                            {/* File Preview Area */}
                            {selectedFile && (
                                <div className="w-full">
                                    <div className="inline-flex items-center gap-3 p-3 bg-muted/50 dark:bg-[#1A1E24] rounded-xl border border-border/50 relative group shadow-sm backdrop-blur-md">
                                        <div className="p-2 bg-primary/10 text-primary rounded-lg">
                                            {selectedFile.type.startsWith('image/') ? <ImageIcon className="w-5 h-5" /> :
                                                selectedFile.type.startsWith('video/') ? <Video className="w-5 h-5" /> :
                                                    selectedFile.type.startsWith('audio/') ? <Mic className="w-5 h-5" /> :
                                                        <FileIcon className="w-5 h-5" />}
                                        </div>
                                        <div className="flex flex-col overflow-hidden max-w-[200px]">
                                            <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                                            <span className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                        </div>
                                        <Button
                                            onClick={removeSelectedFile}
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 rounded-full absolute -top-2 -right-2 bg-destructive text-destructive-foreground hover:bg-destructive shadow border border-background opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <form
                                onSubmit={handleSendMessage}
                                className={cn(
                                    "flex gap-2 w-full items-end p-1.5 bg-background dark:bg-[#1A1E24] rounded-3xl border border-border/60 dark:border-[#2A2F38] transition-all shadow-sm",
                                    !isUploading && "focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10",
                                    isUploading && "opacity-70 pointer-events-none"
                                )}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <div className="flex gap-1 pb-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        title="Anexar arquivo"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="rounded-full h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                                    >
                                        <Paperclip className="w-5 h-5" />
                                    </Button>

                                    {/* Botão de Áudio */}
                                    <Button
                                        type="button"
                                        variant={isRecording ? "destructive" : "ghost"}
                                        size="icon"
                                        title={isRecording ? "Parar gravação" : "Gravar áudio"}
                                        className={cn("h-11 w-11 rounded-full text-muted-foreground hover:text-foreground shrink-0 transition-all duration-300",
                                            isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse text-white shadow-lg" : "hover:bg-black/5 dark:hover:bg-white/5")}
                                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                                    >
                                        {isRecording ? <StopCircle className="w-6 h-6" /> : <Mic className="w-5 h-5" />}
                                    </Button>
                                </div>

                                <div className="flex-1 relative flex items-center min-h-[52px]">
                                    {isRecording ? (
                                        <div className="flex items-center px-4 w-full h-full text-red-500 font-semibold tracking-wider animate-pulse pt-1">
                                            Gravando... {formatTime(recordingTime)}
                                        </div>
                                    ) : (
                                        <Textarea
                                            ref={textareaRef}
                                            className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50 min-h-[44px] max-h-[140px] px-2 py-3 text-base resize-none scrollbar-thin overflow-y-auto"
                                            placeholder={selectedFile ? "Adicione uma legenda opcional..." : "Mensagem..."}
                                            value={messageText}
                                            onChange={handleMessageChange}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                            rows={1}
                                        />
                                    )}
                                </div>
                                <div className="pb-1 pr-1">
                                    <Button
                                        type="submit"
                                        size="icon"
                                        title="Enviar mensagem"
                                        disabled={(!messageText.trim() && !selectedFile) || isLoadingMessages || isUploading}
                                        className="rounded-full h-11 w-11 shrink-0 bg-[#0070c0] hover:bg-[#005faa] text-white shadow-[0_4px_14px_0_rgba(0,112,192,0.39)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                    >
                                        {isUploading ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Send className="w-5 h-5 translate-x-px translate-y-[2px]" />
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </>
                )}
            </div>

        </div>
    );
};

export default InternalInbox;
