import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOwnerId } from './useOwnerId';

export interface QueueConversation {
    id: string;
    contact_id: string;
    instance_id: string;
    queue_id: string | null;
    assigned_agent_id: string | null;
    status: 'open' | 'pending' | 'closed';
    unread_count: number;
    last_message_at: string;
    sentiment_score: number | null;
    contact: {
        push_name: string;
        profile_pic_url: string | null;
        phone: string;
        number: string;
        channel: 'whatsapp' | 'instagram';
        contact_tags?: Array<{
            tag_id: string;
            tags: {
                id: string;
                name: string;
                color: string;
            } | null;
        }>;
    };
    instance: {
        name: string;
    } | null;
    assigned_agent: {
        id: string;
        name: string;
    } | null;
    last_message: {
        direction: 'inbound' | 'outbound' | 'system';
        body?: string;
        created_at?: string;
    } | null;
}

/**
 * Hook to fetch conversations grouped by queue
 * Only returns open/pending conversations
 * Ordered by last_message_at DESC
 */
export function useQueueConversations() {
    const { data: ownerId } = useOwnerId();

    return useQuery({
        queryKey: ['queue-conversations', ownerId],
        queryFn: async () => {
            if (!ownerId) return [];

            const { data, error } = await supabase
                .from('conversations')
                .select(`
                    id,
                    contact_id,
                    instance_id,
                    queue_id,
                    assigned_agent_id,
                    status,
                    unread_count,
                    last_message_at,
                    sentiment_score,
                    contact:contacts (
                        push_name,
                        profile_pic_url,
                        phone,
                        number,
                        channel,
                        contact_tags (
                            tag_id,
                            tags (
                                id,
                                name,
                                color
                            )
                        )
                    ),
                    instance:instances (
                        name
                    ),
                    assigned_agent:team_members (
                        id,
                        name
                    )
                `)
                .eq('user_id', ownerId)
                .in('status', ['open', 'pending'])
                .order('last_message_at', { ascending: false });

            if (error) throw error;

            // Filter out conversations with null contacts (data integrity issue)
            const validConversations = (data || []).filter(conv =>
                conv.contact &&
                conv.contact.push_name &&
                conv.contact.number
            );

            // Fetch last message direction for each conversation
            // Exclude system transfer messages (they should not affect timer/status)
            const conversationsWithLastMessage = await Promise.all(
                validConversations.map(async (conv) => {
                    const { data: lastMsg } = await supabase
                        .from('messages')
                        .select('direction, body, created_at')
                        .eq('conversation_id', conv.id)
                        .not('body', 'like', '%transferida de%')  // Exclude transfer messages
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    return {
                        ...conv,
                        last_message: lastMsg || null
                    };
                })
            );

            return conversationsWithLastMessage as QueueConversation[];
        },
        enabled: !!ownerId,
        staleTime: 30000, // 30 seconds
    });
}

/**
 * Hook to check if contact has future appointments
 */
export function useHasAppointment(contactId: string) {
    return useQuery({
        queryKey: ['has-appointment', contactId],
        queryFn: async () => {
            const { data } = await supabase
                .from('appointments')
                .select('id')
                .eq('contact_id', contactId)
                .gt('scheduled_date', new Date().toISOString())
                .limit(1);

            return (data?.length ?? 0) > 0;
        },
        enabled: !!contactId
    });
}

/**
 * Hook to check if contact has active deals
 */
export function useHasDeal(contactId: string) {
    return useQuery({
        queryKey: ['has-deal', contactId],
        queryFn: async () => {
            const { data } = await supabase
                .from('crm_deals')
                .select('id')
                .eq('contact_id', contactId)
                .limit(1);

            return (data?.length ?? 0) > 0;
        },
        enabled: !!contactId
    });
}

/**
 * Hook to check if contact has future tasks
 */
export function useHasTask(contactId: string) {
    return useQuery({
        queryKey: ['has-task', contactId],
        queryFn: async () => {
            const { data } = await supabase
                .from('tasks')
                .select('id')
                .eq('contact_id', contactId)
                .gt('due_date', new Date().toISOString())
                .limit(1);

            return (data?.length ?? 0) > 0;
        },
        enabled: !!contactId
    });
}
