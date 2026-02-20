
import { useState, useEffect, useRef, useDeferredValue } from "react";
import { useTypingContext } from "@/contexts/TypingContext";
import { useMessages } from "@/hooks/useMessages";
import { useSendMessage } from "@/hooks/useSendMessage";
import { useResolveConversation } from "@/hooks/useResolveConversation";
import { useUpdateTicketStatus } from "@/hooks/useUpdateTicketStatus";
import { useFetchProfilePictures } from "@/hooks/useFetchProfilePictures";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentTeamMember } from "@/hooks/useStaff";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { uzapi } from "@/lib/uzapi";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { InstanceSelectorModal } from "@/components/InstanceSelectorModal";
import { EditMessageModal } from "@/components/EditMessageModal";
import { DeleteMessageModal } from "@/components/DeleteMessageModal";
import { EmojiPickerStandalone } from "@/components/EmojiReactionPicker";
import { ForwardMessageModal } from "@/components/chat/ForwardMessageModal";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QuickMessageConfirmationModal } from "@/components/QuickMessageConfirmationModal";

// Performance: Limit messages rendered at once
const MESSAGES_PER_PAGE = 50;

interface QuickMessage {
  id: string;
  shortcut: string;
  message_type: 'text' | 'image' | 'audio' | 'video';
  content: string | null;
  media_url: string | null;
}

/**
 * ChatArea Component
 * 
 * The main component responsible for rendering the chat interface.
 * It orchestrates the message list, input area, header, and various modals.
 * 
 * @param conversationId - The ID of the currently active conversation.
 * @param searchTerm - The current search term for filtering messages.
 * @param currentMatchIndex - The index of the currently highlighted search match.
 * @param setTotalMatches - Function to update the total number of search matches.
 * @param onOpenNewMessage - Callback when opening a new message (desktop).
 * @param externalMessage - External message content passed from other parts of the app.
 * @param clearExternalMessage - Function to clear the external message.
 * @param isMobile - Whether the component is being rendered on a mobile device.
 */
