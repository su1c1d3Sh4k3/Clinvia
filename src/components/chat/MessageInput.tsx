import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Send, Paperclip, Smile, Mic, Sparkles, X, StopCircle, Image as ImageIcon, Video, FileText, Zap, ClipboardList, CheckCircle, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { QuickMessagesMenu } from "@/components/QuickMessagesMenu";
import { useGroupMembers, GroupMember } from "@/hooks/useGroupMembers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface QuickMessage {
    id: string;
    shortcut: string;
    message_type: 'text' | 'image' | 'audio' | 'video';
    content: string | null;
    media_url: string | null;
}

/**
 * Props for the MessageInput component.
 */
interface MessageInputProps {
    /** Current value of the message input */
    message: string;
    /** Function to update the message input value */
    setMessage: (msg: string) => void;
    /** Function to handle sending the message */
    handleSend: (options?: { mentions?: string[], body?: string }) => void;
    /** Function to handle file selection from the attachment menu */
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    /** The currently selected file, if any */
    selectedFile: File | null;
    /** Function to remove the selected file */
    handleRemoveFile: () => void;
    /** Whether audio recording is in progress */
    isRecording: boolean;
    /** Function to start audio recording */
    handleStartRecording: () => void;
    /** Function to stop audio recording */
    handleStopRecording: () => void;
    /** Current duration of the recording in seconds */
    recordingTime: number;
    /** Whether a file or message is currently being uploaded/sent */
    isUploading: boolean;
    /** Function to trigger AI actions (fix, improve, generate) */
    handleAiAction: (mode: 'generate' | 'fix' | 'improve') => void;
    /** Whether the component is being rendered on a mobile device */
    isMobile?: boolean;
    /** The message being replied to, if any */
    replyingTo: any;
    /** Function to set or clear the message being replied to */
    setReplyingTo: (val: any) => void;
    /** Handler for paste events (e.g. pasting images) */
    handlePaste: (e: React.ClipboardEvent) => void;
    /** List of quick messages available for the user */
    quickMessages?: QuickMessage[];
    /** Handler when a quick message is selected from the popup or menu */
    onQuickMessageSelect?: (qm: QuickMessage) => void;
    /** Handler to trigger the satisfaction survey */
    onSendSurvey?: () => void;
    /** Whether the survey is currently being sent */
    isSendingSurvey?: boolean;
    /** Conversation ID for fetching group members */
    conversationId?: string;
    /** Whether the current chat is a group */
    isGroup?: boolean;
}

/**
 * MessageInput Component
 * 
 * Renders the text area and controls for sending messages, including:
 * - Text input with auto-resize
 * - File attachments (images, videos, documents)
 * - Emoji picker
 * - Audio recording
 * - Quick messages (via slash command or menu)
 * - AI integration
 * - Group Member Mentions (@)
 */
