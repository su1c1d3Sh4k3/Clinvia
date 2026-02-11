import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Hook for conversation actions: transfer, resolve, assign tags
 */
export function useConversationActions() {
    const queryClient = useQueryClient();

    // Transfer conversation to another queue
    const transferQueue = useMutation({
        mutationFn: async ({
            conversationId,
            newQueueId
        }: {
            conversationId: string;
            newQueueId: string
        }) => {
            const { error } = await supabase
                .from('conversations')
                .update({
                    queue_id: newQueueId,
                    assigned_agent_id: null // Clear assignment when transferring
                })
                .eq('id', conversationId);

            if (error) throw error;
        },
        onSuccess: () => {
            toast({
                title: 'Conversa transferida',
                description: 'A conversa foi transferida com sucesso.',
            });
            queryClient.invalidateQueries({ queryKey: ['queue-conversations'] });
        },
        onError: (error: any) => {
            toast({
                title: 'Erro ao transferir',
                description: error.message,
                variant: 'destructive'
            });
        }
    });

    // Resolve conversation (set status to closed)
    const resolveConversation = useMutation({
        mutationFn: async (conversationId: string) => {
            const { error } = await supabase
                .from('conversations')
                .update({ status: 'closed' })
                .eq('id', conversationId);

            if (error) throw error;
        },
        onSuccess: () => {
            toast({
                title: 'Conversa resolvida',
                description: 'A conversa foi fechada com sucesso.',
            });
            queryClient.invalidateQueries({ queryKey: ['queue-conversations'] });
        },
        onError: (error: any) => {
            toast({
                title: 'Erro ao resolver',
                description: error.message,
                variant: 'destructive'
            });
        }
    });

    return {
        transferQueue,
        resolveConversation
    };
}
