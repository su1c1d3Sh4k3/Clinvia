import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { useIsTyping } from "@/contexts/TypingContext";

type Conversation = Tables<"conversations"> & {
  contacts: Tables<"contacts"> & {
    contact_tags: {
      tags: Tables<"tags"> | null;
    }[];
  };
  groups: Tables<"groups"> | null;
  queues: { name: string } | null;
};

type TabFilter = "open" | "pending" | "resolved" | "all";

interface UseConversationsOptions {
  tab?: TabFilter;
  userId?: string;
  role?: string;
  teamMemberId?: string;
  channel?: 'whatsapp' | 'instagram';
}

export const useConversations = (options: UseConversationsOptions = {}) => {
  const { tab = "open", userId, role, teamMemberId, channel } = options;
  const queryClient = useQueryClient();
  const isTyping = useIsTyping();
  const isTypingRef = useRef(isTyping);

  // Keep ref updated so subscription callbacks have latest value
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", tab, userId, role, teamMemberId, channel],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select(`
          *,
          instance_id,
          contacts (
            *,
            contact_tags (
              tags (*)
            )
          ),
          groups (*),
          queues (
            name
          )
        `)
        .order("last_message_at", { ascending: false });

      // Apply filters based on tab
      if (tab === "open") {
        query = query.eq("status", "open");
      } else if (tab === "pending") {
        query = query.eq("status", "pending");
      } else if (tab === "resolved") {
        query = query.eq("status", "resolved");
      }
      // if tab === "all", no status filter is applied

      const { data, error } = await query.limit(5000);

      if (error) throw error;

      let filteredData = data as Conversation[];

      // Filter by channel if specified
      if (channel) {
        filteredData = filteredData.filter((conv: any) =>
          (conv.channel || 'whatsapp') === channel
        );
      }

      // Para agentes, filtrar apenas conversas atribuídas a eles (quando abertas)
      // Agentes podem ver: conversas atribuídas a eles OU conversas pendentes
      if (role === "agent" && teamMemberId) {
        filteredData = filteredData.filter((conv) => {
          // Agente pode ver conversas pendentes (para pegar novos tickets)
          if (conv.status === "pending") return true;
          // Agente pode ver conversas abertas atribuídas a ele
          if (conv.status === "open" && conv.assigned_agent_id === teamMemberId) return true;
          // Agente pode ver conversas resolvidas que foram atribuídas a ele
          if (conv.status === "resolved" && conv.assigned_agent_id === teamMemberId) return true;
          return false;
        });
      }

      // ----------------------------------------------------------------------
      // BATCH FETCH das últimas mensagens via RPC dedicada — substitui N+1
      // que consumia ~43% do CPU do banco (338 calls/min de SELECT em messages).
      //
      // A RPC `get_last_messages_for_conversations` usa LATERAL + LIMIT 1 com
      // índice (conversation_id, created_at DESC) → ~0.25ms para 5 conversations
      // (vs ~1100ms via N+1 com Promise.all).
      //
      // SECURITY INVOKER — respeita RLS da tabela messages. Conversations
      // resolvidas continuam usando messages_history (mensagens reais são
      // deletadas pelo trigger ao resolver).
      // ----------------------------------------------------------------------
      const idsNeedingLastMsg = filteredData
        .filter((c) => c.status !== 'resolved')
        .map((c) => c.id);

      const lastMsgByConvId = new Map<string, any>();

      if (idsNeedingLastMsg.length > 0) {
        try {
          const { data: lastMsgs, error: rpcErr } = await supabase.rpc(
            'get_last_messages_for_conversations' as any,
            { p_conversation_ids: idsNeedingLastMsg }
          );
          if (rpcErr) {
            console.error('[useConversations] RPC get_last_messages error:', rpcErr);
          } else {
            for (const m of (lastMsgs as any[]) ?? []) {
              lastMsgByConvId.set(m.conversation_id, m);
            }
          }
        } catch (e) {
          console.error('[useConversations] RPC get_last_messages exception:', e);
        }
      }

      const conversationsWithLastMessage = filteredData.map((conv) => {
        // Resolvidas: usar messages_history (mensagens da tabela são deletadas no resolve)
        if (conv.status === 'resolved') {
          const history = (conv as any).messages_history;
          if (Array.isArray(history) && history.length > 0) {
            const lastHistMsg = history[history.length - 1];
            return {
              ...conv,
              last_message_obj: {
                direction: lastHistMsg.role === 'user' ? 'inbound' : 'outbound',
                body: lastHistMsg.content || '',
                created_at: lastHistMsg.created_at,
                status: 'read',
                message_type: lastHistMsg.type || 'text',
              },
            };
          }
          return { ...conv, last_message_obj: null };
        }
        // Open/pending: resultado do batch RPC
        return {
          ...conv,
          last_message_obj: lastMsgByConvId.get(conv.id) || null,
        };
      });

      return conversationsWithLastMessage as (Conversation & { last_message_obj: any })[];
    },
    enabled: !!userId,
    refetchInterval: 300000, // Polling every 5 minutes for follow up badges
  });

  // Set up realtime subscription for conversations and follow ups
  useEffect(() => {
    const conversationsChannel = supabase
      .channel("conversations-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        () => {
          // Only invalidate if NOT typing - prevents re-renders during input
          if (!isTypingRef.current) {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
          }
        }
      )
      .subscribe();

    // Also subscribe to conversation_follow_ups for badge updates
    const followUpChannel = supabase
      .channel("follow-up-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_follow_ups",
        },
        () => {
          // Only invalidate if NOT typing
          if (!isTypingRef.current) {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["conversation-follow-up"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(followUpChannel);
    };
  }, [queryClient]);

  return {
    conversations: conversations || [],
    isLoading,
  };
};

