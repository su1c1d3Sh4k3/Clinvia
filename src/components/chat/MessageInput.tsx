import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Send, Paperclip, Smile, Mic, Sparkles, X, StopCircle, Image as ImageIcon, Video, FileText, Zap, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { QuickMessagesMenu } from "@/components/QuickMessagesMenu";

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
    handleSend: () => void;
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
    isSendingSurvey
}: MessageInputProps) => {

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmojiOpen, setIsEmojiOpen] = useState(false);

    // Quick Message Popup State
    const [showQuickMessagePopup, setShowQuickMessagePopup] = useState(false);
    const [filteredQuickMessages, setFilteredQuickMessages] = useState<QuickMessage[]>([]);

    const onEmojiClick = (emojiData: EmojiClickData) => {
        setMessage(message + emojiData.emoji);
        setIsEmojiOpen(false);
    };

    // Auto-resize textarea
    const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setMessage(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
    }

    // Handle Slash Command
    useEffect(() => {
        if (message.startsWith('/')) {
            const query = message.slice(1).toLowerCase();
            const matches = quickMessages.filter(qm => qm.shortcut.toLowerCase().includes(query));
            setFilteredQuickMessages(matches);
            setShowQuickMessagePopup(matches.length > 0);
        } else {
            setShowQuickMessagePopup(false);
        }
    }, [message, quickMessages]);

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
                                handleSend();
                            }
                        }}
                        placeholder="Digite uma mensagem"
                        className="min-h-[44px] max-h-[120px] py-3 px-4 w-full bg-transparent border-none focus-visible:ring-0 resize-none text-[15px] leading-relaxed placeholder:text-muted-foreground/60 scrollbar-thin scrollbar-thumb-rounded-full"
                        rows={1}
                    />
                </div>

                {message.trim() || selectedFile ? (
                    <Button onClick={handleSend} disabled={isUploading} size="icon" className="h-11 w-11 rounded-full shrink-0 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 bg-primary hover:bg-primary/90">
                        <Send className="w-5 h-5 text-primary-foreground ml-0.5" />
                    </Button>
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
