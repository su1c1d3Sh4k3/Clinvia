import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ActiveConversationData {
    id: string;
    status: string;
    assigned_agent_id: string | null;
    unread_count: number;
    agent_name: string | null;
}

/**
 * Hook to check if a contact has an active (open/pending) conversation
 * and get information about which agent is handling it.
 * 
 * Used to prevent duplicate conversations and show blocking messages.
 */
export function useActiveConversation(contactId: string | null) {
    return useQuery({
        queryKey: ['active-conversation-check', contactId],
        queryFn: async (): Promise<ActiveConversationData | null> => {
            if (!contactId) return null;

            // First get the conversation
            const { data: conversation, error } = await supabase
                .from('conversations')
                .select('id, status, assigned_agent_id, unread_count')
                .eq('contact_id', contactId)
                .in('status', ['open', 'pending'])
                .limit(1)
                .single();

            if (error || !conversation) return null;

            // If there's an assigned agent, get their name
            let agentName: string | null = null;
            if (conversation.assigned_agent_id) {
                const { data: teamMember } = await supabase
                    .from('team_members')
                    .select('name')
                    .eq('id', conversation.assigned_agent_id)
                    .single();

                agentName = teamMember?.name || null;
            }

            return {
                id: conversation.id,
                status: conversation.status,
                assigned_agent_id: conversation.assigned_agent_id,
                unread_count: conversation.unread_count || 0,
                agent_name: agentName
            };
        },
        enabled: !!contactId,
        staleTime: 5000, // Cache for 5 seconds
    });
}

/**
 * Utility function to check active conversation (non-hook version)
 * For use in event handlers where hooks can't be used.
 */
export async function checkActiveConversation(contactId: string): Promise<ActiveConversationData | null> {
    if (!contactId) return null;

    const { data: conversation, error } = await supabase
        .from('conversations')
        .select('id, status, assigned_agent_id, unread_count')
        .eq('contact_id', contactId)
        .in('status', ['open', 'pending'])
        .limit(1)
        .single();

    if (error || !conversation) return null;

    let agentName: string | null = null;
    if (conversation.assigned_agent_id) {
        const { data: teamMember } = await supabase
            .from('team_members')
            .select('name')
            .eq('id', conversation.assigned_agent_id)
            .single();

        agentName = teamMember?.name || null;
    }

    return {
        id: conversation.id,
        status: conversation.status,
        assigned_agent_id: conversation.assigned_agent_id,
        unread_count: conversation.unread_count || 0,
        agent_name: agentName
    };
}