export const MessageInput = ({
    message,
    setMessage,
    handleSend,
    handleFileSelect,
    selectedFile,
    handleRemoveFile,
    isRecording,
    handleStartRecording,
    handleStopRecording,
    recordingTime,
    isUploading,
    handleAiAction,
    isMobile = false,
    replyingTo,
    setReplyingTo,
    handlePaste,
    quickMessages = [],
    onQuickMessageSelect,
    onSendSurvey,
    isSendingSurvey,
    conversationId,
    isGroup = false
}: MessageInputProps) => {

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmojiOpen, setIsEmojiOpen] = useState(false);

    // Quick Message Popup State
    const [showQuickMessagePopup, setShowQuickMessagePopup] = useState(false);
    const [filteredQuickMessages, setFilteredQuickMessages] = useState<QuickMessage[]>([]);

    // Mention Popup State
    const [showMentionPopup, setShowMentionPopup] = useState(false);
    const [filteredMembers, setFilteredMembers] = useState<GroupMember[]>([]);
    const [mentionQuery, setMentionQuery] = useState("");
    const [cursorPosition, setCursorPosition] = useState(0);

    const { data: groupMembers } = useGroupMembers(conversationId, isGroup);

    const onEmojiClick = (emojiData: EmojiClickData) => {
        setMessage(message + emojiData.emoji);
        setIsEmojiOpen(false);
    };

    // Auto-resize textarea and Handle Mentions/QuickMessages
    const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const newCursorPosition = e.target.selectionStart;
        setMessage(newValue);
        setCursorPosition(newCursorPosition);

        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
    }

    // Effect to handle popup filtering based on cursor position and content
    useEffect(() => {
        // Quick Messages (starts with /)
        if (message.startsWith('/')) {
            const query = message.slice(1).toLowerCase();
            const matches = quickMessages.filter(qm => qm.shortcut.toLowerCase().includes(query));
            setFilteredQuickMessages(matches);
            setShowQuickMessagePopup(matches.length > 0);
            setShowMentionPopup(false);
            return;
        } else {
            setShowQuickMessagePopup(false);
        }

        // Mentions (contains @) - logic to find the active word being typed
        if (isGroup && groupMembers && groupMembers.length > 0) {
            const textBeforeCursor = message.slice(0, cursorPosition);
            const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');

            if (lastAtSymbolIndex !== -1) {
                // Check if the @ is at the start or preceded by a space
                const isStartOrSpace = lastAtSymbolIndex === 0 || textBeforeCursor[lastAtSymbolIndex - 1] === ' ';

                if (isStartOrSpace) {
                    const query = textBeforeCursor.slice(lastAtSymbolIndex + 1).toLowerCase();
                    // Don't show if the query contains a space (end of mention)
                    if (!query.includes(' ')) {
                        setMentionQuery(query);
                        const matches = groupMembers.filter(member =>
                        (member.push_name?.toLowerCase().includes(query) ||
                            member.number.includes(query))
                        );
                        setFilteredMembers(matches);
                        setShowMentionPopup(matches.length > 0);
                        return;
                    }
                }
            }
        }
        setShowMentionPopup(false);
    }, [message, cursorPosition, quickMessages, isGroup, groupMembers]);

    // Effect to reset textarea height when message is cleared (e.g. after sending)
    useEffect(() => {
        if (message === "" && textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    }, [message]);

    const handleMentionSelect = (member: GroupMember) => {
        const textBeforeCursor = message.slice(0, cursorPosition);
        const lastAtSymbolIndex = textBeforeCursor.lastIndexOf('@');

        // Use push_name or number if name is missing
        const mentionName = member.push_name || member.number;

        const prefix = message.slice(0, lastAtSymbolIndex);
        const suffix = message.slice(cursorPosition);

        // We will insert "@Name "
        const insertedText = `@${mentionName} `;
        setMessage(`${prefix}${insertedText}${suffix}`);
        setShowMentionPopup(false);

        // Reset focus
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const newPos = prefix.length + insertedText.length;
                textareaRef.current.setSelectionRange(newPos, newPos);
            }
        }, 10);
    };

    const onSendClick = () => {
        if (isGroup && groupMembers) {
            let processedMessage = message;
            const mentions: string[] = [];

            // Sort members by name length descending to avoid partial matches on substrings
            const sortedMembers = [...groupMembers].sort((a, b) => (b.push_name?.length || 0) - (a.push_name?.length || 0));

            sortedMembers.forEach(member => {
                const name = member.push_name || member.number;
                // Escape special regex chars in name
                const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const mentionPattern = new RegExp(`@${escapedName}`, 'g');

                if (mentionPattern.test(processedMessage)) {
                    mentions.push(member.number); // Keep full JID/number for API metadata if needed.

                    // Replace @Name with @LID or @CleanNumber in the body for sending
                    // If member has LID, use it! Otherwise fallback to cleanNumber.
                    const replacementId = member.lid || member.cleanNumber || member.number.split('@')[0];
                    processedMessage = processedMessage.replace(mentionPattern, `@${replacementId}`);
                }
            });

            if (mentions.length > 0) {
                handleSend({ mentions, body: processedMessage });
                return;
            }
        }

        handleSend();
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className={cn("bg-white dark:bg-[#202c33] border-t border-[#1E2229]/20 dark:border-border px-4 py-2", isMobile ? "pb-4" : "")}>
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
                            onClick={() => {
                                onQuickMessageSelect?.(qm);
                                setShowQuickMessagePopup(false);
                            }}
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

            {/* Mention Popup */}
            {showMentionPopup && (
                <div className="absolute bottom-[80px] left-4 bg-popover border rounded-lg shadow-lg w-[300px] max-h-[300px] overflow-y-auto z-50 animate-in fade-in slide-in-from-bottom-2">
                    <div className="p-2 text-xs font-semibold text-muted-foreground border-b flex items-center gap-2">
                        <AtSign className="w-3 h-3" />
                        Mencionar Membro
                    </div>
                    {filteredMembers.map((member) => (
                        <button
                            key={member.id}
                            className="w-full text-left p-2 hover:bg-accent flex items-center gap-3 text-sm transition-colors"
                            onClick={() => handleMentionSelect(member)}
                        >
                            <Avatar className="w-8 h-8">
                                <AvatarImage src={member.profile_pic_url || undefined} />
                                <AvatarFallback>{(member.push_name || "?")[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col overflow-hidden text-left">
                                <span className="font-medium text-foreground truncate">{member.push_name || "Desconhecido"}</span>
                                <span className="text-xs text-muted-foreground truncate">{member.cleanNumber || member.number}</span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Replying Banner */}
            {replyingTo && (
                <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 p-2 rounded-lg mb-2 border-l-4 border-primary">
                    <div className="flex flex-col text-sm overflow-hidden">
                        <span className="font-bold text-primary truncate">{replyingTo.sender_name}</span>
                        <span className="text-muted-foreground truncate">{replyingTo.body || "Mídia"}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyingTo(null)}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {/* File Preview */}
            {selectedFile && (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg mb-2">
                    <div className="p-2 bg-primary/10 rounded">
                        {selectedFile.type.startsWith('image/') ? <ImageIcon className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}

            <div className="flex items-end gap-2">
                <div className="flex gap-2 pb-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted/50">
                                <Paperclip className="w-5 h-5 text-muted-foreground" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-2" align="start" side="top">
                            <div className="flex flex-col gap-1">
                                <label className="flex items-center gap-2 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors">
                                    <ImageIcon className="w-4 h-4 text-blue-500" />
                                    <span className="text-sm">Fotos e Vídeos</span>
                                    <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileSelect} ref={fileInputRef} />
                                </label>
                                <label className="flex items-center gap-2 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors">
                                    <FileText className="w-4 h-4 text-purple-500" />
                                    <span className="text-sm">Documento</span>
                                    <input type="file" className="hidden" accept="*" onChange={handleFileSelect} />
                                </label>
                            </div>
                        </PopoverContent>
                    </Popover>

                    <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted/50">
                                <Smile className="w-5 h-5 text-muted-foreground" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0 border-none shadow-xl" align="start" side="top">
                            <EmojiPicker onEmojiClick={onEmojiClick} searchPlaceholder="Buscar emoji..." width="100%" height={350} previewConfig={{ showPreview: false }} />
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="flex-1 relative bg-white dark:bg-[#2A3942] rounded-2xl border border-transparent focus-within:border-primary/50 transition-colors">
                    <Textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleMessageChange}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                onSendClick();
                            }
                        }}
                        placeholder="Digite uma mensagem"
                        className="min-h-[44px] max-h-[120px] py-3 px-4 w-full bg-transparent border-none focus-visible:ring-0 resize-none text-[15px] leading-relaxed placeholder:text-muted-foreground/60 scrollbar-thin scrollbar-thumb-rounded-full"
                        rows={1}
                    />
                </div>

                {message.trim() || selectedFile ? (
                    <div className="flex items-center gap-2">
                        {message.trim().length > 0 && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-11 w-11 rounded-full bg-yellow-400 hover:bg-yellow-500 text-white shrink-0 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95"
                                        title="Opções de IA"
                                    >
                                        <Sparkles className="w-5 h-5 text-white" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" align="end" side="top">
                                    <div className="flex flex-col gap-1">
                                        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handleAiAction("fix")}>
                                            <CheckCircle className="w-4 h-4 text-purple-500" />
                                            Corrigir ortografia
                                        </Button>
                                        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handleAiAction("improve")}>
                                            <Sparkles className="w-4 h-4 text-purple-500" />
                                            Melhorar resposta
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                        <Button onClick={onSendClick} disabled={isUploading} size="icon" className="h-11 w-11 rounded-full shrink-0 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 bg-primary hover:bg-primary/90">
                            <Send className="w-5 h-5 text-primary-foreground ml-0.5" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex gap-2 items-center pb-1">
                        {!isMobile && (
                            <>
                                <QuickMessagesMenu />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onSendSurvey}
                                    disabled={isSendingSurvey}
                                    className="h-11 w-11 rounded-full hover:bg-muted/50 transition-colors"
                                    title="Enviar pesquisa de satisfação"
                                >
                                    <ClipboardList className="w-5 h-5 text-emerald-500" />
                                </Button>
                            </>
                        )}

                        {/* Audio Recording Button */}
                        <Button
                            variant={isRecording ? "destructive" : "ghost"}
                            size="icon"
                            className={cn("h-11 w-11 rounded-full transition-all duration-300", isRecording ? "animate-pulse shadow-lg scale-110" : "hover:bg-muted/50")}
                            onClick={isRecording ? handleStopRecording : handleStartRecording}
                        >
                            {isRecording ? <StopCircle className="w-6 h-6" /> : <Mic className="w-5 h-5 text-muted-foreground" />}
                        </Button>

                        {/* AI Actions Button */}
                        {!isRecording && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full hover:bg-muted/50 transition-colors">
                                        <Sparkles className="w-5 h-5 text-yellow-500/80" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" align="end" side="top">
                                    <div className="flex flex-col gap-1">
                                        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handleAiAction("fix")}>✨ Corrigir ortografia</Button>
                                        <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handleAiAction("improve")}>🚀 Melhorar resposta</Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                        {isRecording && <span className="text-red-500 font-medium animate-pulse text-sm min-w-[50px]">{formatTime(recordingTime)}</span>}
                    </div>
                )}
            </div>
        </div>
    );
};
