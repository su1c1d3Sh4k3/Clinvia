import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Parameters for sending a message.
 */
interface SendMessageParams {
  conversationId?: string; // Now optional - can be created from contactId/groupId
  contactId?: string; // Optional - for creating conversations
  groupId?: string; // Optional - for creating conversations
  body: string;
  direction: "inbound" | "outbound";
  messageType?: "text" | "image" | "audio" | "video" | "document";
  mediaUrl?: string;
  caption?: string;
  replyId?: string;
  quotedBody?: string;
  quotedSender?: string;
  mentions?: string[]; // Array of JIDs to mention
}

/**
 * Custom hook to send messages using React Query Mutation.
 * 
 * This hook handles:
 * - Optimistic UI updates (adding the message to the list immediately).
 * - Sending the message via Supabase Edge Function (`evolution-send-message`).
 * - Error handling (marking message as error in UI).
 * - Updating the conversation's timestamp and last message.
 * 
 * @returns A React Query mutation object.
 */
export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ conversationId, contactId, groupId, body, direction, messageType = "text", mediaUrl, caption, replyId, quotedBody, quotedSender, mentions }: SendMessageParams) => {
      // Se for mensagem outbound, enviar via Edge Function (que chama Evolution API)
      if (direction === "outbound") {
        // ✨ OTIMIZAÇÃO: Criar mensagem otimista ANTES de enviar ao servidor
        const optimisticMessage = {
          id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // ID temporário único
          conversation_id: conversationId,
          body,
          direction: 'outbound' as const,
          message_type: messageType,
          media_url: mediaUrl || null,
          created_at: new Date().toISOString(),
          status: 'sending' as const, // Status temporário
          transcription: null,
          evolution_id: null,
          user_id: null,
          reply_to_id: replyId || null,
          quoted_body: quotedBody || null,
          quoted_sender: quotedSender || null,
          is_deleted: false,
          sender_name: null,
          sender_jid: null,
          sender_profile_pic_url: null
        };

        // ✨ ADICIONAR mensagem à UI IMEDIATAMENTE (antes de enviar ao servidor)
        // Só se tivermos conversationId (se não tiver, será criado no backend)
        if (conversationId) {
          queryClient.setQueryData(
            ["messages", conversationId],
            (old: any) => {
              if (!old) return [optimisticMessage];
              return [...old, optimisticMessage];
            }
          );
        }

        try {
          // ✅ Obter sessão atual para garantir envio do token
          const { data: { session } } = await supabase.auth.getSession();

          if (!session) {
            console.warn('[SEND MESSAGE] Warning: No active session found!');
          } else {
            console.log('[SEND MESSAGE] Session found, sending with auth token');
          }

          // Enviar ao servidor COM header Authorization explícito
          const { data, error } = await supabase.functions.invoke("evolution-send-message", {
            headers: session ? {
              Authorization: `Bearer ${session.access_token}`
            } : {},
            body: {
              conversationId,
              contactId,
              groupId,
              body,
              messageType,
              mediaUrl,
              caption,
              replyId,
              quotedBody,
              quotedSender,
              mentions: mentions ? mentions.join(',') : undefined, // Convert array to comma-separated string for API
              message: { wasSentByApi: false } // ✅ Flag para identificar envio humano (frontend)
            },
          });

          if (error) {
            console.error("Erro na Edge Function evolution-send-message:", error);
            throw new Error(error.message || "Erro ao enviar mensagem via servidor.");
          }

          if (data?.error) {
            throw new Error(data.error);
          }

          // ✨ SUBSTITUIR mensagem temporária pela mensagem real do servidor
          queryClient.setQueryData(
            ["messages", conversationId],
            (old: any) => {
              if (!old) return old;
              return old.map((msg: any) =>
                msg.id === optimisticMessage.id
                  ? {
                    ...msg,
                    id: data.messageId,
                    status: 'sent',
                    evolution_id: data.providerId || null
                  }
                  : msg
              );
            }
          );

          return data;
        } catch (error: any) {
          // ✨ MARCAR mensagem como erro na UI
          queryClient.setQueryData(
            ["messages", conversationId],
            (old: any) => {
              if (!old) return old;
              return old.map((msg: any) =>
                msg.id === optimisticMessage.id
                  ? { ...msg, status: 'error' }
                  : msg
              );
            }
          );

          throw error;
        }
      }

      // Mensagens inbound (simulação ou inserção manual)
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          body,
          direction,
          message_type: messageType,
          media_url: mediaUrl
        })
        .select()
        .single();

      if (error) throw error;

      // ⚠️ NOTE: conversation update agora é feito via database trigger
      // Ver migration: 20260203_auto_update_conversation_timestamp.sql

      return data;
    },
    onSuccess: (_, variables) => {
      // ✅ OTIMIZAÇÃO: Não invalida mensagens (já foram adicionadas otimisticamente)

      // Invalidar apenas a conversa específica (não todas)
      queryClient.invalidateQueries({
        queryKey: ["conversation", variables.conversationId]
      });

      // ✅ OTIMIZAÇÃO: Atualizar lista de conversas sem invalidar tudo
      queryClient.setQueryData(
        ["conversations"],
        (old: any) => {
          if (!old) return old;

          return old.map((conv: any) =>
            conv.id === variables.conversationId
              ? {
                ...conv,
                updated_at: new Date().toISOString(),
                last_message_at: new Date().toISOString()
              }
              : conv
          );
        }
      );
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
