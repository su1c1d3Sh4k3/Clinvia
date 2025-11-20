import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useResolveConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (conversationId: string) => {
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
        description: "A conversa foi marcada como resolvida.",
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
