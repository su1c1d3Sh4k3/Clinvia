import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Search, Filter, Plus, MessageSquare, Send, Tag as TagIcon, Eye, Check, CheckCheck, Clock, FileText, Mic, Image as ImageIcon, Video, StickyNote, MessageCircleReply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FaWhatsapp, FaInstagram } from "react-icons/fa";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations, CONVERSATIONS_PAGE_SIZE } from "@/hooks/useConversations";
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
import { ClientProfileModal } from "@/components/contacts/ClientProfileModal";
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
  // Filtros Avançados multi-seleção: vazio = todos; dentro da categoria é OR,
  // entre categorias é AND (user rule). Persistidos em localStorage (user rule:
  // filtro definido sobrevive a refresh E a sair da página).
  const ADV_FILTERS_STORAGE_KEY = "inbox.advancedFilters";
  const loadSavedFilters = () => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(ADV_FILTERS_STORAGE_KEY) || "{}") as {
        queues?: string[]; tags?: string[]; instances?: string[]; agents?: string[];
      };
    } catch {
      return {};
    }
  };
  const savedFiltersRef = useRef(loadSavedFilters());
  const [selectedQueueFilter, setSelectedQueueFilter] = useState<string[]>(savedFiltersRef.current.queues || []);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>(savedFiltersRef.current.tags || []);
  const [selectedInstanceFilter, setSelectedInstanceFilter] = useState<string[]>(savedFiltersRef.current.instances || []);
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string[]>(savedFiltersRef.current.agents || []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasAny =
      selectedQueueFilter.length || selectedTagFilter.length ||
      selectedInstanceFilter.length || selectedAgentFilter.length;
    if (hasAny) {
      localStorage.setItem(ADV_FILTERS_STORAGE_KEY, JSON.stringify({
        queues: selectedQueueFilter,
        tags: selectedTagFilter,
        instances: selectedInstanceFilter,
        agents: selectedAgentFilter,
      }));
    } else {
      localStorage.removeItem(ADV_FILTERS_STORAGE_KEY);
    }
  }, [selectedQueueFilter, selectedTagFilter, selectedInstanceFilter, selectedAgentFilter]);
  const toggleFilterValue = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isContactDetailsOpen, setIsContactDetailsOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedContactForDetails, setSelectedContactForDetails] = useState<any>(null);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"people" | "groups">("people");
  // Filtro "Não respondidas": só conversas cuja última mensagem é do cliente
  // (bolinha laranja ao lado do nome — resposta do colaborador pendente)
  const [unansweredOnly, setUnansweredOnly] = useState(false);

  // Aba do Inbox (WhatsApp/Instagram) persistida em sessionStorage:
  // - F5 / refresh mantém a aba (sessionStorage sobrevive ao reload)
  // - Navegar pra outra rota → cleanup limpa o storage → default WhatsApp ao voltar
  // - Fechar a aba do navegador → sessionStorage some sozinho → default WhatsApp
  const CHANNEL_FILTER_SESSION_KEY = "inbox.channelFilter";
  const [selectedChannelFilter, _setSelectedChannelFilter] = useState<"whatsapp" | "instagram">(() => {
    if (typeof window === "undefined") return "whatsapp";
    const saved = sessionStorage.getItem(CHANNEL_FILTER_SESSION_KEY);
    return saved === "instagram" ? "instagram" : "whatsapp";
  });
  const setSelectedChannelFilter = useCallback((value: "whatsapp" | "instagram") => {
    _setSelectedChannelFilter(value);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(CHANNEL_FILTER_SESSION_KEY, value);
    }
  }, []);
  // Cleanup ao desmontar o componente (SPA navigation pra outra rota).
  // Importante: NÃO roda em F5 — nesse caso o app inteiro descarta sem cleanup.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(CHANNEL_FILTER_SESSION_KEY);
      }
    };
  }, []);

  // Busca: o termo digitado só vai pro banco após 350ms de pausa (a busca é
  // global — varre TODAS as conversas do banco, não só as carregadas)
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Filtros avançados: vão para o BANCO (user rule) — antes eram aplicados só
  // sobre a página já carregada, então "filtrava de 100 em 100"
  const conversationFilters = useMemo(
    () => ({
      queueIds: selectedQueueFilter,
      tagIds: selectedTagFilter,
      instanceIds: selectedInstanceFilter,
      agentIds: selectedAgentFilter,
      unansweredOnly,
    }),
    [selectedQueueFilter, selectedTagFilter, selectedInstanceFilter, selectedAgentFilter, unansweredOnly]
  );

  // Scroll paginado: começa com 1 página; "Carregar mais" soma outra
  const [visibleCount, setVisibleCount] = useState(CONVERSATIONS_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(CONVERSATIONS_PAGE_SIZE);
  }, [tab, selectedChannelFilter, selectedTypeFilter, conversationFilters]);

  // Passar role e teamMemberId para filtrar por agente
  const { conversations, isLoading, isFetching, isSearching, hasFilters, total, hasMore } = useConversations({
    tab: selectedTypeFilter === "groups" ? "all" : tab,
    userId: user?.id,
    role: userRole,
    teamMemberId: currentTeamMember?.id,
    channel: selectedChannelFilter,
    groupScope: selectedTypeFilter === "groups" ? "only" : "exclude",
    search: debouncedSearch,
    limit: visibleCount,
    filters: conversationFilters,
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
        .select("id, name, provider")
        .order("name");
      if (error) throw error;
      return data;
    },
  });



  // Meta instance IDs for 24h window tracking
  const metaInstanceIds = useMemo(() => {
    if (!instances) return new Set<string>();
    return new Set(instances.filter((i: any) => i.provider === "meta").map((i: any) => i.id));
  }, [instances]);

  // Fetch last inbound message timestamps for Meta conversations
  // PERF: sort() estabiliza a queryKey — sem ele, cada reordenação da lista
  // (qualquer mensagem nova) mudava a key e refetchava a RPC da janela 24h
  const metaConvIds = useMemo(() => {
    return conversations
      .filter(c => metaInstanceIds.has((c as any).instance_id))
      .map(c => c.id)
      .sort();
  }, [conversations, metaInstanceIds]);

  const { data: lastInboundMap } = useQuery({
    queryKey: ["last-inbound-batch", metaConvIds.join(",")],
    queryFn: async () => {
      if (metaConvIds.length === 0) return {};
      const { data } = await supabase.rpc("get_last_inbound_timestamps" as any, {
        conv_ids: metaConvIds,
      });
      if (data) {
        const map: Record<string, string> = {};
        (data as any[]).forEach((r: any) => { map[r.conversation_id] = r.last_inbound_at; });
        return map;
      }
      // Fallback: query each conversation individually
      const map: Record<string, string> = {};
      for (const cid of metaConvIds.slice(0, 50)) {
        const { data: msg } = await supabase
          .from("messages")
          .select("created_at")
          .eq("conversation_id", cid)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (msg) map[cid] = msg.created_at;
      }
      return map;
    },
    enabled: metaConvIds.length > 0,
    refetchInterval: 60_000,
  });

  // Timer tick to force re-render every minute for 24h countdown
  const [, setTimerTick] = useState(0);
  useEffect(() => {
    if (metaConvIds.length === 0) return;
    const interval = setInterval(() => setTimerTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [metaConvIds.length]);

  const unreadRows = useUnreadCounts(user?.id);

  // Balões das abas: mesmos filtros avançados aplicados à lista (regra do
  // usuário: o balão sempre se adapta ao filtro — se os clientes filtrados
  // não têm não lidas, o balão some).
  const unreadCounts = useMemo(() => {
    const acc = { open: 0, pending: 0, groups: 0 };
    for (const r of unreadRows) {
      if ((r.channel || "whatsapp") !== selectedChannelFilter) continue;
      if (selectedQueueFilter.length > 0 && !selectedQueueFilter.includes(r.queue_id || "")) continue;
      if (selectedInstanceFilter.length > 0 && !selectedInstanceFilter.includes(r.instance_id || "")) continue;
      if (selectedAgentFilter.length > 0) {
        const matchesAgent =
          (selectedAgentFilter.includes("unassigned") && !r.assigned_agent_id) ||
          (!!r.assigned_agent_id && selectedAgentFilter.includes(r.assigned_agent_id));
        if (!matchesAgent) continue;
      }
      if (selectedTagFilter.length > 0 && !r.contacts?.contact_tags?.some((ct) => selectedTagFilter.includes(ct.tag_id))) continue;
      if (r.group_id) acc.groups += r.unread_count || 0;
      else if (r.status === "open") acc.open += r.unread_count || 0;
      else if (r.status === "pending") acc.pending += r.unread_count || 0;
    }
    return acc;
  }, [unreadRows, selectedChannelFilter, selectedQueueFilter, selectedInstanceFilter, selectedAgentFilter, selectedTagFilter]);

  // Fila, etiqueta, instância, responsável, "não respondidas" e Pessoas/Grupos
  // são resolvidos no banco (useConversations) — a lista aqui já vem filtrada.
  const filteredConversations = conversations;

  // A busca varre o banco inteiro, mas dentro da aba/filtro atual.
  const searchScopeLabel = selectedTypeFilter === "groups"
    ? "de grupos"
    : tab === "open" ? "abertos"
    : tab === "pending" ? "pendentes"
    : tab === "resolved" ? "resolvidos"
    : "";

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
    <div data-tour="inbox-list" className="w-full md:w-[360px] h-full border-r border-[#1E2229]/20 dark:border-border flex flex-col bg-white dark:bg-background overflow-hidden">
      <div className="p-3 border-b border-[#1E2229]/20 dark:border-border space-y-2">
        {/* Top bar: Channel toggle + Action buttons */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 flex-shrink-0">
            <Button
              variant={selectedChannelFilter === 'whatsapp' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setSelectedChannelFilter('whatsapp')}
              title="WhatsApp"
            >
              <FaWhatsapp className={`h-3.5 w-3.5 ${selectedChannelFilter === 'whatsapp' ? 'text-green-500' : 'text-muted-foreground'}`} />
            </Button>
            <Button
              variant={selectedChannelFilter === 'instagram' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setSelectedChannelFilter('instagram')}
              title="Instagram"
            >
              <FaInstagram className={`h-3.5 w-3.5 ${selectedChannelFilter === 'instagram' ? 'text-pink-500' : 'text-muted-foreground'}`} />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-tour="inbox-filtros" variant="outline" size="icon" className="h-7 w-full" title="Filtros Avançados">
                  <Filter className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 max-w-[90vw] max-h-[70vh] overflow-y-auto p-2 space-y-2">
                {(selectedQueueFilter.length > 0 || selectedTagFilter.length > 0 || selectedInstanceFilter.length > 0 || selectedAgentFilter.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs h-7"
                    onClick={() => {
                      setSelectedQueueFilter([]);
                      setSelectedTagFilter([]);
                      setSelectedInstanceFilter([]);
                      setSelectedAgentFilter([]);
                    }}
                  >
                    Limpar Filtros
                  </Button>
                )}

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground ml-2">
                    Filas{selectedQueueFilter.length > 0 && ` (${selectedQueueFilter.length})`}
                  </span>
                  <div className="max-h-32 overflow-y-auto border rounded p-1 space-y-0.5">
                    {queues?.map((q: any) => (
                      <label key={q.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          className="accent-primary shrink-0"
                          checked={selectedQueueFilter.includes(q.id)}
                          onChange={() => toggleFilterValue(setSelectedQueueFilter, q.id)}
                        />
                        <span className="truncate">{q.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground ml-2">
                    Tags{selectedTagFilter.length > 0 && ` (${selectedTagFilter.length})`}
                  </span>
                  <div className="max-h-32 overflow-y-auto border rounded p-1 space-y-0.5">
                    {tags?.map((t: any) => (
                      <label key={t.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          className="accent-primary shrink-0"
                          checked={selectedTagFilter.includes(t.id)}
                          onChange={() => toggleFilterValue(setSelectedTagFilter, t.id)}
                        />
                        <span className="truncate">{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground ml-2">
                    Instâncias{selectedInstanceFilter.length > 0 && ` (${selectedInstanceFilter.length})`}
                  </span>
                  <div className="max-h-32 overflow-y-auto border rounded p-1 space-y-0.5">
                    {instances?.map((i: any) => (
                      <label key={i.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          className="accent-primary shrink-0"
                          checked={selectedInstanceFilter.includes(i.id)}
                          onChange={() => toggleFilterValue(setSelectedInstanceFilter, i.id)}
                        />
                        <span className="truncate">{i.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground ml-2">
                    Usuários{selectedAgentFilter.length > 0 && ` (${selectedAgentFilter.length})`}
                  </span>
                  <div className="max-h-32 overflow-y-auto border rounded p-1 space-y-0.5">
                    <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        className="accent-primary shrink-0"
                        checked={selectedAgentFilter.includes("unassigned")}
                        onChange={() => toggleFilterValue(setSelectedAgentFilter, "unassigned")}
                      />
                      <span className="truncate">Sem atribuição</span>
                    </label>
                    {staffMembers?.map((m: any) => (
                      <label key={m.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          className="accent-primary shrink-0"
                          checked={selectedAgentFilter.includes(m.id)}
                          onChange={() => toggleFilterValue(setSelectedAgentFilter, m.id)}
                        />
                        <span className="truncate">{m.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

              </DropdownMenuContent>
            </DropdownMenu>

            <TagAssignment contactId={selectedConversation?.contacts?.id} triggerClassName="h-7 w-full" iconClassName="h-3.5 w-3.5" />

            <Button
              variant="outline"
              size="icon"
              className="h-7 w-full"
              onClick={() => onOpenNewMessage?.()}
              title="Nova Mensagem"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant={isSearchOpen ? "secondary" : "outline"}
              size="icon"
              className="h-7 w-full"
              title="Buscar Mensagem"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Status Tabs: Abertos, Pendentes, Resolvidos, Grupos */}
        <Tabs value={selectedTypeFilter === "groups" ? "groups" : tab} onValueChange={(v) => {
          if (v === "groups") {
            setSelectedTypeFilter("groups");
          } else {
            setSelectedTypeFilter("people");
            setTab(v as any);
          }
        }} className="w-full">
          <TabsList className={cn("grid w-full h-auto", selectedChannelFilter === "whatsapp" ? "grid-cols-4" : "grid-cols-3")}>
            <TabsTrigger value="open" className="flex flex-col items-center gap-0.5 py-1.5 h-auto relative data-[state=active]:text-primary">
              <MessageSquare className="h-4 w-4" />
              <span className="text-[10px] font-medium">Abertos</span>
              {unreadCounts.open > 0 && (
                <Badge className="absolute top-0.5 right-1 h-4 min-w-[1rem] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] border-[1.5px] border-background">
                  {unreadCounts.open}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="pending" className="flex flex-col items-center gap-0.5 py-1.5 h-auto relative data-[state=active]:text-primary">
              <Clock className="h-4 w-4" />
              <span className="text-[10px] font-medium">Pendentes</span>
              {unreadCounts.pending > 0 && (
                <Badge className="absolute top-0.5 right-1 h-4 min-w-[1rem] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] border-[1.5px] border-background">
                  {unreadCounts.pending}
                </Badge>
              )}
            </TabsTrigger>

            <TabsTrigger value="resolved" className="flex flex-col items-center gap-0.5 py-1.5 h-auto data-[state=active]:text-primary">
              <CheckCheck className="h-4 w-4" />
              <span className="text-[10px] font-medium">Resolvidos</span>
            </TabsTrigger>

            {selectedChannelFilter === "whatsapp" && (
              <TabsTrigger value="groups" className="flex flex-col items-center gap-0.5 py-1.5 h-auto relative data-[state=active]:text-primary">
                <MessageSquare className="h-4 w-4" />
                <span className="text-[10px] font-medium">Grupos</span>
                {unreadCounts.groups > 0 && (
                  <Badge className="absolute top-0.5 right-1 h-4 min-w-[1rem] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] border-[1.5px] border-background">
                    {unreadCounts.groups}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

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

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-black dark:text-white" />
            <Input
              placeholder="Buscar em todos os tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 border-secondary"
            />
          </div>
          <button
            onClick={() => setUnansweredOnly(!unansweredOnly)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1 rounded-md border transition-colors flex-shrink-0",
              unansweredOnly
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:bg-muted"
            )}
            title="Filtrar não respondidas (aguardando resposta do atendente)"
          >
            <MessageCircleReply className="h-4 w-4" />
            <span className="text-[9px] font-medium leading-none">Não respondidas</span>
          </button>
        </div>
      </div>

      {/* Barra de resultados: vale para busca E para filtro ativo. O número é o
          TOTAL do banco (count exato), não o tamanho da página carregada. */}
      {(isSearching || hasFilters) && (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/40 border-b border-border">
          {isFetching && filteredConversations.length === 0
            ? `${isSearching ? "Buscando" : "Filtrando"} em todos os tickets ${searchScopeLabel}...`
            : (() => {
                const n = total ?? filteredConversations.length;
                const carregadas = filteredConversations.length < n
                  ? ` · ${filteredConversations.length} na tela`
                  : "";
                return `${n} resultado${n === 1 ? "" : "s"} em todos os tickets ${searchScopeLabel}${carregadas}`;
              })()}
        </div>
      )}

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">Carregando...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {isSearching && isFetching ? "Buscando..." : "Nenhuma conversa encontrada"}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation, index) => {
              const contact = conversation.contacts;
              const group = (conversation as any).groups;
              const isGroup = !!(conversation as any).group_id;

              // Display Name Logic
              let displayName = "Desconhecido";
              let profilePic = null;

              if (isGroup && group) {
                displayName = group.group_name || "Grupo sem Nome";
                profilePic = group.group_pic_url || undefined;
              } else if (contact) {
                displayName = (contact.push_name && contact.push_name !== "Unknown")
                  ? contact.push_name
                  : (contact.phone || contact.number?.split("@")[0]);
                profilePic = contact.profile_pic_url || undefined;
              }

              const queueName = (conversation as any).queues?.name;
              const instanceId = (conversation as any).instance_id;
              const instanceName = instances?.find((i: any) => String(i.id) === String(instanceId))?.name;

              if (!instanceName && instanceId) {
                console.log("Instance lookup failed:", { instanceId, instances });
              }

              const lastMsg = (conversation as any).last_message_obj;
              const isOutbound = lastMsg?.direction === 'outbound';
              const isSystem = lastMsg?.direction === 'system';
              // Aguardando resposta: última mensagem é do cliente (mesma regra
              // da bolinha laranja e do filtro "Não respondidas")
              const isAwaitingReply = !!lastMsg && !isOutbound && !isSystem;
              // Instagram only: bolinha vermelha quando janela de 24h expirou
              const isInstagramWindowExpired =
                (conversation as any).channel === 'instagram' &&
                (conversation as any).instagram_window_expired === true;

              // 24h window timer for Meta instances
              const isMetaConv = metaInstanceIds.has((conversation as any).instance_id);
              const lastInboundAt = isMetaConv && lastInboundMap ? lastInboundMap[conversation.id] : null;
              let metaWindowMs = -1;
              let metaWindowColor = "";
              let metaWindowLabel = "";

              if (isMetaConv && lastInboundAt) {
                const lastTs = new Date(lastInboundAt).getTime();
                metaWindowMs = Math.max(0, lastTs + 24 * 60 * 60 * 1000 - Date.now());
                const hoursLeft = metaWindowMs / (1000 * 60 * 60);
                if (metaWindowMs === 0) {
                  metaWindowLabel = "Encerrada";
                  metaWindowColor = "text-muted-foreground";
                } else {
                  const h = Math.floor(hoursLeft);
                  const m = Math.floor((metaWindowMs / (1000 * 60)) % 60);
                  metaWindowLabel = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                  if (hoursLeft > 12) metaWindowColor = "text-emerald-600 dark:text-emerald-400";
                  else if (hoursLeft > 6) metaWindowColor = "text-amber-600 dark:text-amber-400";
                  else metaWindowColor = "text-red-600 dark:text-red-400";
                }
              }

              let timeDisplay = "";
              if (!isMetaConv && conversation.last_message_at) {
                try {
                  timeDisplay = formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true, locale: ptBR });
                  timeDisplay = timeDisplay.replace('aproximadamente ', '');
                } catch (e) {
                  timeDisplay = new Date(conversation.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
              }

              return (
                <button
                  key={conversation.id}
                  onClick={() => {
                    markFollowUpAsSeenOnClick(conversation.id, queryClient);
                    onSelectConversation(conversation.id);
                  }}
                  className={cn(
                    "block w-full max-w-[340px] mx-auto overflow-hidden p-2.5 rounded-xl border bg-white dark:bg-card text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group relative animate-stagger-in",
                    selectedId === conversation.id
                      ? "conversation-card-selected border-primary/40 z-10"
                      : "border-[#1E2229]/20 dark:border-border/50 hover:border-primary/20",
                    // Barra lateral laranja = aguardando resposta (mesmo esquema
                    // da urgência no card do CRM)
                    isAwaitingReply && "border-l-4 border-l-orange-500"
                  )}
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  {/* 3-column layout: Avatar | Content | Meta */}
                  <div className="flex gap-2.5 w-full">
                    {/* Left: Avatar */}
                    <Avatar className={cn(
                      "w-11 h-11 flex-shrink-0 border-2 shadow-sm transition-all duration-300 mt-0.5",
                      selectedId === conversation.id
                        ? "border-primary shadow-[0_0_8px_2px_rgba(0,177,242,0.4)]"
                        : "border-white dark:border-border"
                    )}>
                      <AvatarImage src={profilePic || undefined} />
                      <AvatarFallback className="bg-secondary/10 text-secondary font-bold text-sm">
                        {displayName[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    {/* Center: Name + Last Message + Agent */}
                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                      {/* Name + tags */}
                      <div className="flex items-center gap-1.5">
                        {/* text-xs (12px) + tags shrink-0: nome trunca antes p/ sempre
                            sobrar espaço de até 3 etiquetas (antes as tags eram
                            espremidas pelo nome longo e mal aparecia uma) */}
                        <span className="font-semibold text-xs truncate text-foreground/90" title={displayName}>
                          {displayName}
                        </span>
                        {lastMsg && !isSystem && (
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full flex-shrink-0",
                            isInstagramWindowExpired ? "bg-red-500"
                              : isOutbound ? "bg-green-500" : "bg-orange-500"
                          )} />
                        )}
                        {contact?.contact_tags?.length > 0 && (
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {contact.contact_tags.slice(0, 3).map((ct: any) => (
                              ct.tags && (
                                <TagIcon key={ct.tags.id} className="w-3 h-3 flex-shrink-0" style={{ color: ct.tags.color }} title={ct.tags.name} />
                              )
                            ))}
                          </div>
                        )}
                        {conversation.unread_count > 0 && (
                          <Badge className="bg-primary text-primary-foreground h-4 px-1 min-w-[1rem] text-[9px] leading-none ml-auto flex-shrink-0">
                            {conversation.unread_count}
                          </Badge>
                        )}
                      </div>

                      {/* Last message preview */}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {isOutbound && lastMsg?.status && (
                          <span className="flex-shrink-0">
                            {lastMsg.status === 'read' || lastMsg.status === 'played' ? <CheckCheck className="w-3 h-3 text-blue-500" /> :
                              lastMsg.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-gray-400" /> :
                                lastMsg.status === 'sent' ? <Check className="w-3 h-3 text-gray-400" /> :
                                  <Clock className="w-2.5 h-2.5 text-gray-400" />}
                          </span>
                        )}
                        <span className="truncate text-foreground/70">
                          {isOutbound ? "Você: " : ""}
                          {(() => {
                            const t = lastMsg?.message_type;
                            if (t === 'image') return <><ImageIcon className="w-3 h-3 mr-0.5 inline -mt-0.5 text-blue-500" />Imagem</>;
                            if (t === 'video') return <><Video className="w-3 h-3 mr-0.5 inline -mt-0.5 text-purple-500" />Vídeo</>;
                            if (t === 'audio' || t === 'ptt') return <><Mic className="w-3 h-3 mr-0.5 inline -mt-0.5 text-green-500" />Áudio</>;
                            if (t === 'document') return <><FileText className="w-3 h-3 mr-0.5 inline -mt-0.5 text-orange-500" />Documento</>;
                            if (t === 'sticker') return <><StickyNote className="w-3 h-3 mr-0.5 inline -mt-0.5 text-pink-500" />Figurinha</>;
                            if (t === 'reaction') return `Reagiu com ${lastMsg.body}`;
                            return lastMsg?.body || "Nenhuma mensagem";
                          })()}
                        </span>
                      </div>

                      {/* Agent */}
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {(conversation as any).assigned_agent_id && (() => {
                          const assignedAgent = staffMembers?.find(m => m.id === (conversation as any).assigned_agent_id);
                          return assignedAgent ? (
                            <span className="truncate" title={assignedAgent.name}>
                              👤 {assignedAgent.name.split(' ')[0]}
                            </span>
                          ) : null;
                        })()}
                        {(conversation as any).assigned_agent_id && queueName && <span className="text-border/60 mx-0.5">·</span>}
                        {queueName && <span className="truncate" title={queueName}>{queueName}</span>}
                      </div>
                    </div>

                    {/* Right: Time + Eye + Instance */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 pt-0.5">
                      {isMetaConv && lastInboundAt ? (
                        <span className={`text-[10px] whitespace-nowrap font-semibold tabular-nums ${metaWindowColor}`}>
                          {metaWindowMs === 0 ? "Encerrada" : metaWindowLabel}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap capitalize">
                          {timeDisplay}
                        </span>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 rounded-full text-muted-foreground hover:text-primary transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedContactForDetails(contact);
                          setIsContactDetailsOpen(true);
                        }}
                        title="Ver Detalhes"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>

                      {instanceName && (
                        <span className="text-[9px] text-secondary dark:text-primary font-medium max-w-[70px] truncate" title={instanceName}>
                          {instanceName}
                        </span>
                      )}

                      {followUpNotifications?.has(conversation.id) && (
                        <span className="flex items-center bg-green-500 text-white text-[8px] px-1 py-0.5 rounded-full">
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-bell-swing" style={{ transformOrigin: "top center" }}>
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {!isSearching && hasMore && (
              <Button
                variant="outline"
                className="w-full mt-2"
                disabled={isFetching}
                onClick={() => setVisibleCount((c) => c + CONVERSATIONS_PAGE_SIZE)}
              >
                {isFetching ? "Carregando..." : "Carregar mais"}
              </Button>
            )}
          </div>
        )}
      </ScrollArea>



      <ClientProfileModal
        open={isContactDetailsOpen}
        onOpenChange={setIsContactDetailsOpen}
        contact={selectedContactForDetails}
      />

      <ContactModal
        open={isContactModalOpen}
        onOpenChange={setIsContactModalOpen}
        contactToEdit={editingContact}
      />
    </div >
  );
};