export const ChatArea = ({
  conversationId,
  searchTerm = "",
  currentMatchIndex = 0,
  setTotalMatches,
  onOpenNewMessage,
  externalMessage,
  clearExternalMessage,
  isMobile = false
}: {
  conversationId?: string;
  searchTerm?: string;
  currentMatchIndex?: number;
  setTotalMatches?: (total: number) => void;
  onOpenNewMessage?: (phone?: string) => void;
  externalMessage?: string;
  clearExternalMessage?: () => void;
  isMobile?: boolean;
}) => {
  const [message, setMessage] = useState("");
  const { setTyping } = useTypingContext();
  const deferredMessage = useDeferredValue(message);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const matchRefs = useRef<(HTMLDivElement | null)[]>([]);
  const queryClient = useQueryClient();

  // Quick Messages State
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  const [visibleMessagesCount, setVisibleMessagesCount] = useState(MESSAGES_PER_PAGE);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Message Actions State
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    evolution_id: string | null;
    body: string | null;
    sender_name: string | null;
    direction: "inbound" | "outbound";
  } | null>(null);
  const [editingMessage, setEditingMessage] = useState<{
    id: string;
    evolution_id: string | null;
    body: string | null;
  } | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<{
    id: string;
    evolution_id: string | null;
  } | null>(null);
  const [reactingToMessage, setReactingToMessage] = useState<{
    id: string;
    evolution_id: string | null;
    clientNumber: string | null;
  } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isInstanceModalOpen, setIsInstanceModalOpen] = useState(false);
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [isSendingSurvey, setIsSendingSurvey] = useState(false);

  // Forward Message State
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState<any | null>(null);

  // Quick Message Confirmation
  const [selectedQuickMessage, setSelectedQuickMessage] = useState<QuickMessage | null>(null);
  const [isQuickMessageConfirmOpen, setIsQuickMessageConfirmOpen] = useState(false);

  // Core Hooks
  const { messages, isLoading } = useMessages(conversationId);
  const sendMessageMutation = useSendMessage();
  const resolveConversation = useResolveConversation();
  const updateStatus = useUpdateTicketStatus();
  const { user } = useAuth();
  const { data: currentTeamMember } = useCurrentTeamMember();
  const { data: ownerId } = useOwnerId();

  // Profile & Team Data
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // Quick Messages Fetch
  useEffect(() => {
    const fetchQuickMessages = async () => {
      if (!ownerId) return;
      const { data } = await supabase.from('quick_messages').select('*').eq('user_id', ownerId).order('shortcut', { ascending: true });
      if (data) setQuickMessages(data as QuickMessage[]);
    };
    fetchQuickMessages();
    const channel = supabase.channel('quick_messages_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_messages', filter: `user_id=eq.${ownerId}` }, fetchQuickMessages)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ownerId]);


  // Use typing context
  useEffect(() => {
    if (message) {
      setTyping(true);
      const timer = setTimeout(() => setTyping(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [message, setTyping])

  // Sync external message
  useEffect(() => {
    if (externalMessage) {
      setMessage(externalMessage);
      clearExternalMessage?.();
    }
  }, [externalMessage, clearExternalMessage]);

  useFetchProfilePictures(conversationId);

  // Search Logic
  useEffect(() => {
    if (!searchTerm || !messages) {
      setTotalMatches?.(0);
      return;
    }
    const matches = messages.filter(msg => msg.body?.toLowerCase().includes(searchTerm.toLowerCase()));
    setTotalMatches?.(matches.length);
  }, [searchTerm, messages, setTotalMatches]);

  // Scroll to match
  useEffect(() => {
    if (searchTerm && matchRefs.current[currentMatchIndex]) {
      matchRefs.current[currentMatchIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentMatchIndex, searchTerm]);


  const { data: conversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase.from("conversations").select("*, contacts(*), groups(*)").eq("id", conversationId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  const { data: instance } = useQuery({
    queryKey: ["instance", (conversation as any)?.instance_id],
    queryFn: async () => {
      if (!(conversation as any)?.instance_id) return null;
      const { data, error } = await supabase.from("instances").select("*").eq("id", (conversation as any).instance_id).single();
      if (error) return null;
      return data;
    },
    enabled: !!(conversation as any)?.instance_id,
  });


  const contact = conversation?.contacts;
  const group = conversation?.groups;
  const isGroup = !!conversation?.group_id;

  let displayName = "Desconhecido";
  let profilePic = null;

  if (isGroup && group) {
    displayName = group.group_name || "Grupo sem Nome";
    profilePic = group.group_pic_url;
  } else if (contact) {
    displayName = (contact.push_name && contact.push_name !== "Unknown") ? contact.push_name : (contact.phone || contact.number?.split("@")[0] || "Cliente");
    profilePic = contact.profile_pic_url;
  }
  const instanceName = instance?.name;

  // Reset unread count
  useEffect(() => {
    if (conversationId) {
      supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId).then(({ error }) => {
        if (!error) {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
        }
      })
    }
  }, [conversationId, queryClient]);


  // AI Action
  const handleAiAction = async (mode: 'generate' | 'fix' | 'improve') => {
    if (!conversationId) return;
    const loadingToast = toast.loading("IA trabalhando...");
    try {
      const { data, error } = await supabase.functions.invoke("ai-suggest-response", { body: { conversationId, mode, text: message } });
      if (error) throw error;
      if (data?.suggestion) {
        setMessage(data.suggestion);
        toast.success("Sugestão gerada!");
      }
    } catch (error) {
      console.error("AI Error:", error);
      toast.error("Erro na IA");
    } finally {
      toast.dismiss(loadingToast);
    }
  };

  // Recording Logic
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // ... (simplified selection logic for brevity, ideally moved to utility)
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
        setSelectedFile(audioFile);
        stream.getTracks().forEach(t => t.stop());
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        setRecordingTime(0);
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

  const uploadFile = async (file: File) => {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from('media').upload(filePath, file);
      if (error) throw error;
      const { data } = supabase.storage.from('media').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error(e);
      return null;
    }
  };


  // Actions handlers
  const handleReply = (msg: any) => {
    setReplyingTo({
      id: msg.id,
      evolution_id: msg.evolution_id,
      body: msg.body,
      sender_name: msg.direction === "outbound" ? "Você" : (msg.sender_name || displayName),
      direction: msg.direction
    });
  };
  const handleEdit = (msg: any) => {
    setEditingMessage({ id: msg.id, evolution_id: msg.evolution_id, body: msg.body });
    setIsEditModalOpen(true);
  };
  const handleDelete = (msg: any) => {
    setDeletingMessage({ id: msg.id, evolution_id: msg.evolution_id });
    setIsDeleteModalOpen(true);
  };
  const handleReact = (msg: any) => {
    setReactingToMessage({ id: msg.id, evolution_id: msg.evolution_id, clientNumber: contact?.number || null });
    setShowEmojiPicker(true);
  };
  const handleCopy = async (msg: any) => {
    if (!msg.body) return;
    try {
      await navigator.clipboard.writeText(msg.body);
      toast.success("Mensagem copiada para a área de transferência");
    } catch (err) {
      toast.error("Falha ao copiar mensagem");
      console.error("Copy failed", err);
    }
  };

  const handleToggleFavorite = async (msg: any) => {
    try {
      const { error } = await supabase
        .from("messages")
        .update({ is_favorite: !msg.is_favorite })
        .eq("id", msg.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast.success(msg.is_favorite ? "Removido dos favoritos" : "Adicionado aos favoritos");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao favoritar mensagem");
    }
  };

  const handleForward = (msg: any) => {
    setMessageToForward(msg);
    setIsForwardModalOpen(true);
  };

  const executeEdit = async (newText: string) => {
    if (!editingMessage?.evolution_id || !instance?.apikey) return;
    try {
      await uzapi.editMessage(instance.apikey, editingMessage.evolution_id, newText);
      await supabase.from("messages").update({ body: newText }).eq("id", editingMessage.id);
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast.success("Mensagem editada");
      setIsEditModalOpen(false);
      setEditingMessage(null);
    } catch (e) { toast.error("Erro ao editar"); }
  };

  const executeDelete = async () => {
    if (!deletingMessage?.evolution_id || !instance?.apikey) return;
    try {
      await uzapi.deleteMessage(instance.apikey, deletingMessage.evolution_id);
      await supabase.from("messages").update({ is_deleted: true, body: "[Mensagem apagada]" }).eq("id", deletingMessage.id);
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast.success("Mensagem apagada");
      setIsDeleteModalOpen(false);
      setDeletingMessage(null);
    } catch (e) { toast.error("Erro ao apagar"); }
  };

  const executeReact = async (emoji: string) => {
    if (!reactingToMessage?.evolution_id || !instance?.apikey || !reactingToMessage.clientNumber) return;
    try {
      await uzapi.reactToMessage(instance.apikey, reactingToMessage.clientNumber, reactingToMessage.evolution_id, emoji);
      // Save reaction to DB so it renders as an emoji badge on the message
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        body: emoji,
        direction: "outbound",
        message_type: "reaction" as any,
        reply_to_id: reactingToMessage.evolution_id,
        user_id: (await supabase.auth.getSession()).data.session?.user?.id,
      });
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast.success(`Reagiu com ${emoji}`);
      setShowEmojiPicker(false);
      setReactingToMessage(null);
    } catch (e) { toast.error("Erro ao reagir"); }
  };

  const executeSendMessage = async (instanceId: string, options?: { mentions?: string[], body?: string }) => {
    let finalBody = options?.body || message;
    let mediaUrl = null;
    let messageType: any = "text";

    if (selectedFile) {
      setIsUploading(true);
      mediaUrl = await uploadFile(selectedFile);
      if (!mediaUrl) { setIsUploading(false); return; }
      if (selectedFile.type.startsWith('image/')) messageType = 'image';
      else if (selectedFile.type.startsWith('audio/')) messageType = 'audio';
      else if (selectedFile.type.startsWith('video/')) messageType = 'video';
      else messageType = 'document';
    }

    if (!finalBody.trim() && !mediaUrl) return;

    setMessage("");
    setSelectedFile(null);
    setReplyingTo(null);

    sendMessageMutation.mutate({
      conversationId: conversationId!,
      contactId: conversation?.contact_id,
      groupId: conversation?.group_id,
      body: messageType === 'document' ? selectedFile?.name : finalBody,
      direction: "outbound",
      messageType,
      mediaUrl: mediaUrl || undefined,
      caption: messageType === 'document' ? finalBody : undefined,
      replyId: replyingTo?.evolution_id || undefined,
      quotedBody: replyingTo?.body || undefined,
      quotedSender: replyingTo?.sender_name || undefined,
      mentions: options?.mentions
    }, {
      onSuccess: () => {
        setIsUploading(false);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      },
      onError: () => setIsUploading(false)
    });
  };

  const handleSend = async (options?: { mentions?: string[], body?: string }) => {
    if ((!message.trim() && !selectedFile) || !conversationId) return;
    if (!(conversation as any)?.instance_id) {
      setIsInstanceModalOpen(true);
      return;
    }
    await executeSendMessage((conversation as any).instance_id, options);
  };

  const handleInstanceSelect = async (instanceId: string) => {
    await supabase.from('conversations').update({ instance_id: instanceId }).eq('id', conversationId);
    await executeSendMessage(instanceId);
  };

  // Handler para enviar pesquisa de satisfação
  const handleSendSurvey = async () => {
    if (!contact || !conversationId) return;

    setIsSendingSurvey(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-satisfaction-survey', {
        body: {
          contact_id: contact.id,
          contact_number: contact.number,
          conversation_id: conversationId
        }
      });

      if (error) throw error;

      toast.success('Pesquisa de satisfação enviada!');
      setShowSurveyModal(false);
    } catch (error) {
      console.error('Error sending survey:', error);
      toast.error('Erro ao enviar pesquisa de satisfação');
    } finally {
      setIsSendingSurvey(false);
    }
  };

  const handleQuickMessageSelect = (qm: QuickMessage) => {
    setSelectedQuickMessage(qm);
    setIsQuickMessageConfirmOpen(true);
  };

  const handleConfirmQuickMessage = async () => {
    if (!selectedQuickMessage) return;

    const { content, media_url, message_type } = selectedQuickMessage;

    // Se tiver anexo, precisamos carregar como se fosse um upload? 
    // Ou apenas enviar como URL de mídia?
    // O endpoint sendMessage aceita mediaUrl.

    const messageTypeMap: any = {
      'image': 'image',
      'audio': 'audio',
      'video': 'video',
      'text': 'text' // Fallback
    };

    const type = messageTypeMap[message_type] || 'text';

    sendMessageMutation.mutate({
      conversationId: conversationId!,
      contactId: conversation?.contact_id,
      groupId: conversation?.group_id,
      body: content || (media_url ? "Mídia" : ""), // Body is required usually
      direction: "outbound",
      messageType: type,
      mediaUrl: media_url || undefined,
      caption: content || undefined,
    }, {
      onSuccess: () => {
        toast.success("Mensagem rápida enviada");
        setIsQuickMessageConfirmOpen(false);
        setSelectedQuickMessage(null);
      },
      onError: () => toast.error("Erro ao enviar mensagem rápida")
    });
  };

  // Paste handler for images
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          const newFile = new File([file], `colada_${Date.now()}.png`, { type: file.type });
          setSelectedFile(newFile);
        }
      }
    }
  };


  if (!conversationId) {
    return (
      <div className="flex-1 h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Selecione uma conversa para começar</p>
      </div>
    );
  }

  return (
    <div className={cn("flex-1 flex flex-col bg-background relative w-full min-w-0 min-h-0", isMobile ? "h-full" : "h-full")}>
      <ChatHeader
        isMobile={isMobile}
        displayName={displayName}
        profilePic={profilePic}
        contact={contact}
        instanceName={instanceName}
        instance={instance}
        isGroup={isGroup}
        conversationId={conversationId}
        conversation={conversation}
        updateStatus={updateStatus}
        resolveConversation={resolveConversation}
        handleResolve={() => resolveConversation.mutate(conversationId)}
      />

      <MessageList
        messages={messages || []}
        isLoading={isLoading}
        searchTerm={searchTerm}
        currentMatchIndex={currentMatchIndex}
        matchRefs={matchRefs}
        onReply={handleReply}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReact={handleReact}
        onCopy={handleCopy}
        onToggleFavorite={handleToggleFavorite}
        onForward={handleForward}
        onOpenNewMessage={onOpenNewMessage}
        isMobile={isMobile}
        visibleMessagesCount={visibleMessagesCount}
        setVisibleMessagesCount={setVisibleMessagesCount}
        MESSAGES_PER_PAGE={MESSAGES_PER_PAGE}
        displayName={displayName}
        profilePic={profilePic}
        isGroup={isGroup}
        conversation={conversation}
      />

      <MessageInput
        message={message}
        setMessage={setMessage}
        handleSend={handleSend}
        handleFileSelect={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]) }}
        selectedFile={selectedFile}
        handleRemoveFile={() => setSelectedFile(null)}
        isRecording={isRecording}
        handleStartRecording={handleStartRecording}
        handleStopRecording={handleStopRecording}
        recordingTime={recordingTime}
        isUploading={isUploading}
        handleAiAction={handleAiAction}
        isMobile={isMobile}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        handlePaste={handlePaste}
        quickMessages={quickMessages}
        onQuickMessageSelect={handleQuickMessageSelect}
        onSendSurvey={() => setShowSurveyModal(true)}
        isSendingSurvey={isSendingSurvey}
        conversationId={conversationId}
        isGroup={isGroup}
      />

      {/* Modals */}
      <InstanceSelectorModal open={isInstanceModalOpen} onOpenChange={setIsInstanceModalOpen} onSelect={handleInstanceSelect} />
      <EditMessageModal open={isEditModalOpen} onOpenChange={setIsEditModalOpen} messageBody={editingMessage?.body || ""} onSave={executeEdit} />
      <DeleteMessageModal open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen} onConfirm={executeDelete} />

      <Dialog open={showSurveyModal} onOpenChange={setShowSurveyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pesquisa de Satisfação</DialogTitle>
            <DialogDescription>
              Deseja enviar a pesquisa de satisfação?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowSurveyModal(false)} disabled={isSendingSurvey}>
              Não
            </Button>
            <Button onClick={handleSendSurvey} disabled={isSendingSurvey}>
              {isSendingSurvey ? "Enviando..." : "Sim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickMessageConfirmationModal
        open={isQuickMessageConfirmOpen}
        onOpenChange={setIsQuickMessageConfirmOpen}
        message={selectedQuickMessage}
        onConfirm={handleConfirmQuickMessage}
      />
      {showEmojiPicker && (
        <div className="absolute bottom-20 right-4 z-50 flex flex-col items-center gap-2 bg-popover border shadow-lg rounded-lg p-2">
          <EmojiPickerStandalone onSelect={(emoji) => executeReact(emoji)} onClose={() => setShowEmojiPicker(false)} />
          <Button
            variant="destructive"
            size="sm"
            className="w-full text-xs font-medium"
            onClick={() => executeReact("")}
          >
            Remover Reação
          </Button>
        </div>
      )}

      <ForwardMessageModal
        open={isForwardModalOpen}
        onOpenChange={setIsForwardModalOpen}
        messageToForward={messageToForward}
      />

    </div>
  );
};
