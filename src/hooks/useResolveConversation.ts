import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useResolveConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('resolve-ticket', {
        body: { conversationId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["ai-analysis", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversation-summary", conversationId] });
      toast({
        title: "Ticket resolvido!",
        description: "A conversa foi marcada como resolvida e a análise foi gerada.",
      });
    },
    onError: (error: any) => {
      console.error("Erro ao resolver ticket:", error);
      toast({
        title: "Erro ao resolver ticket",
        description: error.message || "Falha ao processar a resolução.",
        variant: "destructive",
      });
    },
  });
};
