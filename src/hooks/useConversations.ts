import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Conversation = Tables<"conversations"> & {
  contacts: Tables<"contacts">;
};

type TabFilter = "meus" | "nao-atribuidos" | "todos";

export const useConversations = (tab: TabFilter = "todos", userId?: string) => {
  const queryClient = useQueryClient();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", tab, userId],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select(`
          *,
          contacts (*)
        `)
        .order("updated_at", { ascending: false });

      // Apply filters based on tab
      if (tab === "meus" && userId) {
        query = query.eq("assigned_agent_id", userId);
      } else if (tab === "nao-atribuidos") {
        query = query.is("assigned_agent_id", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Conversation[];
    },
    enabled: !!userId || tab !== "meus",
  });

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    conversations: conversations || [],
    isLoading,
  };
};
