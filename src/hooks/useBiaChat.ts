import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentPage } from './useCurrentPage';
import { useUserRole } from './useUserRole';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface UserContext {
    userId: string;
    ownerId: string;
    teamMemberId: string;
}

interface UseBiaChatReturn {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    sendMessage: (message: string) => Promise<void>;
    clearMessages: () => void;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

export const useBiaChat = (): UseBiaChatReturn => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [userContext, setUserContext] = useState<UserContext | null>(null);

    const currentPage = useCurrentPage();
    const { data: userRole } = useUserRole();

    // Carregar userId, ownerId e teamMemberId ao montar
    useEffect(() => {
        const loadUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                // Buscar team_member para obter owner_id
                const { data: teamMember } = await supabase
                    .from('team_members')
                    .select('id, user_id')
                    .eq('auth_user_id', user.id)
                    .single();

                setUserContext({
                    userId: user.id,
                    ownerId: teamMember?.user_id || user.id, // owner_id é o user_id do tenant
                    teamMemberId: teamMember?.id || ''
                });
            }
        };
        loadUser();
    }, []);

    // Carregar histórico do banco para EXIBIÇÃO na UI (não para enviar à IA)
    useEffect(() => {
        if (!userContext?.userId) return;

        const loadHistory = async () => {
            try {
                const { data, error } = await supabase
                    .from('bia_chat_history' as any)
                    .select('id, role, content, created_at')
                    .eq('auth_user_id', userContext.userId)
                    .order('created_at', { ascending: true })
                    .limit(50);

                if (error) {
                    console.error('Erro ao carregar histórico:', error);
                    return;
                }

                if (data && data.length > 0) {
                    const loadedMessages: ChatMessage[] = data.map((msg: any) => ({
                        id: msg.id,
                        role: msg.role as 'user' | 'assistant',
                        content: msg.content,
                        timestamp: new Date(msg.created_at),
                    }));
                    setMessages(loadedMessages);
                }
            } catch (err) {
                console.error('Erro ao carregar histórico:', err);
            }
        };

        loadHistory();
    }, [userContext?.userId]);

    // Salvar mensagem no banco (apenas para persistência de UI)
    const saveMessage = useCallback(async (role: 'user' | 'assistant', content: string) => {
        if (!userContext?.userId) return;

        try {
            await supabase
                .from('bia_chat_history' as any)
                .insert({
                    auth_user_id: userContext.userId,
                    role,
                    content,
                    page_slug: currentPage.slug,
                    page_name: currentPage.name,
                });
        } catch (err) {
            console.error('Erro ao salvar mensagem:', err);
        }
    }, [userContext?.userId, currentPage]);

    const sendMessage = useCallback(async (message: string) => {
        if (!message.trim()) return;

        setError(null);
        setIsLoading(true);

        // Adicionar mensagem do usuário à UI
        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);

        // Salvar no banco (apenas para persistência visual)
        await saveMessage('user', message);

        try {
            // CONTEXTO MÍNIMO: Apenas últimas 3 mensagens para a IA
            // Isso mantém contexto básico sem consumir muitos tokens
            const conversationHistory = messages.slice(-3).map(m => ({
                role: m.role,
                content: m.content,
            }));

            // Chamar Edge Function com contexto completo do usuário
            const { data, error: fnError } = await supabase.functions.invoke('ai-support-chat', {
                body: {
                    message,
                    pageSlug: currentPage.slug,
                    pageName: currentPage.name,
                    userRole: userRole || 'agent',
                    conversationHistory,
                    // Contexto do usuário para Function Calling
                    userId: userContext?.userId,
                    ownerId: userContext?.ownerId,
                    teamMemberId: userContext?.teamMemberId,
                },
            });

            if (fnError) throw fnError;

            // Adicionar resposta da Bia
            const assistantMessage: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: data.response,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMessage]);

            // Salvar resposta no banco
            await saveMessage('assistant', data.response);

        } catch (err: any) {
            console.error('Erro ao enviar mensagem para Bia:', err);
            setError(err.message || 'Erro ao processar sua mensagem');

            const errorMessage: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: 'Ops! Tive um probleminha aqui 😅 Tenta de novo daqui a pouco?',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [messages, currentPage, userRole, saveMessage]);

    const clearMessages = useCallback(async () => {
        if (!userContext?.userId) return;

        try {
            await supabase
                .from('bia_chat_history' as any)
                .delete()
                .eq('auth_user_id', userContext.userId);

            setMessages([]);
            setError(null);
        } catch (err) {
            console.error('Erro ao limpar histórico:', err);
        }
    }, [userContext?.userId]);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        clearMessages,
        isOpen,
        setIsOpen,
    };
};
