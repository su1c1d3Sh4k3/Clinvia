import React, { useRef, useCallback, memo } from "react";
import { Send, Paperclip, Smile, Mic, Sparkles, Plus, MoreVertical, MessageSquare, StopCircle, CheckCircle, X, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { cn } from "@/lib/utils";
import { QuickMessagesMenu } from "@/components/QuickMessagesMenu";

interface ChatInputProps {
    message: string;
    onMessageChange: (value: string) => void;
    onSend: () => void;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAiAction: (mode: 'generate' | 'fix' | 'improve') => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    isRecording: boolean;
    recordingTime: number;
    isUploading: boolean;
    isMobile: boolean;
    isResolved: boolean;
    selectedFile: File | null;
    onRemoveFile: () => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onSendSurvey?: () => void;
}

/**
 * Isolated ChatInput component with React.memo to prevent unnecessary re-renders.
 * This component ONLY re-renders when its specific props change.
 */
const ChatInput = memo(function ChatInput({
    message,
    onMessageChange,
    onSend,
    onFileSelect,
    onAiAction,
    onStartRecording,
    onStopRecording,
    isRecording,
    recordingTime,
    isUploading,
    isMobile,
    isResolved,
    selectedFile,
    onRemoveFile,
    onPaste,
    onSendSurvey,
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmojiOpen, setIsEmojiOpen] = React.useState(false);

    const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
        onMessageChange(message + emojiData.emoji);
        setIsEmojiOpen(false);
    }, [message, onMessageChange]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onMessageChange(e.target.value);
        // Resize directly in handler
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
    }, [onMessageChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    }, [onSend]);

    if (isResolved) {
        return (
            <div className="p-4 border-t border-border">
                <div className="flex items-center justify-center p-4 bg-muted/50 rounded-lg border border-dashed">
                    <p className="text-muted-foreground flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Este ticket foi resolvido. O chat está fechado para novas mensagens.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 border-t border-border">
            {/* File Preview */}
            {selectedFile && (
                <div className="mb-2 p-2 bg-muted rounded-md flex items-center gap-3">
                    {selectedFile.type.startsWith('image/') ? (
                        <img
                            src={URL.createObjectURL(selectedFile)}
                            alt="Preview"
                            className="max-h-32 max-w-48 rounded object-contain"
                        />
                    ) : selectedFile.type.startsWith('audio/') ? (
                        <div className="flex items-center gap-2 flex-1">
                            <Mic className="w-5 h-5 text-primary" />
                            <audio controls className="flex-1 h-8">
                                <source src={URL.createObjectURL(selectedFile)} type={selectedFile.type} />
                            </audio>
                        </div>
                    ) : (
                        <span className="text-sm text-foreground truncate max-w-[200px]">{selectedFile.name}</span>
                    )}
                    <Button variant="ghost" size="sm" onClick={onRemoveFile} className="ml-auto">
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}

            <div className="flex gap-2 items-center">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={onFileSelect}
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
                            <DropdownMenuItem onClick={isRecording ? onStopRecording : onStartRecording}>
                                <Mic className={cn("w-4 h-4 mr-2", isRecording && "text-red-500")} />
                                {isRecording ? "Parar gravação" : "Gravar áudio"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onAiAction('generate')}>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Usar IA
                            </DropdownMenuItem>
                            <DropdownMenuItem>
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

                {/* Emoji Picker Popover for Mobile */}
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
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onPaste={onPaste}
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
                                    onClick={onStopRecording}
                                    className="text-red-500 hover:text-red-600 hover:bg-red-100"
                                >
                                    <StopCircle className="w-5 h-5" />
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={onStartRecording}
                                title="Gravar áudio"
                            >
                                <Mic className="w-5 h-5" />
                            </Button>
                        )}

                        {!message.trim() ? (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => onAiAction('generate')}
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
                                    <DropdownMenuItem onClick={() => onAiAction('fix')}>
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Correção ortográfica
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onAiAction('improve')}>
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Melhorar a frase
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        {/* NPS Survey Button */}
                        {onSendSurvey && (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={onSendSurvey}
                                className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 hover:opacity-90 transition-all duration-300"
                                title="Enviar pesquisa de satisfação"
                            >
                                <ClipboardList className="w-5 h-5" />
                            </Button>
                        )}
                    </>
                )}

                {/* Send Button */}
                <Button
                    onClick={onSend}
                    disabled={isUploading || (!message.trim() && !selectedFile)}
                    size="icon"
                    className="bg-primary hover:bg-primary/90"
                >
                    <Send className="w-5 h-5" />
                </Button>
            </div>
        </div>
    );
});

export { ChatInput };
export type { ChatInputProps };
