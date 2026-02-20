import { useRef, useEffect, useState, useMemo, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, Check, CheckCheck, Download, ChevronDown, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageActionsMenu } from "@/components/MessageActionsMenu";
import { ReplyQuoteBox, QuotedMessage } from "@/components/ReplyQuoteBox";
import { LazyMedia } from "@/components/LazyMedia";
import { toast } from "sonner";
import { useGroupMembers } from "@/hooks/useGroupMembers";
import { ContactCard } from "@/components/chat/ContactCard";
import { CustomAudioPlayer } from "@/components/chat/CustomAudioPlayer";

interface MessageListProps {
    messages: any[];
    isLoading: boolean;
    searchTerm: string;
    currentMatchIndex: number;
    matchRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
    onReply: (msg: any) => void;
    onEdit: (msg: any) => void;
    onDelete: (msg: any) => void;
    onReact: (msg: any) => void;
    onCopy: (msg: any) => void;
    onToggleFavorite: (msg: any) => void;
    onForward: (msg: any) => void;
    onOpenNewMessage?: (phone?: string) => void;
    isMobile?: boolean;
    visibleMessagesCount: number;
    setVisibleMessagesCount: React.Dispatch<React.SetStateAction<number>>;
    MESSAGES_PER_PAGE: number;
    displayName: string;
    profilePic: string | null;
    isGroup: boolean;
    conversation: any;
}

