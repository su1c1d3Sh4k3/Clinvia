import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations } from "@/hooks/useConversations";
import { useAuth } from "@/hooks/useAuth";

export const ConversationsList = ({ onSelectConversation, selectedId }: { 
  onSelectConversation: (id: string) => void;
  selectedId?: string;
}) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"meus" | "nao-atribuidos" | "todos">("meus");
  
  const { conversations, isLoading } = useConversations(tab, user?.id);

  const filteredConversations = conversations.filter((conv) =>
    conv.contacts.push_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.contacts.remote_jid.includes(searchQuery)
  );

  return (
    <div className="w-[300px] h-screen border-r border-border flex flex-col bg-background">
      <div className="p-4 border-b border-border space-y-4">
        <h2 className="text-xl font-semibold">Inbox</h2>
        
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
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
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">Carregando...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">Nenhuma conversa encontrada</div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation) => {
              const contact = conversation.contacts;
              const displayName = contact.push_name || contact.remote_jid.split("@")[0];
              
              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation.id)}
                  className={cn(
                    "w-full p-3 rounded-lg hover:bg-muted/50 transition-colors text-left",
                    selectedId === conversation.id && "bg-muted"
                  )}
                >
                  <div className="flex gap-3">
                    <Avatar className="w-12 h-12 flex-shrink-0">
                      <AvatarImage src={contact.profile_pic_url || undefined} />
                      <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex-1">
                          <span className="font-medium text-sm">{displayName}</span>
                          <p className="text-xs text-muted-foreground">
                            #{conversation.id.substring(0, 8).toUpperCase()}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(conversation.updated_at || "").toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          WhatsApp
                        </Badge>
                        
                        {conversation.unread_count > 0 && (
                          <Badge className="bg-primary text-primary-foreground">
                            {conversation.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
