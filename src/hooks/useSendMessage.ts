import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SendMessageParams {
  conversationId: string;
  body: string;
  direction: "inbound" | "outbound";
  messageType?: "text" | "image" | "audio" | "video" | "document";
  mediaUrl?: string;
  caption?: string;
  replyId?: string;
  quotedBody?: string;
  quotedSender?: string;
}

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ conversationId, body, direction, messageType = "text", mediaUrl, caption, replyId, quotedBody, quotedSender }: SendMessageParams) => {
      // Se for mensagem outbound, enviar via Edge Function (que chama Evolution API)
      if (direction === "outbound") {
        const { data, error } = await supabase.functions.invoke("evolution-send-message", {
          body: {
            conversationId,
            body,
            messageType,
            mediaUrl,
            caption,
            replyId,
            quotedBody,
            quotedSender
          },
        });

        if (error) {
          console.error("Erro na Edge Function evolution-send-message:", error);
          throw new Error(error.message || "Erro ao enviar mensagem via servidor.");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        return data;
      }

      // Mensagens inbound (simulação ou inserção manual)
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          body,
          direction,
          message_type: messageType,
          media_url: mediaUrl
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
