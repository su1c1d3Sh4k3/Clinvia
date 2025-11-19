import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const mockConversations = [
  {
    id: "1",
    name: "João Silva",
    avatar: "https://avatar.vercel.sh/joao",
    preview: "Olá, gostaria de saber sobre o produto...",
    time: "10:32",
    channel: "WhatsApp",
    unread: 2,
  },
  {
    id: "2",
    name: "Maria Santos",
    avatar: "https://avatar.vercel.sh/maria",
    preview: "Obrigada pelo atendimento!",
    time: "09:15",
    channel: "Instagram",
    unread: 0,
  },
  {
    id: "3",
    name: "Pedro Costa",
    avatar: "https://avatar.vercel.sh/pedro",
    preview: "Quando chega meu pedido?",
    time: "Ontem",
    channel: "WhatsApp",
    unread: 1,
  },
  {
    id: "4",
    name: "Ana Lima",
    avatar: "https://avatar.vercel.sh/ana",
    preview: "Perfeito! Vou aguardar então.",
    time: "Ontem",
    channel: "WhatsApp",
    unread: 0,
  },
];

export const ConversationsList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState("1");

  return (
    <div className="w-[300px] h-screen border-r border-border flex flex-col bg-background">
      <div className="p-4 border-b border-border space-y-4">
        <h2 className="text-xl font-semibold">Inbox</h2>
        
        <Tabs defaultValue="meus" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="meus">Meus</TabsTrigger>
            <TabsTrigger value="nao-atribuidos">Não Atribuídos</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contatos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {mockConversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setSelectedId(conversation.id)}
              className={cn(
                "w-full p-3 rounded-lg hover:bg-muted/50 transition-colors text-left",
                selectedId === conversation.id && "bg-muted"
              )}
            >
              <div className="flex gap-3">
                <Avatar className="w-12 h-12 flex-shrink-0">
                  <AvatarImage src={conversation.avatar} />
                  <AvatarFallback>{conversation.name[0]}</AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{conversation.name}</span>
                    <span className="text-xs text-muted-foreground">{conversation.time}</span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground truncate mb-2">
                    {conversation.preview}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      {conversation.channel}
                    </Badge>
                    
                    {conversation.unread > 0 && (
                      <Badge className="bg-primary text-primary-foreground">
                        {conversation.unread}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
