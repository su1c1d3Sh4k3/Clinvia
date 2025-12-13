import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useUpdateTicketStatus = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ conversationId, status }: { conversationId: string; status: string }) => {
            const { data, error } = await supabase
                .from("conversations")
                .update({ status: status as "open" | "pending" | "resolved" })
                .eq("id", conversationId)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["conversation", variables.conversationId] });

            toast({
                title: "Status atualizado",
                description: `O ticket foi movido para ${variables.status}.`,
            });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao atualizar status",
                description: error.message,
                variant: "destructive",
            });
        },
    });
};
