import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ChevronDown, ChevronUp, Briefcase, Plus, Trash2, StickyNote,
  Paperclip, History, MessageSquare, Bot, UserRound, ArrowRight, Download,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { STAGE_COLORS, TERMINAL_STAGES, CrmStage, CRM_STAGES } from "@/types/crm-client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useStaff } from "@/hooks/useStaff";
import { ServiceCategory, ServiceName } from "@/types/services";

interface NegociacoesTabProps {
  contactId: string;
}

export const NegociacoesTab = ({ contactId }: NegociacoesTabProps) => {
  const { data: ownerId } = useOwnerId();
  const { data: staffMembers } = useStaff();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Service add state
  const [selCatId, setSelCatId] = useState("");
  const [selSvcId, setSelSvcId] = useState("");
  const [selAppId, setSelAppId] = useState("");

  const { data: deals, isLoading } = useQuery({
    queryKey: ["crm-client-all", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client" as any).select("*")
        .eq("contact_id", contactId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: dealServices, refetch: refetchServices } = useQuery({
    queryKey: ["crm-client-services", expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client_services" as any).select("*")
        .eq("crm_client_id", expandedId).order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: dealHistory } = useQuery({
    queryKey: ["crm-client-history", expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client_history" as any).select("*")
        .eq("crm_client_id", expandedId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: conversations } = useQuery({
    queryKey: ["crm-conversations", contactId, expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, status, assigned_agent_id, queue_id, created_at, updated_at")
        .eq("contact_id", contactId).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: queues } = useQuery({
    queryKey: ["queues-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("queues").select("id, name");
      if (error) throw error;
      return new Map((data || []).map((q: any) => [q.id, q.name]));
    },
  });

  const { data: teamMap } = useQuery({
    queryKey: ["team-members-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members" as any).select("id, auth_user_id, name");
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((m: any) => { map.set(m.id, m.name); if (m.auth_user_id) map.set(m.auth_user_id, m.name); });
      return map;
    },
  });

  // Service selection queries
  const { data: categories } = useQuery({
    queryKey: ["services-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services_category" as any).select("*").order("name");
      if (error) throw error; return data as ServiceCategory[];
    },
  });
  const { data: serviceNames } = useQuery({
    queryKey: ["service-names", selCatId], enabled: !!selCatId,
    queryFn: async () => {
      const { data, error } = await supabase.from("service_name" as any).select("*").eq("category_id", selCatId).order("name");
      if (error) throw error; return data as ServiceName[];
    },
  });
  const { data: appOptions } = useQuery({
    queryKey: ["deal-applications-neg", selSvcId], enabled: !!selSvcId,
    queryFn: async () => {
      const { data: clientApps } = await supabase.from("services_client" as any).select("*").eq("service_name_id", selSvcId).eq("status", true).order("name");
      if (clientApps && clientApps.length > 0) return clientApps.map((a: any) => ({ id: a.id, name: a.name, price: a.price, min_price: a.min_price }));
      const { data: tpl } = await supabase.from("service_applications" as any).select("*").eq("service_name_id", selSvcId).order("name");
      return (tpl || []).map((a: any) => ({ id: a.id, name: a.name, price: a.default_price, min_price: a.default_min_price }));
    },
  });

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const invalidateDeal = (dealId: string) => {
    queryClient.invalidateQueries({ queryKey: ["crm-client-all", contactId] });
    queryClient.invalidateQueries({ queryKey: ["crm-client-services", dealId] });
    queryClient.invalidateQueries({ queryKey: ["crm-client-history", dealId] });
    queryClient.invalidateQueries({ queryKey: ["crm-clients"] });
  };

  const updateDealField = async (dealId: string, field: string, value: any) => {
    await supabase.from("crm_client" as any).update({ [field]: value }).eq("id", dealId);
    invalidateDeal(dealId);
  };

  const addNote = async (dealId: string) => {
    if (!newNote.trim() || !ownerId) return;
    setSavingNote(true);
    try {
      await supabase.from("crm_client_history" as any).insert({
        crm_client_id: dealId, user_id: ownerId, event_type: "note_added", new_value: newNote.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ["crm-client-history", dealId] });
      setNewNote(""); toast.success("Nota adicionada");
    } catch { toast.error("Erro"); } finally { setSavingNote(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, dealId: string) => {
    const file = e.target.files?.[0];
    if (!file || !ownerId) return;
    e.target.value = "";
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${ownerId}/${dealId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("client-documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("client-documents").getPublicUrl(path);
      await supabase.from("crm_client_history" as any).insert({
        crm_client_id: dealId, user_id: ownerId, event_type: "attachment_added",
        new_value: file.name, metadata: { file_url: urlData.publicUrl },
      });
      queryClient.invalidateQueries({ queryKey: ["crm-client-history", dealId] });
      toast.success("Arquivo anexado");
    } catch (err: any) { toast.error("Erro: " + err.message); }
    finally { setUploading(false); }
  };

  const deleteService = async (serviceId: string, dealId: string) => {
    if (!confirm("Remover este serviço?")) return;
    await supabase.from("crm_client_services" as any).delete().eq("id", serviceId);
    // Recalculate value
    const { data: remaining } = await supabase.from("crm_client_services" as any).select("unit_price, quantity").eq("crm_client_id", dealId);
    const newTotal = (remaining || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
    await supabase.from("crm_client" as any).update({ value: newTotal }).eq("id", dealId);
    invalidateDeal(dealId);
    toast.success("Serviço removido");
  };

  const addServiceToDeal = async (dealId: string) => {
    if (!selAppId || !appOptions) return;
    const app = appOptions.find((a: any) => a.id === selAppId);
    if (!app) return;
    await supabase.from("crm_client_services" as any).insert({
      crm_client_id: dealId, service_client_id: app.id,
      service_name: app.name, quantity: 1, unit_price: app.price, min_price: app.min_price,
    });
    // Recalculate
    const { data: all } = await supabase.from("crm_client_services" as any).select("unit_price, quantity").eq("crm_client_id", dealId);
    const total = (all || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
    await supabase.from("crm_client" as any).update({ value: total }).eq("id", dealId);
    invalidateDeal(dealId);
    setSelAppId("");
    toast.success("Serviço adicionado");
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!deals || deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Briefcase className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma negociação registrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => expandedId && handleFileUpload(e, expandedId)} />

      {deals.map((deal: any) => {
        const isExpanded = expandedId === deal.id;
        const isTerminal = TERMINAL_STAGES.includes(deal.stage);
        const stageColor = STAGE_COLORS[deal.stage as CrmStage] || "#6b7280";
        const responsibleName = deal.responsible_id ? teamMap?.get(deal.responsible_id) : null;

        return (
          <div key={deal.id} className="border rounded-lg overflow-hidden">
            <button onClick={() => setExpandedId(isExpanded ? null : deal.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={isTerminal ? "secondary" : "default"} className="text-[10px]">{deal.stage}</Badge>
                    {deal.value > 0 && <span className="text-sm font-semibold">{fmt(deal.value)}</span>}
                    {deal.priority && (
                      <div className="w-2 h-2 rounded-full" style={{
                        backgroundColor: deal.priority === "high" ? "#ef4444" : deal.priority === "medium" ? "#eab308" : "#22c55e"
                      }} />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(deal.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    {responsibleName && ` • ${responsibleName}`}
                    {!deal.is_active && " — Encerrada"}
                  </span>
                </div>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isExpanded && (
              <div className="border-t px-4 py-4 space-y-5">
                {/* Edit Priority / Responsible (active only) */}
                {!isTerminal && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Prioridade</Label>
                      <Select value={deal.priority || "medium"} onValueChange={(v) => updateDealField(deal.id, "priority", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Responsável</Label>
                      <Select value={deal.responsible_id || ""} onValueChange={(v) => updateDealField(deal.id, "responsible_id", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {(staffMembers || []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Services */}
                <div>
                  <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2"><Briefcase className="w-3.5 h-3.5" /> Serviços</h4>
                  {(!dealServices || dealServices.length === 0) ? (
                    <p className="text-xs text-muted-foreground">Nenhum serviço vinculado.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {dealServices.map((svc: any) => (
                        <div key={svc.id} className="flex items-center gap-2 text-sm p-2 border rounded">
                          <span className="flex-1 truncate text-xs">{svc.service_name}</span>
                          <span className="text-xs text-muted-foreground">x{svc.quantity}</span>
                          <span className="text-xs font-medium">{fmt(svc.unit_price)}</span>
                          {!isTerminal && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteService(svc.id, deal.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add service */}
                  {!isTerminal && (
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      <select
                        className="h-7 text-[10px] w-full rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        value={selCatId}
                        onChange={(e) => { setSelCatId(e.target.value); setSelSvcId(""); setSelAppId(""); }}
                      >
                        <option value="">Categoria</option>
                        {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select
                        className="h-7 text-[10px] w-full rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        value={selSvcId}
                        onChange={(e) => { setSelSvcId(e.target.value); setSelAppId(""); }}
                        disabled={!selCatId}
                      >
                        <option value="">Procedimento</option>
                        {(serviceNames || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <select
                        className="h-7 text-[10px] w-full rounded-md border border-input bg-background px-1.5 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        value={selAppId}
                        onChange={(e) => setSelAppId(e.target.value)}
                        disabled={!selSvcId}
                      >
                        <option value="">Aplicação</option>
                        {(appOptions || []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => addServiceToDeal(deal.id)} disabled={!selAppId}>
                        <Plus className="w-3 h-3" /> Add
                      </Button>
                    </div>
                  )}
                </div>

                {/* Notes + Attachments */}
                {!isTerminal && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5" /> Nota / Anexo</h4>
                    <div className="flex gap-2">
                      <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} className="text-xs flex-1" placeholder="Escreva uma nota..." />
                      <div className="flex flex-col gap-1">
                        <Button size="sm" onClick={() => addNote(deal.id)} disabled={savingNote || !newNote.trim()} className="h-7 text-[10px]">
                          {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="h-7 text-[10px]">
                          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stage History */}
                <div>
                  <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2"><History className="w-3.5 h-3.5" /> Histórico</h4>
                  {(!dealHistory || dealHistory.length === 0) ? (
                    <p className="text-xs text-muted-foreground">Nenhum registro.</p>
                  ) : (
                    <div className="space-y-1 max-h-[200px] overflow-y-auto nav-scrollbar">
                      {dealHistory.map((h: any) => (
                        <div key={h.id} className="flex items-start gap-2 text-[11px] py-1 border-b last:border-0">
                          <span className="text-muted-foreground whitespace-nowrap shrink-0">{format(new Date(h.created_at), "dd/MM HH:mm")}</span>
                          {h.event_type === "stage_change" ? (
                            <span className="flex items-center gap-1 flex-wrap">
                              <Badge variant="outline" className="text-[9px] px-1">{h.old_value}</Badge>
                              <ArrowRight className="w-3 h-3 shrink-0" />
                              <Badge variant="outline" className="text-[9px] px-1">{h.new_value}</Badge>
                            </span>
                          ) : h.event_type === "note_added" ? (
                            <span><StickyNote className="w-3 h-3 inline mr-1" />{h.new_value}</span>
                          ) : h.event_type === "attachment_added" ? (
                            <span className="flex items-center gap-1">
                              <Paperclip className="w-3 h-3 inline" />
                              {h.metadata?.file_url ? (
                                <a href={h.metadata.file_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{h.new_value}</a>
                              ) : h.new_value}
                            </span>
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
                  <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2"><MessageSquare className="w-3.5 h-3.5" /> Atendimentos</h4>
                  {(!conversations || conversations.length === 0) ? (
                    <p className="text-xs text-muted-foreground">Nenhum atendimento.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto nav-scrollbar">
                      {conversations.map((conv: any) => {
                        const queueName = queues?.get(conv.queue_id) || "—";
                        const agentName = teamMap?.get(conv.assigned_agent_id) || null;
                        const isAI = queueName.toLowerCase().includes("ia");
                        return (
                          <div key={conv.id} className="flex items-start gap-2 text-[11px] p-2 border rounded">
                            {isAI ? <Bot className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" /> : <UserRound className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge variant={conv.status === "open" ? "default" : "secondary"} className="text-[9px]">
                                  {conv.status === "open" ? "Aberto" : "Encerrado"}
                                </Badge>
                                <span className="text-muted-foreground">{queueName}</span>
                                {agentName && <span>• {agentName}</span>}
                              </div>
                              <span className="text-muted-foreground">
                                {format(new Date(conv.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
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
