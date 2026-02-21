import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCurrentTeamMember } from './useStaff';
import { useOwnerId } from './useOwnerId';

export type InternalChatType = 'direct' | 'group';

export interface InternalChat {
    id: string;
    type: InternalChatType;
    name?: string;
    user_id: string;
    updated_at: string;
    participants?: {
        user_id: string;
        role: string;
        profile?: {
            name: string;
            profile_pic_url: string;
        }
    }[];
    last_message?: {
        body: string;
        created_at: string;
        sender_id: string;
    };
}

export interface InternalMessage {
    id: string;
    chat_id: string;
    sender_id: string;
    body: string;
    media_url?: string;
    media_type?: string;
    file_name?: string;
    created_at: string;
}

export const useInternalChats = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Fetch all chats where the user is a participant
    const { data: chats, isLoading: isLoadingChats } = useQuery({
        queryKey: ['internal_chats', user?.id],
        queryFn: async () => {
            if (!user) return [];

            // Obter os chat_ids onde o usuário participa
            const { data: participations, error: pError } = await supabase
                .from('internal_chat_participants')
                .select('chat_id')
                .eq('user_id', user.id);

            if (pError) throw pError;

            const chatIds = participations.map(p => p.chat_id);
            if (chatIds.length === 0) return [];

            // Obter detalhes dos chats + última mensagem (mockada via joined query ou order)
            const { data: chatsData, error: cError } = await supabase
                .from('internal_chats')
                .select(`
                    id, type, name, user_id, updated_at
                `)
                .in('id', chatIds)
                .order('updated_at', { ascending: false });

            if (cError) throw cError;

            // Para cada chat, buscar um resumo dos participantes para exibir nomes/avatares
            const enrichedChats = await Promise.all(chatsData.map(async (chat) => {
                const { data: parts } = await supabase
                    .from('internal_chat_participants')
                    .select('user_id, role')
                    .eq('chat_id', chat.id);

                // Fetch profiles details from team_members by auth_user_id (the actual participant identifier)
                const userIds = parts?.map(p => p.user_id) || [];
                const { data: profiles } = await supabase
                    .from('team_members')
                    .select('auth_user_id, name, profile_pic_url')
                    .in('auth_user_id', userIds);

                const mappedParts = parts?.map(p => ({
                    ...p,
                    profile: profiles?.find(prof => prof.auth_user_id === p.user_id)
                }));

                // Fetch last message
                const { data: msgs } = await supabase
                    .from('internal_messages')
                    .select('body, created_at, sender_id')
                    .eq('chat_id', chat.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                return {
                    ...chat,
                    participants: mappedParts,
                    last_message: msgs && msgs.length > 0 ? msgs[0] : null
                };
            }));

            // Ordenar por updated_at descendente (chats com mensagens recentes primeiro)
            return enrichedChats.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        },
        enabled: !!user?.id,
    });

    // Realtime subscription for chats logic
    useEffect(() => {
        if (!user) return;

        // Ao receber novas mensagens em qualquer chat, invalida a lista
        const channel = supabase.channel('internal_chats_updates')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'internal_messages'
            }, () => {
                queryClient.invalidateQueries({ queryKey: ['internal_chats', user.id] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, queryClient]);

    return { chats, isLoadingChats };
};

export const useInternalMessages = (chatId: string | null) => {
    const queryClient = useQueryClient();

    const { data: messages, isLoading } = useQuery({
        queryKey: ['internal_messages', chatId],
        queryFn: async () => {
            if (!chatId) return [];
            const { data, error } = await supabase
                .from('internal_messages')
                .select('id, chat_id, sender_id, body, media_url, media_type, file_name, created_at')
                .eq('chat_id', chatId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data;
        },
        enabled: !!chatId,
    });

    useEffect(() => {
        if (!chatId) return;

        const channel = supabase.channel(`internal_messages_${chatId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'internal_messages',
                filter: `chat_id=eq.${chatId}`
            }, (payload) => {
                const newMessage = payload.new as InternalMessage;
                // Otimista: adicionar à cache existente em vez de refetching para ser mais rápido
                queryClient.setQueryData(['internal_messages', chatId], (old: any) => {
                    const current = Array.isArray(old) ? old : [];
                    // Avoid duplicates if message was sent by the same client
                    if (current.find(m => m.id === newMessage.id)) return current;
                    return [...current, newMessage];
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [chatId, queryClient]);

    const sendMessageMutation = useMutation({
        mutationFn: async ({ chatId, senderId, body, mediaUrl, mediaType, fileName }: { chatId: string, senderId: string, body: string, mediaUrl?: string, mediaType?: string, fileName?: string }) => {
            const { data, error } = await supabase
                .from('internal_messages')
                .insert({
                    chat_id: chatId,
                    sender_id: senderId,
                    body,
                    media_url: mediaUrl || null,
                    media_type: mediaType || null,
                    file_name: fileName || null
                })
                .select('id, chat_id, sender_id, body, media_url, media_type, file_name, created_at')
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (data, variables) => {
            // Force immediate cache update with new message for instant rendering
            queryClient.setQueryData(['internal_messages', variables.chatId], (old: any) => {
                const current = Array.isArray(old) ? old : [];
                if (current.find((m: any) => m.id === data.id)) return current;
                return [...current, data];
            });
        }
    });

    return { messages, isLoading, sendMessage: sendMessageMutation.mutateAsync };
};

export const useCreateInternalChat = () => {
    const { user } = useAuth();
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();

    const createChatMutation = useMutation({
        mutationFn: async ({ targetUserIds, type = 'direct', name }: { targetUserIds: string[], type?: InternalChatType, name?: string }) => {
            if (!user || !ownerId) throw new Error("Not authenticated or missing owner context");

            // Para direct chats, se já existir um chat entre os dois formados apenas por ele, retornar ele
            if (type === 'direct' && targetUserIds.length === 1) {
                // ... logic to prevent duplicate physical direct chats could be implemented here
                // We'll skip complex duplication logic for simplicity and rely on the UI to guide to existing
            }

            // 1. Criar o chat
            const { data: newChat, error: chatError } = await supabase
                .from('internal_chats')
                .insert({
                    type,
                    name,
                    user_id: ownerId // The owner of the team
                })
                .select()
                .single();

            if (chatError) {
                console.error("Chat creation error:", chatError);
                throw new Error(chatError.message || "Erro ao criar o cabeçalho do chat");
            }

            // 2. Adicionar os participantes incluindo o criador
            const allParticipantsIds = [...new Set([user.id, ...targetUserIds])];
            const participantsPayload = allParticipantsIds.map(uid => ({
                chat_id: newChat.id,
                user_id: uid,
                role: uid === user.id ? 'admin' : 'member'
            }));

            const { error: partError } = await supabase
                .from('internal_chat_participants')
                .insert(participantsPayload);

            if (partError) {
                console.error("Participants insertion error:", partError);
                throw new Error(partError.message || "Erro ao adicionar participantes no chat");
            }

            return newChat;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['internal_chats', user?.id] });
        }
    });

    return { createChat: createChatMutation.mutateAsync, isCreating: createChatMutation.isPending };
};
