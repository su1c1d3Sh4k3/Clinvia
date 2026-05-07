import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Message = Tables<"messages">;

/**
 * Custom hook to fetch and subscribe to messages for a specific conversation.
 * 
 * @param conversationId - The ID of the conversation to fetch messages for.
 * @returns An object containing:
 * - `messages`: Array of Message objects (sorted by creation time).
 * - `isLoading`: Boolean indicating if the initial fetch is in progress.
 * 
 * @remarks
 * This hook handles both active conversations (fetching from `messages` table with realtime subscription)
 * and resolved conversations (parsing JSON `messages_history` from `conversations` table).
 */
export const useMessages = (conversationId?: string) => {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      // 1. Fetch conversation status first to decide source
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .select("status, messages_history")
        .eq("id", conversationId)
        .single();

      if (convError) throw convError;

      // 2. If resolved, parse JSON history
      if (conversation.status === "resolved") {
        const history = conversation.messages_history as any[];
        if (!history || !Array.isArray(history)) return [];

        // Map JSON history to Message interface
        return history.map((item, index) => {
          // Support both new (rich) and old (simple) formats
          const role = item.role || (item.user ? "user" : "assistant");
          const content = item.content || item.user || item.assistant;

          return {
            id: item.id || `history-${index}`,
            conversation_id: conversationId,
            body: content,
            direction: role === "user" ? "inbound" : "outbound",
            message_type: item.type || "text",
            created_at: item.created_at || null,
            media_url: item.media_url || null,
            transcription: item.transcription || null,
            status: "read",
            evolution_id: null
          } as Message;
        });
      }

      // 3. If active, fetch from messages table.
      // IMPORTANT: fetch in descending order (newest first) with explicit limit to avoid
      // Supabase's default 1000-row cap silently cutting off the newest messages in
      // conversations with >1000 messages. We then reverse so the array is chronological.
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return (data as Message[]).reverse();
    },
    enabled: !!conversationId,
  });

  // Set up realtime subscriptions for new messages.
  //
  // ⚠️ Histórico do bug:
  //   O filtro server-side `conversation_id=eq.${conversationId}` em Realtime
  //   estava silenciosamente falhando para conversas Instagram (mensagens chegavam
  //   no banco normalmente mas o invalidate nunca disparava no front).
  //   useConversations (sem filter, channel global) funcionava — confirmando que
  //   o problema era específico do filtro server-side em messages.
  //
  // Fix: usamos channel SEM filter e validamos o conversation_id no callback,
  //   que é estável em qualquer canal/instância. Trade-off: cada cliente recebe
  //   eventos de todas as suas conversas (volume baixo dado o RLS user-scoped).
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-rt-${conversationId}`)
      // 1) Insert/update/delete em messages — filtro client-side por conversation_id
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload: any) => {
          const row = payload.new ?? payload.old;
          if (row?.conversation_id === conversationId) {
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
          }
        }
      )
      // 2) Fallback redundante: update na conversa atual (webhook sempre toca
      //    last_message_at, então isso fire toda vez que chega/sai mensagem)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
        },
        (payload: any) => {
          if (payload.new?.id === conversationId) {
            queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[useMessages] Realtime ${status} for ${conversationId}`);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, queryClient]);

  return {
    messages: messages || [],
    isLoading,
  };
};
