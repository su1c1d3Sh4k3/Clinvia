import { useState, useEffect, useRef, useDeferredValue, useCallback } from "react";
import { useTypingContext, useIsTyping } from "@/contexts/TypingContext";
import { Send, Paperclip, Smile, Mic, Sparkles, CheckCircle, X, FileText, Image as ImageIcon, Video, ArrowDown, StopCircle, Check, CheckCheck, Plus, MoreVertical, MessageSquare, ClipboardList, Download } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
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
import { QueueSelector } from "@/components/QueueSelector";
import { InstanceSelectorModal } from "@/components/InstanceSelectorModal";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { QuickMessagesMenu } from "@/components/QuickMessagesMenu";
import { QuickMessageConfirmationModal } from "@/components/QuickMessageConfirmationModal";
import { MessageActionsMenu } from "@/components/MessageActionsMenu";
import { EditMessageModal } from "@/components/EditMessageModal";
import { DeleteMessageModal } from "@/components/DeleteMessageModal";
import { EmojiPickerStandalone } from "@/components/EmojiReactionPicker";
import { ReplyQuoteBox, QuotedMessage } from "@/components/ReplyQuoteBox";
import { LazyMedia } from "@/components/LazyMedia";
import { uzapi } from "@/lib/uzapi";
import { getProxiedImageUrl } from "@/lib/imageProxy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Performance: Limit messages rendered at once
const MESSAGES_PER_PAGE = 50;

