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
            newQueueId,
            assignedAgentId = null
        }: {
            conversationId: string;
            newQueueId: string;
            assignedAgentId?: string | null;
        }) => {
            const { error } = await supabase
                .from('conversations')
                .update({
                    queue_id: newQueueId,
                    assigned_agent_id: assignedAgentId
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
            // USER RULE: quem encerra o atendimento leva a atribuição
            let resolverId: string | null = null;
            const { data: auth } = await supabase.auth.getUser();
            if (auth?.user) {
                const { data: tm } = await supabase
                    .from('team_members')
                    .select('id')
                    .eq('auth_user_id', auth.user.id)
                    .limit(1)
                    .maybeSingle();
                resolverId = tm?.id ?? null;
            }

            const { error } = await supabase
                .from('conversations')
                .update({
                    status: 'closed',
                    ...(resolverId ? { assigned_agent_id: resolverId } : {})
                })
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
