import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useResolveConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      // First, save attendance data
      const { error: saveError } = await supabase.functions.invoke("save-attendance-data", {
        body: { conversationId },
      });

      if (saveError) {
        console.error('Error saving attendance data:', saveError);
        // Continue anyway to resolve the ticket
      }

      // Then update conversation status
      const { data, error } = await supabase
        .from("conversations")
        .update({ status: "resolved" })
        .eq("id", conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast({
        title: "Ticket resolvido!",
        description: "A conversa foi marcada como resolvida e os dados foram salvos.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao resolver ticket",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
