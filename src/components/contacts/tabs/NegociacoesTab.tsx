import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, ChevronDown, ChevronUp, Briefcase, Plus, Trash2, StickyNote,
  Paperclip, History, MessageSquare, Bot, UserRound, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { STAGE_COLORS, TERMINAL_STAGES, CrmStage } from "@/types/crm-client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { ServiceCategory, ServiceName } from "@/types/services";

interface NegociacoesTabProps {
  contactId: string;
}

export const NegociacoesTab = ({ contactId }: NegociacoesTabProps) => {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // All deals for this contact (active + history)
  const { data: deals, isLoading } = useQuery({
    queryKey: ["crm-client-all", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client" as any)
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Services for expanded deal
  const { data: dealServices } = useQuery({
    queryKey: ["crm-client-services", expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client_services" as any)
        .select("*")
        .eq("crm_client_id", expandedId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  // History for expanded deal
  const { data: dealHistory } = useQuery({
    queryKey: ["crm-client-history", expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client_history" as any)
        .select("*")
        .eq("crm_client_id", expandedId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Conversations history for expanded deal's contact
  const { data: conversations } = useQuery({
    queryKey: ["crm-conversations", contactId, expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, status, assigned_agent_id, queue_id, created_at, updated_at, summary")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
  });

  // Queue names
  const { data: queues } = useQuery({
    queryKey: ["queues-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("queues").select("id, name");
      if (error) throw error;
      return new Map((data || []).map((q: any) => [q.id, q.name]));
    },
  });

  // Team members names
  const { data: teamMap } = useQuery({
    queryKey: ["team-members-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members" as any).select("id, auth_user_id, name");
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((m: any) => {
        map.set(m.id, m.name);
        if (m.auth_user_id) map.set(m.auth_user_id, m.name);
      });
      return map;
    },
  });

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const addNote = async (dealId: string) => {
    if (!newNote.trim() || !ownerId) return;
    setSavingNote(true);
    try {
      await supabase.from("crm_client_history" as any).insert({
        crm_client_id: dealId, user_id: ownerId,
        event_type: "note_added", new_value: newNote.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["crm-client-history", dealId] });
      setNewNote("");
      toast.success("Nota adicionada");
    } catch { toast.error("Erro ao adicionar nota"); }
    finally { setSavingNote(false); }
  };

  const deleteService = async (serviceId: string) => {
    if (!confirm("Remover este serviço?")) return;
    await supabase.from("crm_client_services" as any).delete().eq("id", serviceId);
    queryClient.invalidateQueries({ queryKey: ["crm-client-services", expandedId] });
    toast.success("Serviço removido");
  };

  const updateServicePrice = async (serviceId: string, price: number, min: number, max: number) => {
    const clamped = Math.max(min, Math.min(max, price));
    await supabase.from("crm_client_services" as any).update({ unit_price: clamped }).eq("id", serviceId);
    queryClient.invalidateQueries({ queryKey: ["crm-client-services", expandedId] });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!deals || deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Briefcase className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma negociação registrada para este cliente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deals.map((deal: any) => {
        const isExpanded = expandedId === deal.id;
        const isTerminal = TERMINAL_STAGES.includes(deal.stage);
        const stageColor = STAGE_COLORS[deal.stage as CrmStage] || "#6b7280";

        return (
          <div key={deal.id} className="border rounded-lg overflow-hidden">
            {/* Header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : deal.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={isTerminal ? "secondary" : "default"} className="text-[10px]">
                      {deal.stage}
                    </Badge>
                    {deal.value > 0 && <span className="text-sm font-semibold">{fmt(deal.value)}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(deal.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    {!deal.is_active && " — Encerrada"}
                  </span>
                </div>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t px-4 py-4 space-y-5">
                {/* Services */}
                <div>
                  <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                    <Briefcase className="w-3.5 h-3.5" /> Serviços
                  </h4>
                  {(!dealServices || dealServices.length === 0) ? (
                    <p className="text-xs text-muted-foreground">Nenhum serviço vinculado.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {dealServices.map((svc: any) => (
                        <div key={svc.id} className="flex items-center gap-2 text-sm p-2 border rounded">
                          <span className="flex-1 truncate">{svc.service_name}</span>
                          <span className="text-xs text-muted-foreground">x{svc.quantity}</span>
                          {!isTerminal ? (
                            <Input
                              type="number" step="0.01" min={svc.min_price}
                              defaultValue={svc.unit_price}
                              onBlur={(e) => updateServicePrice(svc.id, parseFloat(e.target.value) || 0, svc.min_price, svc.unit_price)}
                              className="w-24 h-7 text-xs"
                            />
                          ) : (
                            <span className="text-xs font-medium">{fmt(svc.unit_price)}</span>
                          )}
                          {!isTerminal && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteService(svc.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                {!isTerminal && (
                  <div>
                    <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                      <StickyNote className="w-3.5 h-3.5" /> Adicionar Nota
                    </h4>
                    <div className="flex gap-2">
                      <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} className="text-xs" placeholder="Escreva uma nota..." />
                      <Button size="sm" onClick={() => addNote(deal.id)} disabled={savingNote || !newNote.trim()} className="shrink-0">
                        {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Stage History */}
                <div>
                  <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                    <History className="w-3.5 h-3.5" /> Histórico de Etapas
                  </h4>
                  {(!dealHistory || dealHistory.length === 0) ? (
                    <p className="text-xs text-muted-foreground">Nenhum registro.</p>
                  ) : (
                    <div className="space-y-1">
                      {dealHistory.map((h: any) => (
                        <div key={h.id} className="flex items-start gap-2 text-[11px] py-1 border-b last:border-0">
                          <span className="text-muted-foreground whitespace-nowrap shrink-0">
                            {format(new Date(h.created_at), "dd/MM HH:mm")}
                          </span>
                          {h.event_type === "stage_change" ? (
                            <span className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px] px-1">{h.old_value}</Badge>
                              <ArrowRight className="w-3 h-3" />
                              <Badge variant="outline" className="text-[9px] px-1">{h.new_value}</Badge>
                            </span>
                          ) : h.event_type === "note_added" ? (
                            <span><StickyNote className="w-3 h-3 inline mr-1" />{h.new_value}</span>
                          ) : (
                            <span>{h.event_type}: {h.new_value || h.old_value}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Attendance History */}
                <div>
                  <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                    <MessageSquare className="w-3.5 h-3.5" /> Histórico de Atendimento
                  </h4>
                  {(!conversations || conversations.length === 0) ? (
                    <p className="text-xs text-muted-foreground">Nenhum atendimento registrado.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {conversations.map((conv: any) => {
                        const queueName = queues?.get(conv.queue_id) || "—";
                        const agentName = teamMap?.get(conv.assigned_agent_id) || null;
                        const isAI = queueName.toLowerCase().includes("ia");

                        return (
                          <div key={conv.id} className="flex items-start gap-2 text-[11px] p-2 border rounded">
                            <div className="shrink-0 mt-0.5">
                              {isAI ? <Bot className="w-3.5 h-3.5 text-purple-500" /> : <UserRound className="w-3.5 h-3.5 text-blue-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Badge variant={conv.status === "open" ? "default" : "secondary"} className="text-[9px]">
                                  {conv.status === "open" ? "Aberto" : conv.status === "resolved" ? "Encerrado" : conv.status}
                                </Badge>
                                <span className="text-muted-foreground">{queueName}</span>
                                {agentName && <span>• {agentName}</span>}
                              </div>
                              <span className="text-muted-foreground">
                                {format(new Date(conv.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                {conv.status !== "open" && ` — ${format(new Date(conv.updated_at), "dd/MM HH:mm")}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
