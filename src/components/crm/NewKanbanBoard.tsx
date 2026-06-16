import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CrmClient, CRM_STAGES, STAGE_COLORS, TERMINAL_STAGES, CrmStage } from "@/types/crm-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, GripVertical, MessageSquare, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DealConversationModal } from "./DealConversationModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

const PRIORITY_BORDER: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#ef4444",
};

interface NewKanbanBoardProps {
  onCardClick?: (client: CrmClient) => void;
}

export const NewKanbanBoard = ({ onCardClick }: NewKanbanBoardProps) => {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["crm-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client" as any)
        .select("*, contact:contacts(id, push_name, phone, number, profile_pic_url)")
        .order("stage_changed_at", { ascending: false });
      if (error) throw error;
      return data as CrmClient[];
    },
  });

  // Fetch services for all active deals (to show service names on cards)
  const { data: allServices } = useQuery({
    queryKey: ["crm-client-services-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client_services" as any)
        .select("crm_client_id, service_client_id, service_name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch service_name (level 2) for deduplication by service type
  const { data: serviceClientsForNames } = useQuery({
    queryKey: ["services-client-names-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services_client" as any)
        .select("id, service_name_id, service_name:service_name!inner(name)");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch contacts with waiting appointments
  const { data: waitingContacts } = useQuery({
    queryKey: ["waiting-appointment-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("contact_id")
        .eq("status", "waiting")
        .not("contact_id", "is", null);
      if (error) throw error;
      return new Set((data || []).map((a: any) => a.contact_id));
    },
    refetchInterval: 60000, // refresh every minute
  });

  // Build a map: crm_client_id → unique service names (level 2, deduplicated)
  const cardServiceNames = (() => {
    const map: Record<string, string[]> = {};
    if (!allServices) return map;
    const scMap: Record<string, string> = {};
    if (serviceClientsForNames) {
      for (const sc of serviceClientsForNames) {
        scMap[sc.id] = (sc as any).service_name?.name || "";
      }
    }
    for (const svc of allServices) {
      if (!map[svc.crm_client_id]) map[svc.crm_client_id] = [];
      // Use service_name (level 2) if available, fallback to service_name field
      const displayName = (svc.service_client_id && scMap[svc.service_client_id]) || svc.service_name;
      if (displayName && !map[svc.crm_client_id].includes(displayName)) {
        map[svc.crm_client_id].push(displayName);
      }
    }
    return map;
  })();

  const moveStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: CrmStage }) => {
      const { error } = await supabase
        .from("crm_client" as any)
        .update({
          stage,
          is_active: !TERMINAL_STAGES.includes(stage),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
    },
    onError: () => toast.error("Erro ao mover card"),
  });

  const handleDragStart = (e: React.DragEvent, clientId: string, currentStage: CrmStage) => {
    if (TERMINAL_STAGES.includes(currentStage)) {
      e.preventDefault();
      return;
    }
    setDragging(clientId);
    e.dataTransfer.setData("clientId", clientId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e: React.DragEvent, targetStage: CrmStage) => {
    e.preventDefault();
    const clientId = e.dataTransfer.getData("clientId");
    if (!clientId) return;
    setDragging(null);

    const client = clients?.find((c) => c.id === clientId);
    if (!client || client.stage === targetStage) return;

    moveStage.mutate({ id: clientId, stage: targetStage });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group by stage
  const grouped = CRM_STAGES.reduce<Record<string, CrmClient[]>>((acc, stage) => {
    acc[stage] = (clients || []).filter((c) => c.stage === stage);
    return acc;
  }, {} as Record<string, CrmClient[]>);

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden crm-scrollbar">
      <div className="flex gap-3 h-full min-w-max pb-4 px-1">
        {CRM_STAGES.map((stage) => {
          const cards = grouped[stage] || [];
          const isTerminal = TERMINAL_STAGES.includes(stage);
          const stageTotal = cards.reduce((sum, c) => sum + (c.value || 0), 0);

          return (
            <div
              key={stage}
              className="w-[240px] flex flex-col bg-muted/30 dark:bg-[#1a1d24] rounded-lg border shrink-0"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
            >
              {/* Column header */}
              <div className="px-3 py-2.5 border-b flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: STAGE_COLORS[stage] }}
                  />
                  <span className="text-xs font-medium truncate">{stage}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {cards.length}
                  </Badge>
                  {stageTotal > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {fmt(stageTotal)}
                    </span>
                  )}
                </div>
              </div>

              {/* Cards */}
              <ScrollArea className="flex-1 px-2 py-2">
                <div className="space-y-2">
                  {cards.map((client) => {
                    const borderColor = client.priority ? PRIORITY_BORDER[client.priority] : "transparent";
                    const services = cardServiceNames[client.id] || [];
                    const hasWaiting = waitingContacts?.has(client.contact_id);
                    return (
                      <div
                        key={client.id}
                        draggable={!isTerminal}
                        onDragStart={(e) => handleDragStart(e, client.id, stage)}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => onCardClick?.(client)}
                        className={cn(
                          "rounded-md border bg-card cursor-pointer transition-all hover:shadow-md border-l-4 overflow-hidden",
                          isTerminal && "opacity-60 cursor-default",
                          dragging === client.id && "opacity-40"
                        )}
                        style={{ borderLeftColor: borderColor }}
                      >
                        <div className="p-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            {!isTerminal && (
                              <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
                            )}
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarImage src={client.contact?.profile_pic_url || undefined} />
                              <AvatarFallback className="text-[10px]">
                                {(client.contact?.push_name || "?")[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium truncate flex-1">
                              {client.contact?.push_name || "Sem nome"}
                            </span>
                            {/* Alert icon for waiting appointments */}
                            {hasWaiting && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Aguardando conclusão do agendamento</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {/* Chat button */}
                            {client.contact_id && (
                              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                <DealConversationModal
                                  contactId={client.contact_id}
                                  contactName={client.contact?.push_name || "Cliente"}
                                  trigger={
                                    <button className="p-1 rounded hover:bg-accent transition-colors" title="Abrir chat">
                                      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                  }
                                />
                              </div>
                            )}
                          </div>
                          {/* Services in negotiation */}
                          {services.length > 0 && (
                            <div className="ml-5 mb-1 flex flex-wrap gap-1">
                              {services.map((sn) => (
                                <span key={sn} className="text-[9px] bg-muted px-1.5 py-0.5 rounded-sm text-muted-foreground truncate max-w-[120px]">
                                  {sn}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between ml-5">
                            {client.value > 0 ? (
                              <span className="text-[11px] font-semibold text-primary">
                                {fmt(client.value)}
                              </span>
                            ) : (
                              <span />
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(client.stage_changed_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {cards.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-4">
                      Vazio
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
};