interface QuickMessage {
  id: string;
  shortcut: string;
  message_type: 'text' | 'image' | 'audio' | 'video';
  content: string | null;
  media_url: string | null;
}

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
  const { isTyping, setTyping } = useTypingContext();
  const deferredMessage = useDeferredValue(message);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const matchRefs = useRef<(HTMLDivElement | null)[]>([]);
  const queryClient = useQueryClient();

  // Quick Messages State
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  const [filteredQuickMessages, setFilteredQuickMessages] = useState<QuickMessage[]>([]);
  const [showQuickMessagePopup, setShowQuickMessagePopup] = useState(false);
  const [selectedQuickMessage, setSelectedQuickMessage] = useState<QuickMessage | null>(null);
  const [isQuickMessageConfirmOpen, setIsQuickMessageConfirmOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Performance: Pagination state - show last N messages by default
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
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [isSendingSurvey, setIsSendingSurvey] = useState(false);

  // Auto-resize textarea - moved to handleMessageChange for better performance
  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    // Mark as typing - this pauses all subscriptions globally via context
    setTyping(true);

    // After typing stops, the context will auto-reset after debounce
    // So we also call setTyping(false) to trigger the debounce
    setTimeout(() => setTyping(false), 0);

    // Resize directly in handler instead of useEffect
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  }, [setTyping]);

  // Sync external message (from follow up click)
  useEffect(() => {
    if (externalMessage) {
      setMessage(externalMessage);
      clearExternalMessage?.();
      textareaRef.current?.focus();
    }
  }, [externalMessage, clearExternalMessage]);

  // Get messages for this conversation
  const { messages, isLoading } = useMessages(conversationId);
  const sendMessageMutation = useSendMessage();
  const resolveConversation = useResolveConversation();
  const updateStatus = useUpdateTicketStatus();
  const { user } = useAuth();
  const { data: currentTeamMember } = useCurrentTeamMember();
  const [isInstanceModalOpen, setIsInstanceModalOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch Quick Messages - using ownerId to share between team members
  const { data: ownerId } = useOwnerId();

  useEffect(() => {
    const fetchQuickMessages = async () => {
      if (!ownerId) return;
      const { data } = await supabase
        .from('quick_messages')
        .select('*')
        .eq('user_id', ownerId)
        .order('shortcut', { ascending: true });

      if (data) setQuickMessages(data as QuickMessage[]);
    };

    fetchQuickMessages();

    // Subscribe to changes
    const channel = supabase
      .channel('quick_messages_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_messages', filter: `user_id=eq.${ownerId}` }, () => {
        fetchQuickMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ownerId]);

  // Handle Slash Command - with debounce for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      if (deferredMessage.startsWith('/')) {
        const query = deferredMessage.slice(1).toLowerCase();
        const matches = quickMessages.filter(qm => qm.shortcut.toLowerCase().includes(query));
        setFilteredQuickMessages(matches);
        setShowQuickMessagePopup(matches.length > 0);
      } else {
        setShowQuickMessagePopup(false);
      }
    }, 100); // 100ms debounce

    return () => clearTimeout(timer);
  }, [deferredMessage, quickMessages]);


  // Buscar fotos de perfil automaticamente
  useFetchProfilePictures(conversationId);

  // Search Logic
  useEffect(() => {
    if (!searchTerm || !messages) {
      setTotalMatches?.(0);
      return;
    }

    const matches = messages.filter(msg =>
      msg.body?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setTotalMatches?.(matches.length);
  }, [searchTerm, messages, setTotalMatches]);

  // Scroll to match
  useEffect(() => {
    if (searchTerm && matchRefs.current[currentMatchIndex]) {
      matchRefs.current[currentMatchIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }, [currentMatchIndex, searchTerm]);

  const { data: conversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(*), groups(*)") // Fetch groups relation
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  // Buscar instância da conversa
  const { data: instance } = useQuery({
    queryKey: ["instance", (conversation as any)?.instance_id],
    queryFn: async () => {
      if (!(conversation as any)?.instance_id) return null;
      const { data, error } = await supabase
        .from("instances")
        .select("*")
        .eq("id", (conversation as any).instance_id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!(conversation as any)?.instance_id,
  });

  const contact = conversation?.contacts;
  const group = conversation?.groups;
  const isGroup = !!conversation?.group_id;

  // Display Name Logic
  let displayName = "Desconhecido";
  let profilePic = null;

  if (isGroup && group) {
    displayName = group.group_name || "Grupo sem Nome";
    profilePic = group.group_pic_url;
  } else if (contact) {
    displayName = (contact.push_name && contact.push_name !== "Unknown")
      ? contact.push_name
      : (contact.phone || contact.number?.split("@")[0] || "Cliente");
    profilePic = contact.profile_pic_url;
  }

  const instanceName = instance?.name;

  // Auto-scroll to bottom on new messages (only if not searching)
  useEffect(() => {
    if (scrollRef.current && !searchTerm) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, searchTerm]);

  // Reset unread count when conversation is opened
  useEffect(() => {
    if (conversationId) {
      const resetUnreadCount = async () => {
        const { error } = await supabase
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversationId);

        if (!error) {

          // Invalidate conversations cache so the badge updates
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
        }
      };
      resetUnreadCount();
    }
  }, [conversationId, queryClient]);

  const handleAiAction = async (mode: 'generate' | 'fix' | 'improve') => {
    if (!conversationId) return;

    // Se for gerar, mas já tiver texto, talvez queira confirmar ou limpar? 
    // O requisito diz: se vazio -> gera. Se tem texto -> corrige/melhora.
    // Então 'generate' só será chamado se estiver vazio.

    const loadingToast = toast.loading("IA trabalhando...");

    try {
      const { data, error } = await supabase.functions.invoke("ai-suggest-response", {
        body: {
          conversationId,
          mode,
          text: message
        },
      });

      if (error) throw error;

      if (data?.suggestion) {
        setMessage(data.suggestion);
        toast.success("Sugestão gerada com sucesso!");
      }
    } catch (error) {
      console.error("Error getting AI suggestion:", error);
      toast.error("Erro ao processar solicitação da IA");
    } finally {
      toast.dismiss(loadingToast);
    }
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

  // Buscar dados do membro da equipe se não for admin (profile)
  const { data: teamMember } = useQuery({
    queryKey: ["teamMember", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("team_members")
        .select("name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching team member:", error);
        return null;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage((prev) => prev + emojiData.emoji);
    setIsEmojiOpen(false);
  };

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

  // Handle paste from clipboard (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          // Create a new file with a proper name
          const extension = item.type.split('/')[1] || 'png';
          const newFile = new File([file], `imagem_colada_${Date.now()}.${extension}`, { type: file.type });
          setSelectedFile(newFile);
          toast.success("Imagem adicionada da área de transferência");
        }
        break;
      }
    }
  };

  // Start audio recording
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Prefer MP4/AAC for Instagram compatibility (supported in Chrome, Safari, Edge)
      // Fallback to WebM for Firefox and others
      let mimeType = 'audio/webm;codecs=opus';
      let fileExtension = 'webm';

      // Try MP4/AAC first (Instagram compatible)
      if (MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')) {
        mimeType = 'audio/mp4;codecs=mp4a.40.2';
        fileExtension = 'm4a';
        console.log('[Audio Recording] Using MP4/AAC format (Instagram compatible)');
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
        fileExtension = 'm4a';
        console.log('[Audio Recording] Using MP4 format (Instagram compatible)');
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
        fileExtension = 'webm';
        console.log('[Audio Recording] Using WebM/Opus format (fallback)');
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
        fileExtension = 'webm';
        console.log('[Audio Recording] Using WebM format (fallback)');
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
        const baseMimeType = mimeType.split(';')[0]; // Remove codec info
        const audioBlob = new Blob(audioChunksRef.current, { type: baseMimeType });
        const audioFile = new File([audioBlob], `audio_${Date.now()}.${fileExtension}`, { type: baseMimeType });
        setSelectedFile(audioFile);
        console.log('[Audio Recording] Recording saved as:', audioFile.name, 'type:', baseMimeType);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Clear interval
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        setRecordingTime(0);
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast.success("Gravação iniciada");
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error("Erro ao acessar microfone. Verifique as permissões.");
    }
  };

  // Stop audio recording
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success("Áudio gravado! Clique em enviar para enviar.");
    }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      // Sanitize filename: remove accents and special chars
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

      if (uploadError) {
        throw uploadError;
      }

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

  // Message Action Handlers
  const handleReply = (msg: any) => {
    setReplyingTo({
      id: msg.id,
      evolution_id: msg.evolution_id,
      body: msg.body,
      sender_name: msg.direction === "outbound" ? "Você" : (msg.sender_name || contact?.push_name || "Cliente"),
      direction: msg.direction,
    });
    textareaRef.current?.focus();
  };

  const handleEdit = (msg: any) => {
    setEditingMessage({
      id: msg.id,
      evolution_id: msg.evolution_id,
      body: msg.body,
    });
    setIsEditModalOpen(true);
  };

  const handleDelete = (msg: any) => {
    setDeletingMessage({
      id: msg.id,
      evolution_id: msg.evolution_id,
    });
    setIsDeleteModalOpen(true);
  };

  const handleReact = (msg: any) => {
    setReactingToMessage({
      id: msg.id,
      evolution_id: msg.evolution_id,
      clientNumber: contact?.number || contact?.phone || null,
    });
    setShowEmojiPicker(true);
  };

  const executeEdit = async (newText: string) => {
    if (!editingMessage?.evolution_id || !instance?.apikey) {
      toast.error("Não foi possível editar a mensagem");
      return;
    }

    try {
      await uzapi.editMessage(instance.apikey, editingMessage.evolution_id, newText);

      // Update local database
      await supabase
        .from("messages")
        .update({ body: newText })
        .eq("id", editingMessage.id);

      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast.success("Mensagem editada!");
      setIsEditModalOpen(false);
      setEditingMessage(null);
    } catch (error: any) {
      console.error("Error editing message:", error);
      toast.error("Erro ao editar mensagem");
    }
  };

  const executeDelete = async () => {
    if (!deletingMessage?.evolution_id || !instance?.apikey) {
      toast.error("Não foi possível apagar a mensagem");
      return;
    }

    try {
      await uzapi.deleteMessage(instance.apikey, deletingMessage.evolution_id);

      // Soft delete in local database
      await supabase
        .from("messages")
        .update({ is_deleted: true, body: "[Mensagem apagada]" })
        .eq("id", deletingMessage.id);

      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      toast.success("Mensagem apagada!");
      setIsDeleteModalOpen(false);
      setDeletingMessage(null);
    } catch (error: any) {
      console.error("Error deleting message:", error);
      toast.error("Erro ao apagar mensagem");
    }
  };

  const executeReact = async (emoji: string) => {
    if (!reactingToMessage?.evolution_id || !instance?.apikey || !reactingToMessage.clientNumber) {
      toast.error("Não foi possível reagir à mensagem");
      return;
    }

    try {
      await uzapi.reactToMessage(
        instance.apikey,
        reactingToMessage.clientNumber,
        reactingToMessage.evolution_id,
        emoji
      );
      toast.success(`Reagiu com ${emoji}`);
      setShowEmojiPicker(false);
      setReactingToMessage(null);
    } catch (error: any) {
      console.error("Error reacting to message:", error);
      toast.error("Erro ao reagir à mensagem");
    }
  };

  const handleSend = async () => {
    if ((!message.trim() && !selectedFile) || !conversationId) return;

    // Check if this is an Instagram conversation
    const conversationChannel = (conversation as any)?.channel;

    if (conversationChannel === 'instagram') {
      // Send via Instagram API
      await executeSendInstagramMessage();
      return;
    }

    // For WhatsApp: Check if conversation has an instance assigned
    if (!(conversation as any)?.instance_id) {
      setIsInstanceModalOpen(true);
      return;
    }

    await executeSendMessage((conversation as any).instance_id);
  };

  const executeSendInstagramMessage = async () => {
    const instagramInstanceId = (conversation as any)?.instagram_instance_id;
    const contactInstagramId = (contact as any)?.instagram_id;

    if (!instagramInstanceId || !contactInstagramId) {
      toast.error("Configuração do Instagram incompleta");
      console.error("Missing instagram_instance_id or instagram_id", { instagramInstanceId, contactInstagramId });
      return;
    }

    let finalBody = message;
    let mediaUrl: string | null = null;
    let messageType: 'text' | 'audio' | 'image' = 'text';

    // Upload file if present (audio or image)
    if (selectedFile) {
      setIsUploading(true);

      if (selectedFile.type.startsWith('image/')) {
        messageType = 'image';
      } else if (selectedFile.type.startsWith('audio/')) {
        messageType = 'audio';
      }

      const url = await uploadFile(selectedFile);
      if (!url) {
        setIsUploading(false);
        return;
      }
      mediaUrl = url;
      console.log('[Instagram Send] Uploaded media:', { type: messageType, url: mediaUrl });
    }

    // Validation: need either text or media
    if (!finalBody.trim() && !selectedFile) {
      toast.error("Digite uma mensagem ou anexe um arquivo");
      return;
    }

    setIsUploading(true);

    try {
      // Build payload - KEEP ALL existing fields + add new ones
      const payload: any = {
        instagram_instance_id: instagramInstanceId,
        recipient_id: contactInstagramId,
        conversation_id: conversationId,
        message_type: messageType,
      };

      // Add type-specific field
      if (messageType === 'text') {
        payload.message_text = finalBody;
      } else if (messageType === 'audio') {
        payload.audio_url = mediaUrl;
      } else if (messageType === 'image') {
        payload.image_url = mediaUrl;
      }

      console.log('[Instagram Send] Sending payload:', payload);

      // Send via Instagram Edge Function - it also saves the message to DB
      const { data, error } = await supabase.functions.invoke('instagram-send-message', {
        body: payload
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update conversation status
      await supabase
        .from('conversations')
        .update({
          status: 'open',
          assigned_agent_id: currentTeamMember?.id || (conversation as any)?.assigned_agent_id
        })
        .eq('id', conversationId);

      setMessage("");
      handleRemoveFile();
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });

      const successMsg = messageType === 'audio' ? 'Áudio enviado' :
        messageType === 'image' ? 'Imagem enviada' : 'Mensagem enviada';
      toast.success(successMsg);
    } catch (error: any) {
      console.error("Error sending Instagram message:", error);
      toast.error(error.message || "Erro ao enviar mensagem");
      setIsUploading(false);
    }
  };

  const executeSendMessage = async (instanceId: string, overrideBody?: string, overrideMediaUrl?: string, overrideType?: "text" | "image" | "audio" | "video" | "document") => {
    let finalBody = overrideBody !== undefined ? overrideBody : message;
    let mediaUrl = overrideMediaUrl;
    let messageType: "text" | "image" | "audio" | "video" | "document" = overrideType || "text";

    if (selectedFile && !overrideMediaUrl) {
      setIsUploading(true);
      const url = await uploadFile(selectedFile);
      if (!url) {
        setIsUploading(false);
        return;
      }
      mediaUrl = url;

      // Determine message type based on file type
      if (selectedFile.type.startsWith('image/')) messageType = 'image';
      else if (selectedFile.type.startsWith('audio/')) messageType = 'audio';
      else if (selectedFile.type.startsWith('video/')) messageType = 'video';
      else messageType = 'document';

      // If it's a document, use the filename as body if message is empty
      if (messageType === 'document' && !finalBody) {
        finalBody = selectedFile.name;
      }
    }

    // Se o ticket estiver aberto, verificar se deve adicionar assinatura
    const tm = currentTeamMember as any;
    // sign_messages: true (ligado) = envia assinatura / false (desligado) = não envia
    // Se undefined, assume true (default)
    const signMessagesValue = tm?.sign_messages;
    const shouldSignMessages = signMessagesValue === true || signMessagesValue === undefined;



    if ((conversation?.status as string) === 'open' && messageType === 'text' && shouldSignMessages) {
      const senderName = tm?.full_name || tm?.name || "Atendente";
      finalBody = `*${senderName}:*\n${finalBody}`;
    }

    sendMessageMutation.mutate({
      conversationId: conversationId!,
      body: finalBody,
      direction: "outbound",
      messageType,
      mediaUrl,
      caption: messageType !== 'text' ? finalBody : undefined,
      replyId: replyingTo?.evolution_id || undefined,
      quotedBody: replyingTo?.body || undefined,
      quotedSender: replyingTo?.sender_name || undefined
    }, {
      onSuccess: async () => {
        if (!overrideBody) setMessage(""); // Only clear input if manual send
        setReplyingTo(null); // Clear reply state
        handleRemoveFile();
        setIsUploading(false);

        // Atribuir conversa ao agente que enviou a mensagem (se não estiver já aberta)
        if (currentTeamMember?.id && conversation?.status !== 'open') {
          const { error: assignError } = await supabase
            .from('conversations')
            .update({
              status: 'open',
              assigned_agent_id: currentTeamMember.id
            })
            .eq('id', conversationId);

          if (assignError) {
            console.error("Error assigning conversation:", assignError);
          } else {
            // Invalidar cache para atualizar lista
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
          }
        }
      },
      onError: () => {
        setIsUploading(false);
      }
    });
  };

  const handleInstanceSelect = async (instanceId: string) => {

    // Update conversation with selected instance
    const { error } = await supabase
      .from('conversations')
      .update({ instance_id: instanceId })
      .eq('id', conversationId);

    if (error) {
      console.error("Error updating conversation instance:", error);
      return;
    }



    // Optimistically update cache
    queryClient.setQueryData(["conversation", conversationId], (oldData: any) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        instance_id: instanceId
      };
    });

    // Invalidate conversation query to reflect the change immediately
    await queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });

    // Proceed to send message
    await executeSendMessage(instanceId);
  };

  const handleResolve = () => {
    if (conversationId) {
      resolveConversation.mutate(conversationId);
    }
  };

  // Helper to highlight text and render links
  const HighlightText = ({ text, highlight }: { text: string, highlight: string }) => {
    // URL regex pattern
    const urlRegex = /(https?:\/\/[^\s]+)/gi;

    // First, split by URLs to identify link parts
    const parts = text.split(urlRegex);

    return (
      <span>
        {parts.map((part, i) => {
          // Check if this part is a URL
          if (urlRegex.test(part)) {
            // Reset regex lastIndex after test
            urlRegex.lastIndex = 0;
            return (
              <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {part}
              </a>
            );
          }

          // For non-URL parts, apply search highlighting if needed
          if (!highlight.trim()) return <span key={i}>{part}</span>;

          const highlightParts = part.split(new RegExp(`(${highlight})`, 'gi'));
          return (
            <span key={i}>
              {highlightParts.map((hPart, j) =>
                hPart.toLowerCase() === highlight.toLowerCase() ? (
                  <span key={j} className="bg-yellow-200 text-black font-medium px-0.5 rounded">
                    {hPart}
                  </span>
                ) : (
                  hPart
                )
              )}
            </span>
          );
        })}
      </span>
    );
  };

  // Helper to remove sender name prefix for display
  const cleanMessageBody = (body: string) => {
    if (!body) return "";
    // Removes "*Name:*\n" pattern from the start of the string
    return body.replace(/^\*[^*]+:\*\n/, "");
  };

  const handleQuickMessageSelect = (qm: QuickMessage) => {
    setSelectedQuickMessage(qm);
    setIsQuickMessageConfirmOpen(true);
    setShowQuickMessagePopup(false);
    setMessage(""); // Clear the slash command
  };

  const handleConfirmQuickMessage = async () => {
    if (!selectedQuickMessage || !conversationId) return;

    // Check if conversation has an instance assigned
    if (!(conversation as any)?.instance_id) {
      setIsInstanceModalOpen(true);
      return;
    }

    await executeSendMessage(
      (conversation as any).instance_id,
      selectedQuickMessage.content || "",
      selectedQuickMessage.media_url || undefined,
      selectedQuickMessage.message_type
    );
    setIsQuickMessageConfirmOpen(false);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
  };

  if (!conversationId) {
    return (
      <div className="flex-1 h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Selecione uma conversa para começar</p>
      </div>
    );
  }

  // Filter messages for rendering refs
  const searchMatches = searchTerm
    ? messages.filter(msg => msg.body?.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  return (
    <div className={cn("flex-1 flex flex-col bg-background relative w-full min-w-0", isMobile ? "h-full" : "h-screen")}>
      {/* Header - Hidden on mobile (Index.tsx provides its own header) */}
      {!isMobile && (
        <div className="p-4 border-b border-[#1E2229]/20 dark:border-border bg-white dark:bg-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={profilePic || undefined} />
              <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{displayName}</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {(contact as any)?.instagram_id ? (
                    <>
                      <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#F05D57' }} />
                      Instagram
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#22C55E' }} />
                      WhatsApp
                    </>
                  )}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">


            {/* Avatar da instância conectada */}
            {instanceName && (
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={instance?.profile_pic_url || undefined} />
                  <AvatarFallback>{instanceName[0]?.toUpperCase() || 'A'}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">{instanceName}</span>
              </div>
            )}

            {/* Hide Actions for Groups */}
            {!isGroup && (
              <>
                <QueueSelector
                  conversationId={conversationId}
                  currentQueueId={(conversation as any)?.queue_id}
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatus.mutate({ conversationId, status: 'open' })}
                  disabled={(conversation?.status as string) === 'open' || updateStatus.isPending}
                  className={(conversation?.status as string) === 'open' ? "opacity-50 cursor-not-allowed" : ""}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {(conversation?.status as string) === 'open' ? "Ticket Aberto" : "Atender Ticket"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResolve}
                  disabled={resolveConversation.isPending || (conversation?.status as any) === "resolved"}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {(conversation?.status as any) === "resolved" ? "Resolvido" : "Resolver Ticket"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea
        className={cn(
          "flex-1 w-full",
          isMobile ? "px-2 py-2" : "p-4"
        )}
        onScroll={handleScroll}
        disableOverflowX={true}
      >
        {isLoading ? (
          <div className="text-center text-muted-foreground">Carregando mensagens...</div>
        ) : (
          <div className={cn("space-y-4 w-full min-w-0", !isMobile && "max-w-4xl mx-auto")}>
            {/* Performance: Show Load More button if there are more messages */}
            {messages.length > visibleMessagesCount && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleMessagesCount(prev => prev + MESSAGES_PER_PAGE)}
                  className="text-xs"
                >
                  Carregar mais ({messages.length - visibleMessagesCount} mensagens anteriores)
                </Button>
              </div>
            )}

            {/* Performance: Only render last N messages */}
            {messages.slice(-visibleMessagesCount).map((msg) => {
              const isMatch = searchTerm && msg.body?.toLowerCase().includes(searchTerm.toLowerCase());
              const matchIndex = isMatch ? searchMatches.findIndex(m => m.id === msg.id) : -1;

              const isGroupMsg = !!conversation?.group_id; // Use conversation state to determine group
              let senderName = msg.sender_name;

              if (!senderName) {
                if (isGroupMsg) {
                  senderName = msg.sender_jid ? `+${msg.sender_jid.split('@')[0]}` : "Membro";
                } else {
                  senderName = displayName;
                }
              }

              // For groups, we use the sender's pic (saved in msg). For individuals, we can fallback to contact pic.
              const senderPic = msg.sender_profile_pic_url || (isGroupMsg ? undefined : profilePic);

              return (
                <div
                  key={msg.id}
                  ref={el => {
                    if (isMatch && matchIndex !== -1) {
                      matchRefs.current[matchIndex] = el;
                    }
                  }}
                  className={cn(
                    "flex gap-2 transition-colors duration-300 items-end",
                    msg.direction === "outbound" ? "justify-end" : "justify-start",
                    isMatch && matchIndex === currentMatchIndex ? "bg-yellow-100/10 rounded-lg p-1 -m-1" : ""
                  )}
                >
                  {msg.direction === "inbound" && (
                    <Avatar
                      className={cn("w-8 h-8", isGroupMsg && "cursor-pointer hover:opacity-80")}
                      onClick={() => {
                        if (isGroupMsg && msg.sender_jid) {
                          const phone = msg.sender_jid.split('@')[0];
                          onOpenNewMessage?.(phone);
                        }
                      }}
                    >
                      <AvatarImage src={senderPic || undefined} />
                      <AvatarFallback>{senderName[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  )}

                  {/* Message Bubble with Actions Menu */}
                  <div className={cn(
                    "group relative flex items-end gap-1 min-w-0",
                    isMobile ? "max-w-[calc(100%-3rem)]" : "max-w-[70%]"
                  )}>
                    {/* Actions Menu - Left side for outbound, Right side for inbound */}
                    {msg.direction === "outbound" && (
                      <MessageActionsMenu
                        message={msg as any}
                        onReply={() => handleReply(msg)}
                        onEdit={() => handleEdit(msg)}
                        onDelete={() => handleDelete(msg)}
                        onReact={() => handleReact(msg)}
                        className="self-center shrink-0"
                      />
                    )}

                    <div
                      className={cn(
                        "rounded-lg p-3 overflow-hidden min-w-0 break-words",
                        msg.direction === "outbound"
                          ? "bg-[#DCF7C5] text-gray-800 dark:bg-[#044740] dark:text-white"
                          : "bg-white dark:bg-[hsl(var(--chat-customer))] text-gray-800 dark:text-foreground"
                      )}
                    >
                      {/* Show Sender Name in Group Chats */}
                      {isGroup && msg.direction === 'inbound' && (
                        <p className="text-xs font-bold mb-1 text-primary-foreground/80">
                          {senderName}
                        </p>
                      )}

                      {/* Show Quoted Message if this is a reply */}
                      {(msg as any).quoted_body && (
                        <QuotedMessage
                          quotedBody={(msg as any).quoted_body}
                          quotedSender={(msg as any).quoted_sender}
                          isOutbound={msg.direction === "outbound"}
                        />
                      )}

                      {/* Renderizar imagem - LAZY LOADING */}
                      {msg.message_type === 'image' && msg.media_url && (
                        <LazyMedia type="image" src={msg.media_url} alt="Imagem" />
                      )}

                      {/* Renderizar áudio */}
                      {msg.message_type === 'audio' && msg.media_url && (
                        <div className="flex flex-col gap-1 min-w-[280px]">
                          <audio controls className="w-full">
                            <source src={msg.media_url} type="audio/ogg" />
                            <source src={msg.media_url} type="audio/mpeg" />
                            <source src={msg.media_url} type="audio/webm" />
                            Seu navegador não suporta o elemento de áudio.
                          </audio>
                          {/* Transcrição do Áudio */}
                          {(msg as any).transcription && (
                            <div className={`text-xs italic p-2 rounded border ${(msg as any).transcription.startsWith('[ERRO]')
                              ? 'text-red-500 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                              : 'text-black dark:text-gray-200 bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5'
                              }`}>
                              <span className="font-semibold not-italic">
                                {(msg as any).transcription.startsWith('[ERRO]') ? '⚠️ Erro:' : 'Transcrição:'}
                              </span>{' '}
                              {(msg as any).transcription.replace('[ERRO] ', '')}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Renderizar vídeo - LAZY LOADING */}
                      {msg.message_type === 'video' && msg.media_url && (
                        <LazyMedia type="video" src={msg.media_url} />
                      )}

                      {/* Renderizar documento */}
                      {msg.message_type === 'document' && msg.media_url && (() => {
                        const fileName = msg.body || 'Documento';
                        const fileExt = fileName.toLowerCase().split('.').pop() || '';

                        // Determinar ícone e cor baseado na extensão
                        let FileIcon = Paperclip;
                        let iconColor = 'text-gray-500 dark:text-gray-400';

                        if (fileExt === 'pdf') {
                          FileIcon = FileText;
                          iconColor = 'text-red-500 dark:text-red-400';
                        } else if (['doc', 'docx'].includes(fileExt)) {
                          FileIcon = FileText;
                          iconColor = 'text-blue-500 dark:text-blue-400';
                        } else if (['xls', 'xlsx', 'csv'].includes(fileExt)) {
                          FileIcon = FileText;
                          iconColor = 'text-green-500 dark:text-green-400';
                        } else if (['ppt', 'pptx'].includes(fileExt)) {
                          FileIcon = FileText;
                          iconColor = 'text-orange-500 dark:text-orange-400';
                        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) {
                          FileIcon = ImageIcon;
                          iconColor = 'text-purple-500 dark:text-purple-400';
                        }

                        return (
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm underline mb-2 hover:opacity-80 transition-opacity"
                          >
                            <FileIcon className={`w-4 h-4 shrink-0 ${iconColor}`} />
                            <span className="truncate">{fileName}</span>
                          </a>
                        );
                      })()}

                      {/* Texto da mensagem */}
                      {msg.body && msg.message_type !== 'document' && msg.message_type !== 'audio' && msg.body !== '[Áudio]' && (
                        <p className="text-sm break-words whitespace-pre-wrap">
                          <HighlightText text={cleanMessageBody(msg.body)} highlight={searchTerm} />
                        </p>
                      )}

                      <span className={cn(
                        "text-xs mt-1 flex items-center gap-1",
                        msg.direction === "outbound" ? "text-gray-800/70 dark:text-white/70" : "text-muted-foreground"
                      )}>
                        {new Date(msg.created_at || "").toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {/* Read Receipt Icons - Show on all messages */}
                        <span className="ml-1">
                          {(() => {
                            const status = (msg as any).status;
                            if (status === 'read') {
                              // Double check green = read
                              return <CheckCheck className="w-4 h-4 text-green-400" />;
                            } else if (status === 'delivered') {
                              // Single check green = delivered
                              return <Check className="w-4 h-4 text-green-400" />;
                            } else {
                              // Single check gray = sent/pending
                              if (msg.direction === "outbound") {
                                return <Check className="w-4 h-4 text-gray-400" />;
                              }
                              // For inbound messages, show double check gray (we received it)
                              return <CheckCheck className="w-4 h-4 text-gray-500" />;
                            }
                          })()}
                        </span>
                      </span>
                    </div>

                    {/* Actions Menu - Right side for inbound */}
                    {msg.direction === "inbound" && (
                      <MessageActionsMenu
                        message={msg as any}
                        onReply={() => handleReply(msg)}
                        onEdit={() => handleEdit(msg)}
                        onDelete={() => handleDelete(msg)}
                        onReact={() => handleReact(msg)}
                        className="self-center"
                      />
                    )}

                    {/* Avatar para mensagens enviadas */}
                    {msg.direction === "outbound" && (
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={instance?.profile_pic_url || undefined} />
                        <AvatarFallback>EU</AvatarFallback>
                      </Avatar>
                    )}
                  </div>

                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>
        )
        }
      </ScrollArea>

      {/* Quick Message Popup */}
      {showQuickMessagePopup && (
        <div className="absolute bottom-[80px] left-4 bg-popover border rounded-lg shadow-lg w-[300px] max-h-[300px] overflow-y-auto z-50">
          <div className="p-2 text-xs font-semibold text-muted-foreground border-b">
            Mensagens Rápidas
          </div>
          {filteredQuickMessages.map((qm) => (
            <button
              key={qm.id}
              className="w-full text-left p-2 hover:bg-accent flex items-center gap-2 text-sm"
              onClick={() => handleQuickMessageSelect(qm)}
            >
              <span className="font-bold text-primary">/{qm.shortcut}</span>
              <span className="text-muted-foreground truncate flex-1">
                {qm.content || (qm.media_url ? "Mídia" : "")}
              </span>
              {qm.message_type === 'text' && <FileText className="w-3 h-3 text-muted-foreground" />}
              {qm.message_type === 'image' && <ImageIcon className="w-3 h-3 text-muted-foreground" />}
              {qm.message_type === 'audio' && <Mic className="w-3 h-3 text-muted-foreground" />}
              {qm.message_type === 'video' && <Video className="w-3 h-3 text-muted-foreground" />}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-[#1E2229]/20 dark:border-border bg-white dark:bg-transparent">
        {selectedFile && (
          <div className="mb-2 p-2 bg-muted rounded-md flex items-center gap-3">
            {/* Show image preview if file is an image */}
            {selectedFile.type.startsWith('image/') ? (
              <img
                src={URL.createObjectURL(selectedFile)}
                alt="Preview"
                className="max-h-32 max-w-48 rounded object-contain"
              />
            ) : selectedFile.type.startsWith('audio/') ? (
              /* Show audio player for audio files */
              <div className="flex items-center gap-2 flex-1">
                <Mic className="w-5 h-5 text-primary" />
                <audio controls className="flex-1 h-8">
                  <source src={URL.createObjectURL(selectedFile)} type={selectedFile.type} />
                </audio>
              </div>
            ) : (
              <span className="text-sm text-foreground truncate max-w-[200px]">{selectedFile.name}</span>
            )}
            <Button variant="ghost" size="sm" onClick={handleRemoveFile} className="ml-auto">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {(conversation?.status as any) === "resolved" ? (
          <div className="flex items-center justify-center p-4 bg-muted/50 rounded-lg border border-dashed">
            <p className="text-muted-foreground flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Este ticket foi resolvido. O chat está fechado para novas mensagens.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Reply Quote Box */}
            {replyingTo && (
              <ReplyQuoteBox
                message={replyingTo as any}
                onCancel={() => setReplyingTo(null)}
                className="mx-2"
              />
            )}
            <div className="flex gap-2 items-center">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Mobile: Show compact action menu */}
              {isMobile ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Plus className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="w-4 h-4 mr-2" />
                      Anexar arquivo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsEmojiOpen(true)}>
                      <Smile className="w-4 h-4 mr-2" />
                      Emojis
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={isRecording ? handleStopRecording : handleStartRecording}>
                      <Mic className={cn("w-4 h-4 mr-2", isRecording && "text-red-500")} />
                      {isRecording ? "Parar gravação" : "Gravar áudio"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAiAction('generate')}>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Usar IA
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowQuickMessagePopup(true)}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Mensagens rápidas
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                /* Desktop: Show all buttons */
                <>
                  <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="w-5 h-5" />
                  </Button>

                  <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Smile className="w-5 h-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0 border-none">
                      <EmojiPicker onEmojiClick={handleEmojiClick} />
                    </PopoverContent>
                  </Popover>
                </>
              )}

              {/* Emoji Picker Popover for Mobile (opened via dropdown) */}
              {isMobile && (
                <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                  <PopoverTrigger className="hidden" />
                  <PopoverContent className="w-full p-0 border-none">
                    <EmojiPicker onEmojiClick={handleEmojiClick} />
                  </PopoverContent>
                </Popover>
              )}

              <Textarea
                ref={textareaRef}
                placeholder={isMobile ? "Digite sua mensagem..." : "Digite sua mensagem ou / para mensagens rápidas..."}
                value={message}
                onChange={handleMessageChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                onPaste={handlePaste}
                rows={1}
                className="flex-1 min-h-[40px] max-h-[200px] resize-none py-3 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent"
                disabled={isUploading}
              />

              {/* Desktop only: Quick Messages and Audio buttons */}
              {!isMobile && (
                <>
                  <QuickMessagesMenu />

                  {/* Audio Recording Button */}
                  {isRecording ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-red-500 font-medium animate-pulse">
                        {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
                        {(recordingTime % 60).toString().padStart(2, '0')}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleStopRecording}
                        className="text-red-500 hover:text-red-600 hover:bg-red-100"
                      >
                        <StopCircle className="w-5 h-5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleStartRecording}
                      title="Gravar áudio"
                    >
                      <Mic className="w-5 h-5" />
                    </Button>
                  )}

                  {!message.trim() ? (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleAiAction('generate')}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 hover:opacity-90 transition-all duration-300"
                      title="Gerar resposta com IA"
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

                  {/* NPS Survey Button */}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSurveyModal(true)}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 hover:opacity-90 transition-all duration-300"
                    title="Enviar pesquisa de satisfação"
                  >
                    <ClipboardList className="w-5 h-5" />
                  </Button>
                </>
              )}

              {/* Mobile: Recording indicator */}
              {isMobile && isRecording && (
                <span className="text-sm text-red-500 font-medium animate-pulse">
                  {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
                  {(recordingTime % 60).toString().padStart(2, '0')}
                </span>
              )}

              <Button
                onClick={handleSend}
                disabled={(!message.trim() && !selectedFile) || sendMessageMutation.isPending || isUploading}
              >
                {isUploading ? "..." : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute bottom-24 right-6 rounded-full shadow-lg z-40 bg-primary text-primary-foreground hover:bg-primary/90 animate-in fade-in zoom-in duration-300"
          onClick={scrollToBottom}
        >
          <ArrowDown className="w-5 h-5" />
        </Button>
      )}

      <InstanceSelectorModal
        open={isInstanceModalOpen}
        onOpenChange={setIsInstanceModalOpen}
        onSelect={handleInstanceSelect}
      />

      <QuickMessageConfirmationModal
        open={isQuickMessageConfirmOpen}
        onOpenChange={setIsQuickMessageConfirmOpen}
        message={selectedQuickMessage}
        onConfirm={handleConfirmQuickMessage}
      />

      {/* Message Action Modals */}
      <EditMessageModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        messageBody={editingMessage?.body || ""}
        onSave={executeEdit}
      />

      <DeleteMessageModal
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        onConfirm={executeDelete}
      />

      {/* Emoji Reaction Picker Popup */}
      {showEmojiPicker && reactingToMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEmojiPicker(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <EmojiPickerStandalone
              onSelect={executeReact}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        </div>
      )}

      {/* NPS Survey Confirmation Modal */}
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
    </div >
  );
};

