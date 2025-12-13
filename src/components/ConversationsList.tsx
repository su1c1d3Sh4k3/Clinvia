import { useState } from "react";
import { Search, Filter, Plus, MessageSquare, Send, Tag as TagIcon, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations } from "@/hooks/useConversations";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentTeamMember, useStaff } from "@/hooks/useStaff";
import { useUserRole } from "@/hooks/useUserRole";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NewMessageModal } from "@/components/NewMessageModal";
import { TagAssignment } from "@/components/TagAssignment";
import { ContactDetailsDialog } from "@/components/ContactDetailsDialog";
import { ContactModal } from "@/components/ContactModal";
import { useFollowUpNotifications } from "@/hooks/useFollowUp";

// Helper to mark follow up as seen on click (instant)
const markFollowUpAsSeenOnClick = async (conversationId: string, queryClient: any) => {
  try {
    console.log("[FollowUp] Marking as seen for conversation:", conversationId);

    // 1. Get conversation follow up
    const { data: followUp, error: followUpError } = await supabase
      .from("conversation_follow_ups" as any)
      .select(`
        id,
        conversation_id, 
        category_id,
        last_seen_template_id,
        category:follow_up_categories(
          templates:follow_up_templates(id, time_minutes)
        )
      `)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    console.log("[FollowUp] Follow up data:", followUp, "Error:", followUpError);
    if (!followUp) return;

    // 2. Get last inbound message
    const { data: lastMessage } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("[FollowUp] Last message:", lastMessage);
    if (!lastMessage) return;

    const lastClientMessageAt = new Date(lastMessage.created_at);
    const templates = (followUp as any).category?.templates || [];
    console.log("[FollowUp] Templates:", templates);

    // Sort by time descending to find the LATEST unlocked template
    const sortedTemplates = [...templates].sort((a: any, b: any) => b.time_minutes - a.time_minutes);

    // 3. Find the LAST (highest time) unlocked template
    let latestUnlockedTemplate: any = null;
    for (const template of sortedTemplates) {
      const unlockTime = new Date(lastClientMessageAt.getTime() + template.time_minutes * 60 * 1000);
      console.log("[FollowUp] Template:", template.id, "time:", template.time_minutes, "unlockTime:", unlockTime, "now:", new Date(), "unlocked:", new Date() >= unlockTime);

      if (new Date() >= unlockTime) {
        latestUnlockedTemplate = template;
        break; // First one in descending order = highest time that's unlocked
      }
    }

    if (latestUnlockedTemplate && followUp.last_seen_template_id !== latestUnlockedTemplate.id) {
      console.log("[FollowUp] Updating last_seen_template_id to:", latestUnlockedTemplate.id);

      const { error: updateError } = await supabase
        .from("conversation_follow_ups" as any)
        .update({ last_seen_template_id: latestUnlockedTemplate.id })
        .eq("conversation_id", conversationId);

      console.log("[FollowUp] Update result error:", updateError);

      // Invalidate queries to update UI
      queryClient.invalidateQueries({ queryKey: ["follow-up-notifications"] });
    } else {
      console.log("[FollowUp] No update needed. latestUnlocked:", latestUnlockedTemplate?.id, "lastSeen:", followUp.last_seen_template_id);
    }
  } catch (err) {
    console.error("[FollowUp] Error marking follow up as seen:", err);
  }
};