export const MessageList = ({
    messages,
    isLoading,
    searchTerm,
    currentMatchIndex,
    matchRefs,
    onReply,
    onEdit,
    onDelete,
    onReact,
    onCopy,
    onToggleFavorite,
    onForward,
    onOpenNewMessage,
    isMobile = false,
    visibleMessagesCount,
    setVisibleMessagesCount,
    MESSAGES_PER_PAGE,
    displayName,
    profilePic,
    isGroup,
    conversation
}: MessageListProps) => {

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [prevScrollHeight, setPrevScrollHeight] = useState(0);

    // Filter messages for display (infinite scroll vs search), excluding reaction messages from the bubble list
    const messagesToDisplay = useMemo(() => {
        const visible = searchTerm
            ? messages
            : messages.slice(-Math.min(messages.length, visibleMessagesCount));
        return visible.filter(m => m.message_type !== 'reaction');
    }, [messages, visibleMessagesCount, searchTerm]);

    // Build a map from evolution_id -> emoji list for reaction messages
    const reactionMap = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const msg of messages) {
            if (msg.message_type === 'reaction' && (msg as any).reply_to_id && msg.body) {
                const targetId = (msg as any).reply_to_id as string;
                const existing = map.get(targetId) ?? [];
                if (!existing.includes(msg.body)) existing.push(msg.body);
                map.set(targetId, existing);
            }
        }
        return map;
    }, [messages]);

    // Track if user is at bottom to maintain "stick to bottom" behavior
    const isAtBottomRef = useRef(true);
    // Track last message ID to prevent unnecessary scrolls
    const lastMessageIdRef = useRef<string | null>(null);

    // Handle Infinite Scroll (Load previous messages)
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || searchTerm) return;

        const handleScroll = () => {
            // Show scroll button if not at bottom
            const { scrollTop, scrollHeight, clientHeight } = container;
            const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;

            setShowScrollButton(!isAtBottom);
            isAtBottomRef.current = isAtBottom;

            // Infinite Load Trigger (at top)
            if (scrollTop === 0 && visibleMessagesCount < messages.length) {
                // Save current scroll height to prevent jumping
                setPrevScrollHeight(container.scrollHeight);
                // Load more messages
                setVisibleMessagesCount(prev => Math.min(prev + MESSAGES_PER_PAGE, messages.length));
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [messages.length, visibleMessagesCount, searchTerm, MESSAGES_PER_PAGE, setVisibleMessagesCount]);


    // Restore scroll position after loading previous messages
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (container && prevScrollHeight > 0) {
            const newScrollHeight = container.scrollHeight;
            const scrollDiff = newScrollHeight - prevScrollHeight;

            // Adjust scroll position to keep the user's view stable
            if (scrollDiff > 0) {
                container.scrollTop = scrollDiff;
            }
            setPrevScrollHeight(0);
        }
    }, [messagesToDisplay.length, prevScrollHeight]);


    // Helper: Scroll to Bottom
    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    // Auto-scroll logic (New messages & Conversation Change)
    useEffect(() => {
        if (!messagesToDisplay.length) return;

        const lastMessage = messagesToDisplay[messagesToDisplay.length - 1];
        const isNewMessage = lastMessage?.id !== lastMessageIdRef.current;
        const isOwnMessage = lastMessage?.direction === 'outbound';

        // Only scroll if it's a new message at the bottom
        if (isNewMessage) {
            // Update ref
            lastMessageIdRef.current = lastMessage?.id || null;

            // Always scroll to bottom on new outbound messages
            if (isOwnMessage) {
                setTimeout(() => scrollToBottom(), 100); // Small timeout to ensure render
                return;
            }

            // For incoming messages, only scroll if user was already at bottom
            if (isAtBottomRef.current) {
                setTimeout(() => scrollToBottom(), 100);
            }
        }

    }, [messagesToDisplay[messagesToDisplay.length - 1]?.id]); // Trigger on last message ID change


    // Explicit Scroll on Conversation Change
    useEffect(() => {
        // Force scroll to bottom when conversation ID changes
        if (messagesToDisplay.length > 0) {
            // Use 'auto' behavior for instant jump on load
            scrollToBottom('auto');
        }
    }, [conversation?.id]);


    // Search Logic: Scroll to match
    const searchMatches = useMemo(() => searchTerm
        ? messages.filter(msg => msg.body?.toLowerCase().includes(searchTerm.toLowerCase()))
        : [], [messages, searchTerm]);

    useEffect(() => {
        if (searchTerm && searchMatches.length > 0 && currentMatchIndex >= 0) {
            const match = searchMatches[currentMatchIndex];
            if (match) {
                const element = document.getElementById(`message-${match.id}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }, [currentMatchIndex, searchTerm, searchMatches]);


    // Render helpers
    const { data: groupMembers } = useGroupMembers(conversation?.id, true);

    const HighlightText = ({ text, highlight }: { text: string, highlight: string }) => {
        // Regex to match URLs OR Mentions (@number)
        // Matches:
        // 1. URLs (http/https)
        // 2. Mentions (@number)
        const tokenRegex = /(https?:\/\/[^\s]+)|(@\d+)/gi;

        // Split and filter undefined captures (because of capture groups in split)
        const parts = text.split(tokenRegex).filter(part => part !== undefined && part !== "");

        return (
            <span>
                {parts.map((part, i) => {
                    // URL Handling
                    if (/^https?:\/\//i.test(part)) {
                        return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline break-all" onClick={(e) => e.stopPropagation()}>{part}</a>;
                    }

                    // Mention Handling
                    // Mention Handling
                    // Matches @digits (e.g. @55119999999) or @lid (e.g. @12345678)
                    if (/^@\d+(@[a-zA-Z.]+)?$/.test(part)) {
                        const rawId = part.substring(1).split('@')[0]; // Extract just digits/id

                        const member = groupMembers?.find(m => {
                            // 1. Try match by LID
                            if (m.lid && m.lid === rawId) return true;
                            // 2. Try match by Clean Number (fallback for old mentions)
                            const mClean = m.cleanNumber || m.number?.split('@')[0];
                            return mClean === rawId;
                        });

                        if (member) {
                            return (
                                <span
                                    key={i}
                                    className="text-blue-500 font-medium cursor-pointer hover:underline"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Open chat/profile with this person
                                        if (onOpenNewMessage) onOpenNewMessage(member.cleanNumber || member.number);
                                    }}
                                >
                                    @{member.push_name || member.cleanNumber || member.number}
                                </span>
                            );
                        }
                    }

                    // Search Highlight Handling
                    if (!highlight.trim()) return <span key={i}>{part}</span>;
                    const highlightParts = part.split(new RegExp(`(${highlight})`, 'gi'));
                    return (
                        <span key={i}>
                            {highlightParts.map((hPart, j) => hPart.toLowerCase() === highlight.toLowerCase() ? <span key={j} className="bg-yellow-200 text-black font-medium px-0.5 rounded">{hPart}</span> : hPart)}
                        </span>
                    );
                })}
            </span>
        );
    };

    const cleanMessageBody = (body: string) => body ? body.replace(/^\*[^*]+:\*\n/, "") : "";

    const handleDownloadFile = async (url: string, filename: string) => {
        try {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Download error:', error);
            toast.error('Erro ao baixar arquivo');
        }
    };

    const renderMessage = (msg: any) => {
        const isMatch = searchTerm && msg.body?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchIndex = isMatch ? searchMatches.findIndex(m => m.id === msg.id) : -1;
        const isGroupMsg = !!conversation?.group_id;
        let senderName = msg.sender_name;

        if (!senderName) {
            if (isGroupMsg) {
                senderName = msg.sender_jid ? `+${msg.sender_jid.split('@')[0]}` : "Membro";
            } else {
                senderName = displayName;
            }
        }
        const senderPic = msg.sender_profile_pic_url || (isGroupMsg ? undefined : profilePic);

        const evolutionId = (msg as any).evolution_id as string | undefined;
        const reactionEmojis = evolutionId ? (reactionMap.get(evolutionId) ?? []) : [];

        // Identificar se é uma mensagem de sistema de transferência ("Conversa 123 transferida de X para Y")
        const isSystemTransfer = msg.body && (msg.body.includes('transferida de') || msg.body.includes('transferiu para'));
        if (isSystemTransfer) {
            // Remove o texto "Conversa X " do início, mantendo apenas a ação
            const cleanTransferText = msg.body.replace(/^Conversa \d+\s+/i, '');
            const timeStr = new Date(msg.created_at || "").toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

            return (
                <div key={msg.id} id={`message-${msg.id}`} className={cn("flex justify-center my-6 px-4", isMatch && matchIndex === currentMatchIndex ? "bg-yellow-100/10 rounded-lg p-1 -m-1" : "")}>
                    <div className="bg-[#1e253c] dark:bg-[#1a2235] text-[#93c5fd] text-xs font-medium px-4 py-2 rounded-full flex items-center gap-2.5 shadow-sm border border-[#2a3655]/50 select-none">
                        <ArrowLeftRight className="w-3.5 h-3.5 opacity-80" />
                        <span>{timeStr} {cleanTransferText}</span>
                    </div>
                </div>
            );
        }

        return (
            <div
                key={msg.id}
                id={`message-${msg.id}`}
                className={cn("flex gap-2 transition-colors duration-300 items-end mb-4 px-4", msg.direction === "outbound" ? "justify-end" : "justify-start", isMatch && matchIndex === currentMatchIndex ? "bg-yellow-100/10 rounded-lg p-1 -m-1" : "")}
            >
                {msg.direction === "inbound" && (
                    <Avatar className={cn("w-8 h-8", isGroupMsg && "cursor-pointer hover:opacity-80")} onClick={() => { if (isGroupMsg && msg.sender_jid) onOpenNewMessage?.(msg.sender_jid.split('@')[0]); }}>
                        <AvatarImage src={senderPic || undefined} />
                        <AvatarFallback>{senderName?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                )}

                <div className={cn("group relative flex items-end gap-1 min-w-0", isMobile ? "max-w-[calc(100%-3rem)]" : "max-w-[70%]")}>
                    {msg.direction === "outbound" && (
                        <MessageActionsMenu message={msg as any} onReply={() => onReply(msg)} onEdit={() => onEdit(msg)} onDelete={() => onDelete(msg)} onReact={() => onReact(msg)} onCopy={() => onCopy(msg)} onToggleFavorite={() => onToggleFavorite(msg)} onForward={() => onForward(msg)} className="self-center shrink-0" />
                    )}

                    {/* Wrapper gives space for the badge below the bubble */}
                    <div className={cn("relative", reactionEmojis.length > 0 && "mb-3")}>
                        <div className={cn(
                            "flex flex-col items-end gap-0",
                            msg.message_type === 'sticker' ? "" : "rounded-lg p-3 overflow-hidden min-w-0 break-words shadow-sm",
                            msg.message_type !== 'sticker' && (msg.direction === "outbound" ? "bg-[#DCF7C5] text-gray-800 dark:bg-[#044740] dark:text-white" : "bg-white dark:bg-[hsl(var(--chat-customer))] text-gray-800 dark:text-foreground")
                        )}>
                            {isGroup && msg.direction === 'inbound' && <p className="text-xs font-bold mb-1 text-primary-foreground/80">{senderName}</p>}
                            {(msg as any).quoted_body && <QuotedMessage quotedBody={(msg as any).quoted_body} quotedSender={(msg as any).quoted_sender} isOutbound={msg.direction === "outbound"} />}

                            {msg.message_type === 'image' && msg.media_url && <LazyMedia type="image" src={msg.media_url} alt="Imagem" />}
                            {msg.message_type === 'audio' && msg.media_url && (
                                <div className="flex flex-col gap-1 w-full min-w-[240px] max-w-[340px] sm:max-w-[400px] my-1">
                                    <CustomAudioPlayer
                                        audioUrl={msg.media_url}
                                        transcription={(msg as any).transcription}
                                        isOutbound={msg.direction === "outbound"}
                                        senderName={isGroup && msg.direction === 'inbound' ? senderName : undefined}
                                    />
                                </div>
                            )}
                            {msg.message_type === 'video' && msg.media_url && <LazyMedia type="video" src={msg.media_url} />}
                            {/* Sticker Rendering - no background */}
                            {msg.message_type === 'sticker' && msg.media_url && (
                                <img
                                    src={msg.media_url}
                                    alt="Figurinha"
                                    className="w-36 h-36 object-contain select-none"
                                    loading="lazy"
                                />
                            )}
                            {/* ✅ IMPROVED: Renderizar documento com design melhorado */}
                            {msg.message_type === 'document' && msg.media_url && (() => {
                                // Use media_filename if available, otherwise fallback to body
                                const filename = (msg as any).media_filename || msg.body || 'documento';
                                const fileMimetype = (msg as any).media_mimetype;

                                // Extract extension from filename or map from mimetype
                                let fileExt = filename.split('.').pop()?.toLowerCase() || '';

                                // If no extension but have mimetype, map to extension
                                if (!fileExt && fileMimetype) {
                                    const mimeToExt: Record<string, string> = {
                                        'application/pdf': 'pdf',
                                        'application/msword': 'doc',
                                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                                        'application/vnd.ms-excel': 'xls',
                                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                                        'application/vnd.ms-powerpoint': 'ppt',
                                        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
                                        'text/plain': 'txt',
                                        'text/markdown': 'md',
                                        'text/csv': 'csv',
                                        'application/zip': 'zip',
                                        'application/x-rar-compressed': 'rar',
                                        'application/x-7z-compressed': '7z'
                                    };
                                    fileExt = mimeToExt[fileMimetype] || '';
                                }

                                const caption = (msg as any).caption; // Mensagem do usuário

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

                                const config = FILE_CONFIG[fileExt] || {
                                    iconUrl: '/assets/file-icons/default.png',
                                    color: '',
                                    bgColor: 'bg-white dark:bg-gray-800',
                                    label: 'Arquivo'
                                };

                                const FileIcon = config.icon;

                                return (
                                    <div className="flex flex-col gap-2 max-w-xs mb-2">
                                        {/* Ícone do arquivo */}
                                        <div className={cn(
                                            "flex items-center justify-center p-6 rounded-t-lg",
                                            config.bgColor
                                        )}>
                                            {config.iconUrl ? (
                                                <img src={config.iconUrl} alt={config.label} className="w-16 h-16 object-contain" />
                                            ) : FileIcon ? (
                                                <FileIcon className={cn("w-12 h-12", config.color)} />
                                            ) : null}
                                        </div>

                                        {/* Nome truncado */}
                                        <p className="text-sm font-medium truncate px-2">
                                            {filename}
                                        </p>

                                        {/* Botão de download */}
                                        <button
                                            onClick={() => handleDownloadFile(msg.media_url!, filename)}
                                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg transition-colors font-medium"
                                        >
                                            <Download className="w-4 h-4 shrink-0" />
                                            <span className="truncate text-sm">{filename}</span>
                                        </button>

                                        {/* Nome completo do arquivo (abaixo do botão) */}
                                        <p className="text-xs text-gray-600 dark:text-gray-400 px-2 break-all leading-relaxed">
                                            {filename}
                                        </p>

                                        {/* Mensagem/caption do usuário (se houver) */}
                                        {caption && (
                                            <p className="text-sm text-gray-800 dark:text-gray-200 px-2 mt-1 break-words whitespace-pre-wrap">
                                                <HighlightText text={caption} highlight={searchTerm} />
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}


                            {msg.body && msg.message_type !== 'document' && msg.message_type !== 'audio' && msg.message_type !== 'sticker' && msg.message_type !== 'image' && msg.message_type !== 'video' && (() => {
                                const body = msg.body || '';

                                // Detect vCard contact format
                                if (/^Phone[^\n]*:/im.test(body)) {
                                    return <ContactCard body={body} />;
                                }

                                const knownExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'zip', 'rar', '7z', 'png', 'jpg', 'jpeg', 'gif', 'mp3', 'mp4', 'webm'];
                                const ext = body.split('.').pop()?.toLowerCase() || '';
                                const looksLikeFile = knownExts.includes(ext) && body.includes('.');

                                if (looksLikeFile) {
                                    const FILE_CONFIG: Record<string, { iconUrl: string; label: string }> = {
                                        pdf: { iconUrl: '/assets/file-icons/pdf.png', label: 'PDF' },
                                        doc: { iconUrl: '/assets/file-icons/doc.png', label: 'Word' },
                                        docx: { iconUrl: '/assets/file-icons/doc.png', label: 'Word' },
                                        xls: { iconUrl: '/assets/file-icons/xls.png', label: 'Excel' },
                                        xlsx: { iconUrl: '/assets/file-icons/xls.png', label: 'Excel' },
                                        ppt: { iconUrl: '/assets/file-icons/ppt.png', label: 'PowerPoint' },
                                        pptx: { iconUrl: '/assets/file-icons/ppt.png', label: 'PowerPoint' },
                                        zip: { iconUrl: '/assets/file-icons/zip.png', label: 'ZIP' },
                                        txt: { iconUrl: '/assets/file-icons/txt.png', label: 'Texto' },
                                        jpg: { iconUrl: '/assets/file-icons/jpg.png', label: 'Image' },
                                        jpeg: { iconUrl: '/assets/file-icons/jpg.png', label: 'Image' },
                                        png: { iconUrl: '/assets/file-icons/png.png', label: 'Image' },
                                    };
                                    const cfg = FILE_CONFIG[ext] || { iconUrl: '/assets/file-icons/default.png', label: 'Arquivo' };
                                    return (
                                        <div className="flex items-center gap-2 py-1">
                                            <img src={cfg.iconUrl} alt={cfg.label} className="w-8 h-8 object-contain shrink-0" />
                                            <span className="text-sm font-medium truncate">{body}</span>
                                        </div>
                                    );
                                }

                                return (
                                    <p className="text-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
                                        <HighlightText text={cleanMessageBody(body)} highlight={searchTerm} />
                                    </p>
                                );
                            })()}

                            <span className={cn("text-xs mt-1 flex items-center gap-1", msg.direction === "outbound" ? "text-gray-800/70 dark:text-white/70" : "text-muted-foreground", "justify-end")}>
                                {new Date(msg.created_at || "").toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                {msg.direction === "outbound" && ((msg as any).status === 'read' ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Check className="w-4 h-4 text-gray-400" />)}
                            </span>
                        </div>

                        {/* Reaction badge — outside overflow-hidden, anchored to bottom of bubble */}
                        {reactionEmojis.length > 0 && (
                            <div className={cn(
                                "absolute -bottom-5 flex items-center gap-0.5 px-2 py-0.5 rounded-full text-base shadow-md border border-border/40 bg-white dark:bg-[hsl(var(--card))] z-20",
                                msg.direction === "outbound" ? "left-2" : "right-2"
                            )}>
                                {reactionEmojis.map((emoji, i) => (
                                    <span key={i} className="leading-none">{emoji}</span>
                                ))}
                            </div>
                        )}
                    </div>{/* end relative wrapper */}

                    {msg.direction === "inbound" && (
                        <MessageActionsMenu
                            message={msg as any}
                            onReply={() => onReply(msg)}
                            onReact={() => onReact(msg)}
                            onEdit={() => onEdit(msg)}
                            onDelete={() => onDelete(msg)}
                            onCopy={() => onCopy(msg)}
                            onToggleFavorite={() => onToggleFavorite(msg)}
                            onForward={() => onForward(msg)}
                            className="self-center shrink-0"
                        />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={cn("flex-1 w-full h-full relative min-h-0", isMobile ? "px-0 py-0" : "p-0")}>
            {isLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">Carregando mensagens...</div>
            ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">Nenhuma mensagem ainda.</div>
            ) : (
                <div
                    ref={scrollContainerRef}
                    className={cn("h-full overflow-y-auto px-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700")}
                >
                    {/* Top Sentinel for Infinite Scroll (if needed more space) */}
                    {!searchTerm && visibleMessagesCount < messages.length && (
                        <div className="h-8 flex items-center justify-center w-full">
                            <span className="loading loading-spinner loading-xs text-muted-foreground opacity-50"></span>
                        </div>
                    )}

                    {messagesToDisplay.map((msg, index) => renderMessage(msg))}

                    {/* Bottom Anchor */}
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            )}

            {showScrollButton && (
                <Button
                    size="icon"
                    variant="secondary"
                    className="absolute bottom-20 right-8 rounded-full shadow-lg z-10 opacity-90 hover:opacity-100 transition-opacity"
                    onClick={() => scrollToBottom('smooth')}
                >
                    <ChevronDown className="w-5 h-5" />
                </Button>
            )}
        </div>
    );
};
