import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useGenerateSummary = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke("ai-generate-summary", {
        body: { conversationId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ["ai-analysis", conversationId] });
      toast({
        title: "Resumo gerado!",
        description: "O resumo da conversa foi gerado com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao gerar resumo",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