export const ConversationsList = ({
  onSelectConversation,
  selectedId,
  searchTerm,
  setSearchTerm,
  currentMatchIndex,
  setCurrentMatchIndex,
  totalMatches,
  onOpenNewMessage
}: {
  onSelectConversation: (id: string) => void;
  selectedId?: string;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
  currentMatchIndex?: number;
  setCurrentMatchIndex?: (index: number) => void;
  totalMatches?: number;
  onOpenNewMessage?: (phone?: string) => void;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: userRole } = useUserRole();
  const { data: currentTeamMember } = useCurrentTeamMember();
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"open" | "pending" | "resolved">("open");
  const [selectedQueueFilter, setSelectedQueueFilter] = useState<string | null>(null);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [selectedInstanceFilter, setSelectedInstanceFilter] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isContactDetailsOpen, setIsContactDetailsOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedContactForDetails, setSelectedContactForDetails] = useState<any>(null);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"people" | "groups">("people");

  // Passar role e teamMemberId para filtrar por agente
  const { conversations, isLoading } = useConversations({
    tab: selectedTypeFilter === "groups" ? "all" : tab,
    userId: user?.id,
    role: userRole,
    teamMemberId: currentTeamMember?.id
  });

  // Buscar lista de membros da equipe para exibir nome do atendente atribuído
  const { data: staffMembers } = useStaff();

  // Get conversations with unlocked follow ups (time-based notification)
  const { data: followUpNotifications } = useFollowUpNotifications();

  // Fetch queues for filter
  const { data: queues } = useQuery({
    queryKey: ["queues-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("queues" as any)
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  // Fetch tags for filter
  const { data: tags } = useQuery({
    queryKey: ["tags-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags" as any)
        .select("id, name, color")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch instances for filter
  const { data: instances } = useQuery({
    queryKey: ["instances-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });



  const unreadCounts = useUnreadCounts(user?.id);

  const filteredConversations = conversations.filter((conv) => {
    const contact = conv.contacts;
    const group = (conv as any).groups;
    const isGroup = !!(conv as any).group_id;

    // Get display name safely
    let displayName = "";
    if (isGroup && group) {
      displayName = group.group_name || "Grupo sem Nome";
    } else if (contact) {
      displayName = contact.push_name || contact.phone || contact.number || "";
    }

    const matchesSearch =
      displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (contact?.number?.includes(searchQuery)) ||
      (contact?.phone?.includes(searchQuery)) ||
      (group?.remote_jid?.includes(searchQuery)) ||
      (conv as any).ticket_id?.toString().includes(searchQuery) ||
      conv.id.includes(searchQuery);

    const matchesQueue = selectedQueueFilter
      ? (conv as any).queue_id === selectedQueueFilter
      : true;

    const matchesTag = selectedTagFilter
      ? contact?.contact_tags?.some((ct: any) => ct.tags.id === selectedTagFilter)
      : true;

    const matchesInstance = selectedInstanceFilter
      ? (conv as any).instance_id === selectedInstanceFilter
      : true;

    // Filter by People vs Groups
    const matchesType = selectedTypeFilter === "groups" ? isGroup : !isGroup;

    return matchesSearch && matchesQueue && matchesTag && matchesInstance && matchesType;
  });

  const selectedConversation = conversations.find(c => c.id === selectedId);

  const handleNextMatch = () => {
    if (setCurrentMatchIndex && totalMatches && totalMatches > 0) {
      setCurrentMatchIndex((currentMatchIndex || 0) + 1 >= totalMatches ? 0 : (currentMatchIndex || 0) + 1);
    }
  };

  const handlePrevMatch = () => {
    if (setCurrentMatchIndex && totalMatches && totalMatches > 0) {
      setCurrentMatchIndex((currentMatchIndex || 0) - 1 < 0 ? totalMatches - 1 : (currentMatchIndex || 0) - 1);
    }
  };

  return (
    <div className="w-[300px] h-screen border-r border-border flex flex-col bg-background">
      <div className="p-4 border-b border-border space-y-4">
        <h2 className="text-xl font-semibold">Inbox</h2>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {selectedTypeFilter !== "groups" && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="flex-1" title="Filtros Avançados">
                    <Filter className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 p-2 space-y-2">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground ml-2">Filas</span>
                    <select
                      className="w-full text-sm border rounded p-1 bg-background"
                      value={selectedQueueFilter || ""}
                      onChange={(e) => setSelectedQueueFilter(e.target.value || null)}
                    >
                      <option value="">Todas as Filas</option>
                      {queues?.map((q: any) => (
                        <option key={q.id} value={q.id}>{q.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground ml-2">Tags</span>
                    <select
                      className="w-full text-sm border rounded p-1 bg-background"
                      value={selectedTagFilter || ""}
                      onChange={(e) => setSelectedTagFilter(e.target.value || null)}
                    >
                      <option value="">Todas as Tags</option>
                      {tags?.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground ml-2">Instâncias</span>
                    <select
                      className="w-full text-sm border rounded p-1 bg-background"
                      value={selectedInstanceFilter || ""}
                      onChange={(e) => setSelectedInstanceFilter(e.target.value || null)}
                    >
                      <option value="">Todas as Instâncias</option>
                      {instances?.map((i: any) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>

                  {(selectedQueueFilter || selectedTagFilter || selectedInstanceFilter) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs h-7"
                      onClick={() => {
                        setSelectedQueueFilter(null);
                        setSelectedTagFilter(null);
                        setSelectedInstanceFilter(null);
                      }}
                    >
                      Limpar Filtros
                    </Button>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <TagAssignment contactId={selectedConversation?.contacts?.id} />

              <Button
                variant="outline"
                size="icon"
                className="flex-1"
                onClick={() => onOpenNewMessage?.()}
                title="Nova Mensagem"
              >
                <Send className="h-4 w-4 text-black dark:text-white" />
              </Button>
            </>
          )}

          <Button
            variant={isSearchOpen ? "secondary" : "outline"}
            size="icon"
            className="flex-1"
            title="Buscar Mensagem"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
          >
            <Search className="h-4 w-4 text-black dark:text-white" />
          </Button>
        </div>

        <Tabs defaultValue="people" className="w-full" onValueChange={(v) => {
          // Reset status tab when switching between people/groups if needed, or keep it independent.
          // For now, we will keep the status tab independent but visually separated.
        }}>
          <TabsList className="grid w-full grid-cols-2 mb-2">
            <TabsTrigger value="people" onClick={() => setSelectedTypeFilter("people")} className="relative">
              Pessoas
              {unreadCounts.people > 0 && (
                <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px]">
                  {unreadCounts.people}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="groups" onClick={() => setSelectedTypeFilter("groups")} className="relative">
              Grupos
              {unreadCounts.groups > 0 && (
                <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px]">
                  {unreadCounts.groups}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Hide Status Tabs for Groups */}
        {selectedTypeFilter !== "groups" && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="open" className="flex flex-col items-center gap-1 py-2 h-auto relative data-[state=active]:text-primary">
                <div className="relative">
                  <MessageSquare className="h-5 w-5" />
                  {(unreadCounts as any).open > 0 && (
                    <Badge className="absolute -top-2 -right-3 h-5 min-w-[1.25rem] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] border-2 border-background">
                      {(unreadCounts as any).open}
                    </Badge>
                  )}
                </div>
                <span className="text-xs font-medium">Abertos</span>
              </TabsTrigger>

              <TabsTrigger value="pending" className="flex flex-col items-center gap-1 py-2 h-auto relative data-[state=active]:text-primary">
                <div className="relative">
                  <div className="relative">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-clock"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  {(unreadCounts as any).pending > 0 && (
                    <Badge className="absolute -top-2 -right-3 h-5 min-w-[1.25rem] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] border-2 border-background">
                      {(unreadCounts as any).pending}
                    </Badge>
                  )}
                </div>
                <span className="text-xs font-medium">Pendentes</span>
              </TabsTrigger>

              <TabsTrigger value="resolved" className="flex flex-col items-center gap-1 py-2 h-auto data-[state=active]:text-primary">
                <div className="relative">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-check-circle-2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <span className="text-xs font-medium">Resolvidos</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Message Search Bar */}
        {isSearchOpen && setSearchTerm && (
          <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md animate-in fade-in slide-in-from-top-2">
            <Input
              placeholder="Buscar na conversa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handlePrevMatch}
                disabled={!totalMatches}
              >
                <span className="sr-only">Anterior</span>
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleNextMatch}
                disabled={!totalMatches}
              >
                <span className="sr-only">Próximo</span>
                ↓
              </Button>
            </div>
            {totalMatches !== undefined && totalMatches > 0 && (
              <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[3rem] text-center">
                {(currentMatchIndex || 0) + 1} de {totalMatches}
              </span>
            )}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-black dark:text-white" />
          <Input
            placeholder="Buscar contatos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 border-secondary"
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
              const group = (conversation as any).groups;
              const isGroup = !!(conversation as any).group_id;

              // Display Name Logic
              let displayName = "Desconhecido";
              let profilePic = null;

              if (isGroup && group) {
                displayName = group.group_name || "Grupo sem Nome";
                profilePic = group.group_pic_url;
              } else if (contact) {
                displayName = (contact.push_name && contact.push_name !== "Unknown")
                  ? contact.push_name
                  : (contact.phone || contact.number?.split("@")[0]);
                profilePic = contact.profile_pic_url;
              }

              const queueName = (conversation as any).queues?.name;
              const instanceId = (conversation as any).instance_id;
              const instanceName = instances?.find((i: any) => String(i.id) === String(instanceId))?.name;

              if (!instanceName && instanceId) {
                console.log("Instance lookup failed:", { instanceId, instances });
              }

              return (
                <button
                  key={conversation.id}
                  onClick={() => {
                    markFollowUpAsSeenOnClick(conversation.id, queryClient);
                    onSelectConversation(conversation.id);
                  }}
                  className={cn(
                    "block w-full max-w-[260px] mx-auto overflow-hidden p-4 rounded-2xl border border-border/50 bg-card text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group relative",
                    selectedId === conversation.id
                      ? "ring-2 ring-primary shadow-md z-10"
                      : "hover:border-primary/20"
                  )}
                >
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <Avatar className="w-12 h-12 flex-shrink-0 border-2 border-white shadow-sm">
                        <AvatarImage src={profilePic || undefined} />
                        <AvatarFallback className="bg-secondary/10 text-secondary font-bold">
                          {displayName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {/* Follow Up Badge - Below Avatar (shows only when template time is reached) */}
                      {followUpNotifications?.has(conversation.id) && (
                        <Badge className="bg-green-500 text-white text-[8px] px-1 py-0 animate-pulse">
                          Follow Up
                        </Badge>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-semibold truncate text-foreground/90 flex-1 min-w-0 mr-2" title={displayName}>{displayName}</span>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap bg-muted/50 px-1.5 py-0.5 rounded-full">
                          {new Date(conversation.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <span className="font-medium text-primary/80">#{(conversation as any).ticket_id || conversation.id.substring(0, 5)}</span>
                        </div>
                        {/* Nome do atendente atribuído */}
                        {(conversation as any).assigned_agent_id && (() => {
                          const assignedAgent = staffMembers?.find(m => m.id === (conversation as any).assigned_agent_id);
                          return assignedAgent ? (
                            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium truncate max-w-[150px]" title={assignedAgent.name}>
                              👤 {assignedAgent.name}
                            </span>
                          ) : null;
                        })()}
                        {queueName && (
                          <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[150px]" title={queueName}>
                            {queueName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1.5">
                          {contact?.contact_tags?.map((ct: any) => (
                            ct.tags && (
                              <div key={ct.tags.id} title={ct.tags.name}>
                                <TagIcon
                                  className="w-3 h-3"
                                  style={{ color: ct.tags.color }}
                                />
                              </div>
                            )
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          {instanceName && (
                            <span className="text-[10px] text-secondary dark:text-slate-400 font-medium bg-secondary/10 px-1.5 py-0.5 rounded-full max-w-[80px] truncate" title={instanceName}>
                              {instanceName}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-secondary dark:text-slate-400 hover:text-primary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedContactForDetails(contact);
                              setIsContactDetailsOpen(true);
                            }}
                            title="Ver Detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {conversation.unread_count > 0 && (
                            <Badge className="bg-primary text-primary-foreground h-5 min-w-[1.25rem] px-1">
                              {conversation.unread_count}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>



      <ContactDetailsDialog
        open={isContactDetailsOpen}
        onOpenChange={setIsContactDetailsOpen}
        contact={selectedContactForDetails}
        onEdit={(contact) => {
          setEditingContact(contact);
          setIsContactModalOpen(true);
        }}
      />

      <ContactModal
        open={isContactModalOpen}
        onOpenChange={setIsContactModalOpen}
        contactToEdit={editingContact}
      />
    </div >
  );
};
