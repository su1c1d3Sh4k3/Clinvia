import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Smile, Mic, Sparkles, CheckCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useMessages } from "@/hooks/useMessages";
import { useSendMessage } from "@/hooks/useSendMessage";
import { useResolveConversation } from "@/hooks/useResolveConversation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ChatArea = ({ conversationId }: { conversationId?: string }) => {
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { messages, isLoading } = useMessages(conversationId);
  const sendMessageMutation = useSendMessage();
  const resolveConversation = useResolveConversation();

  const { data: conversation } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(*)")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
  });

  const contact = conversation?.contacts;
  const displayName = contact?.push_name || contact?.remote_jid?.split("@")[0] || "Cliente";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleMagicAI = async () => {
    if (!conversationId) return;
    
    try {
      const { data } = await supabase.functions.invoke("ai-suggest-response", {
        body: { conversationId },
      });
      
      if (data?.suggestion) {
        setMessage(data.suggestion);
      }
    } catch (error) {
      console.error("Error getting AI suggestion:", error);
    }
  };

  const handleSend = () => {
    if (!message.trim() || !conversationId) return;

    sendMessageMutation.mutate({
      conversationId,
      body: message,
      direction: "outbound",
    });

    setMessage("");
  };

  const handleResolve = () => {
    if (conversationId) {
      resolveConversation.mutate(conversationId);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex-1 h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Selecione uma conversa para começar</p>
      </div>
    );
  }

  return (
    <div className="flex-1 h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={contact?.profile_pic_url || undefined} />
            <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold">{displayName}</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                WhatsApp
              </Badge>
            </div>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleResolve}
          disabled={resolveConversation.isPending || conversation?.status === "resolved"}
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          {conversation?.status === "resolved" ? "Resolvido" : "Resolver Ticket"}
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Carregando mensagens...</div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2",
                  msg.direction === "outbound" ? "justify-end" : "justify-start"
                )}
              >
                {msg.direction === "inbound" && (
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={contact?.profile_pic_url || undefined} />
                    <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                )}
                
                <div
                  className={cn(
                    "max-w-[70%] rounded-lg p-3",
                    msg.direction === "outbound"
                      ? "bg-[hsl(var(--chat-agent))] text-white"
                      : "bg-[hsl(var(--chat-customer))] text-foreground"
                  )}
                >
                  <p className="text-sm">{msg.body}</p>
                  <span className={cn(
                    "text-xs mt-1 block",
                    msg.direction === "outbound" ? "text-white/70" : "text-muted-foreground"
                  )}>
                    {new Date(msg.created_at || "").toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                
                {msg.direction === "outbound" && (
                  <Avatar className="w-8 h-8">
                    <AvatarImage src="https://avatar.vercel.sh/agent" />
                    <AvatarFallback>AG</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2 items-center">
          <Button variant="ghost" size="icon">
            <Paperclip className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Smile className="w-5 h-5" />
          </Button>
          
          <Input
            placeholder="Digite sua mensagem..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            className="flex-1"
          />
          
          <Button variant="ghost" size="icon">
            <Mic className="w-5 h-5" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleMagicAI}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 hover:opacity-90"
          >
            <Sparkles className="w-5 h-5" />
          </Button>
          
          <Button 
            onClick={handleSend}
            disabled={!message.trim() || sendMessageMutation.isPending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
