import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Message = Tables<"messages">;

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

      // 3. If active, fetch from messages table
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
  });

  // Set up realtime subscription for new messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        }
      )
      .subscribe();

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
