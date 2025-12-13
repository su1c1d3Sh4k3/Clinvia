import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";

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
}

export const useConversations = (options: UseConversationsOptions = {}) => {
  const { tab = "open", userId, role, teamMemberId } = options;
  const queryClient = useQueryClient();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", tab, userId, role, teamMemberId],
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

      const { data, error } = await query;

      if (error) throw error;

      let filteredData = data as Conversation[];

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

      return filteredData;
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
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["conversation-follow-up"] });
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
