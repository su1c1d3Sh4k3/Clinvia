import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageCircle, MoreVertical, Briefcase, Calendar, CheckSquare } from 'lucide-react';
import { FaWhatsapp, FaInstagram } from 'react-icons/fa';
import { useConversationTimer } from '@/hooks/useConversationTimer';
import { useHasAppointment, useHasDeal, useHasTask } from '@/hooks/useQueueConversations';
import type { QueueConversation } from '@/hooks/useQueueConversations';
import { cn } from '@/lib/utils';

interface ConversationQueueCardProps {
    conversation: QueueConversation;
    onOpenChat: () => void;
    onTransfer: () => void;
    onTag: () => void;
    onResolve: () => void;
    onViewDeal?: () => void;
    onViewAppointment?: () => void;
    onViewTask?: () => void;
}

export function ConversationQueueCard({
    conversation,
    onOpenChat,
    onTransfer,
    onTag,
    onResolve,
    onViewDeal,
    onViewAppointment,
    onViewTask,
}: ConversationQueueCardProps) {
    const { minutes, color, label } = useConversationTimer(
        conversation.last_message?.created_at || conversation.last_message_at,
        conversation.last_message?.direction || 'inbound'
    );

    const { data: hasAppointment } = useHasAppointment(conversation.contact_id);
    const { data: hasDeal } = useHasDeal(conversation.contact_id);
    const { data: hasTask } = useHasTask(conversation.contact_id);

    // Color mapping for timer
    const colorClasses = {
        green: 'text-green-600 dark:text-green-400',
        blue: 'text-blue-600 dark:text-blue-400',
        yellow: 'text-yellow-600 dark:text-yellow-500',
        orange: 'text-orange-600 dark:text-orange-400',
        red: 'text-red-600 dark:text-red-400',
    };

    // Status badge color
    const statusColor = conversation.status === 'open'
        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
        : 'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700';

    // Status border color (left side of card)
    const statusBorderColor = conversation.status === 'open' ? 'bg-green-500' : 'bg-yellow-500';

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:shadow-md transition-shadow overflow-hidden relative border-l-4" style={{ borderLeftColor: 'transparent' }}>
            {/* Status color border */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusBorderColor}`} />
            {/* Header: Avatar + Name + Unread */}
            <div className="flex items-start gap-2 mb-2">
                <Avatar className="w-10 h-10 flex-shrink-0">
                    <AvatarImage src={conversation.contact.profile_pic_url || undefined} />
                    <AvatarFallback>
                        {conversation.contact.push_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold text-sm truncate">
                            {conversation.contact.push_name}
                        </h4>
                        {conversation.unread_count > 0 && (
                            <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                                {conversation.unread_count}
                            </Badge>
                        )}
                    </div>

                    {/* Channel + Instance - Desktop only */}
                    <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        {conversation.contact.channel === 'whatsapp' ? (
                            <FaWhatsapp className="w-3 h-3 text-green-600" />
                        ) : (
                            <FaInstagram className="w-3 h-3 text-pink-600" />
                        )}
                        <span className="truncate">{conversation.instance?.name || 'Instância'}</span>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-slate-700 my-2" />

            {/* Status + Timer */}
            <div className="flex items-center justify-between mb-2">
                <Badge className={cn("text-xs", statusColor)}>
                    {conversation.status === 'open' ? 'Aberto' : 'Pendente'}
                </Badge>
                <span className={cn("text-xs font-medium", colorClasses[color])}>
                    {label}
                </span>
            </div>

            {/* Satisfaction Score + Tags */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                {conversation.sentiment_score !== null && (
                    <span className="text-xs flex items-center gap-1">
                        ⭐ {conversation.sentiment_score}
                    </span>
                )}

                {/* Tags - show max 2 on mobile, 3 on desktop */}
                {conversation.contact.contact_tags?.slice(0, window.innerWidth < 768 ? 2 : 3).map((ct) => (
                    <Badge
                        key={ct.tag_id}
                        style={{ backgroundColor: `${ct.tags?.color || '#gray'}20`, color: ct.tags?.color || '#gray' }}
                        className="text-xs px-1.5 py-0.5"
                    >
                        {ct.tags?.name || 'Tag'}
                    </Badge>
                ))}
                {(conversation.contact.contact_tags?.length || 0) > (window.innerWidth < 768 ? 2 : 3) && (
                    <span className="text-xs text-muted-foreground">
                        +{(conversation.contact.contact_tags?.length || 0) - (window.innerWidth < 768 ? 2 : 3)}
                    </span>
                )}
            </div>

            {/* Action Icons */}
            <div className="flex items-center gap-2 mb-2">
                {hasDeal && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewDeal?.();
                        }}
                        title="Ver negociação"
                    >
                        <Briefcase className="w-4 h-4 text-blue-600" />
                    </Button>
                )}
                {hasAppointment && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewAppointment?.();
                        }}
                        title="Ver agendamento"
                    >
                        <Calendar className="w-4 h-4 text-purple-600" />
                    </Button>
                )}
                {hasTask && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewTask?.();
                        }}
                        title="Ver tarefa"
                    >
                        <CheckSquare className="w-4 h-4 text-orange-600" />
                    </Button>
                )}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 dark:border-slate-700 my-2" />

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 flex-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenChat();
                    }}
                >
                    <MessageCircle className="w-4 h-4 mr-1" />
                    <span className="hidden sm:inline">Chat</span>
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            onTransfer();
                        }}>
                            Transferir
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            onTag();
                        }}>
                            Etiquetar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            onResolve();
                        }} className="text-red-600">
                            Resolver
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Conversation ID - Small text at bottom */}
            <div className="mt-2 text-xs text-muted-foreground font-mono">
                ID: {conversation.id.substring(0, 8)}
            </div>
        </div>
    );
}
