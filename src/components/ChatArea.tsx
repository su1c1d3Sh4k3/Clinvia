import { useState } from "react";
import { Send, Paperclip, Smile, Mic, Sparkles, CheckCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const mockMessages = [
  {
    id: "1",
    body: "Olá! Gostaria de saber mais sobre o produto X.",
    direction: "inbound",
    created_at: "10:30",
  },
  {
    id: "2",
    body: "Olá João! Claro, o produto X é ideal para...",
    direction: "outbound",
    created_at: "10:31",
  },
  {
    id: "3",
    body: "Qual o prazo de entrega?",
    direction: "inbound",
    created_at: "10:32",
  },
  {
    id: "4",
    body: "O prazo de entrega é de 5-7 dias úteis para sua região.",
    direction: "outbound",
    created_at: "10:33",
  },
];

export const ChatArea = () => {
  const [message, setMessage] = useState("");

  const handleMagicAI = () => {
    setMessage("Entendo sua necessidade. Vou verificar essas informações e retorno em breve com todos os detalhes.");
  };

  return (
    <div className="flex-1 h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src="https://avatar.vercel.sh/joao" />
            <AvatarFallback>JS</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold">João Silva</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                Online
              </Badge>
            </div>
          </div>
        </div>
        
        <Button variant="outline" size="sm">
          <CheckCircle className="w-4 h-4 mr-2" />
          Resolver Ticket
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-4xl mx-auto">
          {mockMessages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2",
                msg.direction === "outbound" ? "justify-end" : "justify-start"
              )}
            >
              {msg.direction === "inbound" && (
                <Avatar className="w-8 h-8">
                  <AvatarImage src="https://avatar.vercel.sh/joao" />
                  <AvatarFallback>JS</AvatarFallback>
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
                  {msg.created_at}
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
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
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
            className="flex-1"
          />
          
          <Button variant="ghost" size="icon">
            <Mic className="w-5 h-5" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleMagicAI}
            className="border-primary/50 hover:bg-primary/10"
          >
            <Sparkles className="w-5 h-5 text-primary" />
          </Button>
          
          <Button size="icon">
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
