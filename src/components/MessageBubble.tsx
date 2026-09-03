import React from "react";
import { Download, Clock, AlertCircle, Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { LazyMedia } from "@/components/LazyMedia";
import { CustomAudioPlayer } from "@/components/chat/CustomAudioPlayer";
import { FormattedText, parseTemplateBody, stripSenderSignature } from "@/components/chat/FormattedText";
import { resolveOutboundSenderName } from "@/lib/messageSender";
import { downloadFile, getFileConfig } from "@/lib/fileTypes";
import { chatDateTime } from "@/lib/chatDates";

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

    // Formatação compartilhada com o Inbox — regras novas vão em FormattedText
    const HighlightText = ({ text, highlight }: { text: string, highlight: string }) => (
        <FormattedText text={text} highlight={highlight} />
    );

    // Mesma regra do inbox (MessageList): o prefixo de assinatura "*Nome:*\n"
    // sai do corpo e o remetente vira label acima da bolha
    const cleanMessageBody = (body: string) => stripSenderSignature(body, msg.sender_name);

    // Remetente de mensagens outbound: SEMPRE exibido (user rule) — lógica
    // compartilhada em lib/messageSender (fallback "IA" só quando é seguro)
    const outboundSenderName = resolveOutboundSenderName(msg);

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
            {/* Sender Name for Group Chats — cor visível nos 2 temas (era
                primary-foreground: branco sobre balão branco no tema claro);
                fallback p/ número quando a msg não guardou o nome */}
            {isGroup && msg.direction === 'inbound' && (
                <p className="text-xs font-bold mb-1 text-teal-700 dark:text-teal-300">
                    {msg.sender_name || ((msg as any).sender_jid ? `+${(msg as any).sender_jid.split('@')[0]}` : "Membro")}
                </p>
            )}

            {/* Remetente (outbound) — sempre visível, mesmo sem assinatura no WhatsApp */}
            {outboundSenderName && (
                <p className="text-xs font-bold mb-1 text-emerald-700 dark:text-emerald-300">
                    {outboundSenderName}
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
                const config = getFileConfig(filename, fileMimetype);

                return (
                    <div className="flex flex-col gap-2 max-w-xs mb-2">
                        <div className="flex items-center justify-center p-6 rounded-t-lg bg-white dark:bg-gray-800">
                            <img src={config.iconUrl} alt={config.label} className="w-16 h-16 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                        </div>
                        <p className="text-sm font-medium truncate px-2">{filename}</p>
                        <button
                            onClick={() => downloadFile(msg.media_url!, filename, fileMimetype)}
                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm"
                        >
                            <Download className="w-4 h-4" />
                            <span className="truncate">{filename}</span>
                        </button>
                    </div>
                );
            })()}

            {/* TEXTO (Se não for apenas um container de arquivo) */}
            {msg.body && msg.message_type !== 'document' && msg.message_type !== 'audio' && msg.body !== '[Áudio]' && (() => {
                const body = cleanMessageBody(msg.body);
                // Template messages: "*Template enviado: name*\nbody"
                const tplMatch = parseTemplateBody(body);
                if (tplMatch) {
                    return (
                        <div className="text-sm break-words">
                            <p className="font-bold">Template enviado: {tplMatch[1]}</p>
                            <p className="whitespace-pre-wrap"><HighlightText text={tplMatch[2]} highlight={searchTerm} /></p>
                        </div>
                    );
                }
                return (
                    <p className="text-sm break-words whitespace-pre-wrap">
                        <HighlightText text={body} highlight={searchTerm} />
                    </p>
                );
            })()}

            {/* METADATA (Hora e Status) */}
            <div className={cn(
                "flex items-center justify-end gap-1 mt-1",
                msg.direction === "outbound" ? "text-gray-800/70 dark:text-white/70" : "text-muted-foreground"
            )}>
                <span className="text-[10px]">
                    {chatDateTime(msg.created_at)}
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
