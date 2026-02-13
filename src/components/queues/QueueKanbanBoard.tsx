import { useEffect, useState } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOwnerId } from '@/hooks/useOwnerId';
import { useQueueConversations } from '@/hooks/useQueueConversations';
import { QueueColumn } from './QueueColumn';
import { Loader2 } from 'lucide-react';
import type { QueueConversation } from '@/hooks/useQueueConversations';

interface QueueKanbanBoardProps {
    searchTerm?: string;
    selectedTagId?: string;
    selectedStatus?: 'all' | 'open' | 'pending';
    selectedAgentId?: string;
    channelFilters: { whatsapp: boolean; instagram: boolean };
}

export function QueueKanbanBoard({
    searchTerm = '',
    selectedTagId = 'all',
    selectedStatus = 'all',
    selectedAgentId = 'all',
    channelFilters,
}: QueueKanbanBoardProps) {
    const { data: ownerId } = useOwnerId();
    const { data: conversations, isLoading: conversationsLoading } = useQueueConversations();
    const queryClient = useQueryClient();

    // Fetch queues
    const { data: queues, isLoading: queuesLoading } = useQuery({
        queryKey: ['queues', ownerId],
        queryFn: async () => {
            if (!ownerId) return [];

            const { data, error } = await supabase
                .from('queues')
                .select('*')
                .eq('user_id', ownerId)
                .eq('is_active', true)
                .order('created_at');

            if (error) throw error;
            return data;
        },
        enabled: !!ownerId,
    });

    // Real-time subscription for new messages (triggers reordering)
    useEffect(() => {
        if (!ownerId) return;

        const channel = supabase
            .channel('queue-messages-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['queue-conversations'] });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'conversations',
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['queue-conversations'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [ownerId, queryClient]);

    // Filter conversations
    const filteredConversations = conversations?.filter((conv) => {
        // Search filter
        const matchesSearch =
            searchTerm === '' ||
            conv.contact.push_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            conv.contact.phone.includes(searchTerm) ||
            conv.id.includes(searchTerm);

        // Tag filter
        const matchesTag =
            selectedTagId === 'all' ||
            conv.contact.contact_tags.some((ct) => ct.tag_id === selectedTagId);

        // Status filter
        const matchesStatus =
            selectedStatus === 'all' || conv.status === selectedStatus;

        // Agent filter
        const matchesAgent =
            selectedAgentId === 'all' ||
            conv.assigned_agent_id === selectedAgentId;

        // Channel filter
        const matchesChannel =
            (channelFilters.whatsapp && conv.contact.channel === 'whatsapp') ||
            (channelFilters.instagram && (conv.contact.channel === 'instagram' || !conv.contact.channel)); // Include null/undefined as Instagram if needed, or strictly check. Usually existing contacts might be null if old.
        // Actually, better to stick to strict check if data is clean.
        // Let's assume 'whatsapp' is default or explicit.

        // Refined Channel Logic:
        const isWhatsapp = conv.contact.channel === 'whatsapp';
        const isInstagram = conv.contact.channel === 'instagram';

        const matchesChannelRefined =
            (channelFilters.whatsapp && isWhatsapp) ||
            (channelFilters.instagram && isInstagram);

        return matchesSearch && matchesTag && matchesStatus && matchesAgent && matchesChannelRefined;
    }) || [];

    // Group conversations by queue
    const conversationsByQueue = queues?.reduce((acc, queue) => {
        acc[queue.id] = filteredConversations.filter(
            (conv) => conv.queue_id === queue.id
        );
        return acc;
    }, {} as Record<string, QueueConversation[]>) || {};

    const handleDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        // Dropped outside or same position
        if (!destination ||
            (destination.droppableId === source.droppableId &&
                destination.index === source.index)) {
            return;
        }

        // Find the conversation
        const conversation = conversations?.find(c => c.id === draggableId);
        if (!conversation) return;

        const newQueueId = destination.droppableId;
        const newQueue = queues?.find(q => q.id === newQueueId);
        if (!newQueue) return;

        // Show confirmation modal via optimistic update
        // The confirmation is handled in QueueColumn via TransferQueueModal
        // This just triggers the visual drag
    };

    if (queuesLoading || conversationsLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!queues || queues.length === 0) {
        return (
            <div className="flex items-center justify-center h-96">
                <p className="text-muted-foreground">Nenhuma fila encontrada</p>
            </div>
        );
    }

    return (
        <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex h-full gap-4 overflow-x-auto pb-6 px-2 crm-scrollbar transition-colors">
                {queues.map((queue, index) => (
                    <QueueColumn
                        key={queue.id}
                        queueId={queue.id}
                        queueName={queue.name}
                        conversations={conversationsByQueue[queue.id] || []}
                        index={index}
                    />
                ))}
            </div>
        </DragDropContext>
    );
}
