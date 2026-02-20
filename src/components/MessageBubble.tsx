import React from "react";
import { format } from "date-fns";
import { Download, Clock, AlertCircle, Check, CheckCheck, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { LazyMedia } from "@/components/LazyMedia";
import { CustomAudioPlayer } from "@/components/chat/CustomAudioPlayer";
import { toast } from "sonner";

interface MessageBubbleProps {
    message: any;
    isGroup?: boolean;
    searchTerm?: string;
    onOpenNewMessage?: (phone: string) => void;
    currentMatchIndex?: number;
    matchIndex?: number;
}

export function MessageBubble({
    message: msg,
    isGroup = false,
    searchTerm = "",
    onOpenNewMessage,
    currentMatchIndex = -1,
    matchIndex = -1,
}: MessageBubbleProps) {
    const isMatch = searchTerm && msg.body?.toLowerCase().includes(searchTerm.toLowerCase());

    // Configuração de ícones por tipo de arquivo
    const FILE_CONFIG: Record<string, { icon?: any; iconUrl?: string; color: string; bgColor: string; label: string }> = {
        pdf: { iconUrl: '/assets/file-icons/pdf.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'PDF' },
        doc: { iconUrl: '/assets/file-icons/doc.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'Word' },
        docx: { iconUrl: '/assets/file-icons/doc.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'Word' },
        xls: { iconUrl: '/assets/file-icons/xls.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'Excel' },
        xlsx: { iconUrl: '/assets/file-icons/xls.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'Excel' },
        ppt: { iconUrl: '/assets/file-icons/ppt.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'PowerPoint' },
        pptx: { iconUrl: '/assets/file-icons/ppt.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'PowerPoint' },
        zip: { iconUrl: '/assets/file-icons/zip.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'ZIP' },
        txt: { iconUrl: '/assets/file-icons/txt.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'Texto' },
        jpg: { iconUrl: '/assets/file-icons/jpg.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'JPG' },
        jpeg: { iconUrl: '/assets/file-icons/jpg.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'JPEG' },
        png: { iconUrl: '/assets/file-icons/png.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'PNG' },
        gif: { iconUrl: '/assets/file-icons/gif.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'GIF' },
        mp3: { iconUrl: '/assets/file-icons/mp3.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'MP3' },
        mpg: { iconUrl: '/assets/file-icons/mpg.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'MPG' },
        mpeg: { iconUrl: '/assets/file-icons/mpg.png', color: '', bgColor: 'bg-white dark:bg-gray-800', label: 'MPEG' }
    };

    const handleDownloadFile = async (url: string, filename: string) => {
        try {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(async () => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Fetch failed');
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const blobLink = document.createElement('a');
                    blobLink.href = blobUrl;
                    blobLink.download = filename;
                    document.body.appendChild(blobLink);
                    blobLink.click();
                    document.body.removeChild(blobLink);
                    URL.revokeObjectURL(blobUrl);
                } catch (fetchError) {
                    console.error('Fallback download failed:', fetchError);
                }
            }, 1000);
        } catch (error) {
            console.error('Download error:', error);
            toast.error('Erro ao baixar arquivo');
        }
    };

    const HighlightText = ({ text, highlight }: { text: string, highlight: string }) => {
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const parts = text.split(urlRegex);

        return (
            <span>
                {parts.map((part, i) => {
                    if (urlRegex.test(part)) {
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

    const cleanMessageBody = (body: string) => {
        if (!body) return "";
        return body.replace(/^\*[^*]+:\*\n/, "");
    };

    return (
        <div
            className={cn(
                "rounded-lg p-3 overflow-hidden min-w-0 break-words relative",
                msg.direction === "outbound"
                    ? "bg-[#DCF7C5] text-gray-800 dark:bg-[#044740] dark:text-white"
                    : "bg-white dark:bg-[hsl(var(--chat-customer))] text-gray-800 dark:text-foreground",
                isMatch && matchIndex === currentMatchIndex ? "bg-yellow-100/10 ring-2 ring-yellow-400" : ""
            )}
            style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
            {/* Sender Name for Group Chats */}
            {isGroup && msg.direction === 'inbound' && msg.sender_name && (
                <p className="text-xs font-bold mb-1 text-primary-foreground/80">
                    {msg.sender_name}
                </p>
            )}

            {/* Quoted Message (Simplificado) */}
            {(msg as any).quoted_body && (
                <div className="border-l-4 border-gray-400 pl-2 mb-2 bg-black/5 dark:bg-white/5 rounded-r p-1 text-xs">
                    <p className="font-semibold">{(msg as any).quoted_sender || "Usuário"}</p>
                    <p className="line-clamp-2">{(msg as any).quoted_body}</p>
                </div>
            )}

            {/* IMAGEM */}
            {msg.message_type === 'image' && msg.media_url && (
                <LazyMedia type="image" src={msg.media_url} alt="Imagem" />
            )}

            {/* AUDIO */}
            {msg.message_type === 'audio' && msg.media_url && (
                <div className="flex flex-col gap-1 w-full min-w-[240px] max-w-[340px] sm:max-w-[400px] my-1">
                    <CustomAudioPlayer
                        audioUrl={msg.media_url}
                        transcription={(msg as any).transcription}
                        isOutbound={msg.direction === "outbound"}
                        senderName={isGroup && msg.direction === 'inbound' ? msg.sender_name : undefined}
                    />
                </div>
            )}

            {/* VIDEO */}
            {msg.message_type === 'video' && msg.media_url && (
                <LazyMedia type="video" src={msg.media_url} />
            )}

            {/* DOCUMENTO */}
            {msg.message_type === 'document' && msg.media_url && (() => {
                const filename = (msg as any).media_filename || msg.body || 'documento';
                const fileMimetype = (msg as any).media_mimetype;
                let fileExt = filename.split('.').pop()?.toLowerCase() || '';

                // Mimetype map fallback
                if (!fileExt && fileMimetype) {
                    const mimeToExt: Record<string, string> = {
                        'application/pdf': 'pdf',
                        'application/msword': 'doc',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                        'text/plain': 'txt',
                        'image/jpeg': 'jpg',
                        'image/png': 'png'
                    };
                    fileExt = mimeToExt[fileMimetype] || '';
                }

                const config = FILE_CONFIG[fileExt] || {
                    iconUrl: '/assets/file-icons/default.png',
                    color: '',
                    bgColor: 'bg-white dark:bg-gray-800',
                    label: 'Arquivo'
                };

                const FileIcon = config.icon || FileText; // Fallback icon

                return (
                    <div className="flex flex-col gap-2 max-w-xs mb-2">
                        <div className={cn("flex items-center justify-center p-6 rounded-t-lg", config.bgColor || 'bg-gray-100')}>
                            {config.iconUrl ? (
                                <img src={config.iconUrl} alt={config.label} className="w-16 h-16 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                            ) : (
                                <FileIcon className={cn("w-12 h-12", config.color)} />
                            )}
                        </div>
                        <p className="text-sm font-medium truncate px-2">{filename}</p>
                        <button
                            onClick={() => handleDownloadFile(msg.media_url!, filename)}
                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm"
                        >
                            <Download className="w-4 h-4" />
                            <span className="truncate">{filename}</span>
                        </button>
                    </div>
                );
            })()}

            {/* TEXTO (Se não for apenas um container de arquivo) */}
            {msg.body && msg.message_type !== 'document' && msg.message_type !== 'audio' && msg.body !== '[Áudio]' && (
                <p className="text-sm break-words whitespace-pre-wrap">
                    <HighlightText text={cleanMessageBody(msg.body)} highlight={searchTerm} />
                </p>
            )}

            {/* METADATA (Hora e Status) */}
            <div className={cn(
                "flex items-center justify-end gap-1 mt-1",
                msg.direction === "outbound" ? "text-gray-800/70 dark:text-white/70" : "text-muted-foreground"
            )}>
                <span className="text-[10px]">
                    {format(new Date(msg.created_at), "HH:mm")}
                </span>

                {(msg as any).status === 'sending' && <Clock className="w-3 h-3 animate-pulse" />}
                {(msg as any).status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                {(msg as any).status === 'read' && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
                {(msg as any).status === 'delivered' && <CheckCheck className="w-3.5 h-3.5 text-gray-400" />}
                {(msg as any).status === 'sent' && <Check className="w-3.5 h-3.5 text-gray-400" />}
                {msg.direction === 'outbound' && !(msg as any).status && <Check className="w-3.5 h-3.5 text-gray-400" />}
            </div>
        </div>
    );
}
