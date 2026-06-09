import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CrmClient, CRM_STAGES, STAGE_COLORS, TERMINAL_STAGES, CrmStage } from "@/types/crm-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

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
                  {cards.map((client) => (
                    <div
                      key={client.id}
                      draggable={!isTerminal}
                      onDragStart={(e) => handleDragStart(e, client.id, stage)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => onCardClick?.(client)}
                      className={cn(
                        "p-2.5 rounded-md border bg-card cursor-pointer transition-all hover:shadow-md",
                        isTerminal && "opacity-60 cursor-default",
                        dragging === client.id && "opacity-40"
                      )}
                    >
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
                        <span className="text-xs font-medium truncate">
                          {client.contact?.push_name || "Sem nome"}
                        </span>
                      </div>
                      {client.value > 0 && (
                        <p className="text-[11px] font-semibold text-primary ml-5">
                          {fmt(client.value)}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground ml-5">
                        {formatDistanceToNow(new Date(client.stage_changed_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  ))}
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
