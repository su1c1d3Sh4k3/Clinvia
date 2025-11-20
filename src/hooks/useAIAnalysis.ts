import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";

type AIAnalysis = Tables<"ai_analysis">;

export const useAIAnalysis = (conversationId?: string) => {
  const queryClient = useQueryClient();

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["ai-analysis", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from("ai_analysis")
        .select("*")
        .eq("conversation_id", conversationId)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as AIAnalysis | null;
    },
    enabled: !!conversationId,
  });

  // Set up realtime subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`ai-analysis-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_analysis",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ai-analysis", conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return {
    analysis,
    isLoading,
  };
};
