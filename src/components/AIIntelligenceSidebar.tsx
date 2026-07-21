import { useState, useEffect } from "react";
import { Send, Sparkles, TrendingUp, ChevronUp, Zap, Settings, RefreshCw, DollarSign, Calendar, MessageSquare, FileText, Bot } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useAutoAnalysis } from "@/hooks/useAutoAnalysis";
import { useGenerateSummary } from "@/hooks/useGenerateSummary";
import { supabase } from "@/integrations/supabase/client";
import { CopilotSettingsModal } from "./CopilotSettingsModal";
import { SaleModal } from "@/components/sales/SaleModal";
import { AppointmentModal } from "@/components/scheduling/AppointmentModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Session } from "@supabase/supabase-js";
import { useOwnerId } from "@/hooks/useOwnerId";
import { cn } from "@/lib/utils";
import { CRM_STAGES, STAGE_COLORS, TERMINAL_STAGES, type CrmStage } from "@/types/crm-client";

const getScoreColor = (score: number) => {
  if (score >= 7) return "text-green-500";
  if (score >= 4) return "text-yellow-500";
  return "text-red-500";
};

const getScoreLabel = (score: number) => {
  if (score >= 7) return "Satisfeito";
  if (score >= 4) return "Neutro";
  return "Insatisfeito";
};

interface AIIntelligenceSidebarProps {
  conversationId?: string;
  onFollowUpMessageClick?: (message: string) => void;
  onOpportunitySelect?: (conversationId: string, message: string) => void;
}

export const AIIntelligenceSidebar = ({ conversationId }: AIIntelligenceSidebarProps) => {
  const queryClient = useQueryClient();
  const { analysis } = useAIAnalysis(conversationId);
  const { mutate: generateSummary, isPending: isGeneratingSummary } = useGenerateSummary();
  const { data: ownerId } = useOwnerId();
  const [session, setSession] = useState<Session | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  const { data: conversationData } = useQuery({
    queryKey: ["conversation-summary", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from("conversations" as any)
        .select("summary, contact_id, group_id, instance_id, contacts(push_name, number, phone)")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
    staleTime: 1000 * 60 * 5,
  });

  // ── CRM (crm_client) ──
  const contactId = conversationData?.contact_id;

  const { data: crmClient, refetch: refetchCrm } = useQuery({
    queryKey: ["crm-client-sidebar", contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_client" as any)
        .select("*, crm_client_services(*)")
        .eq("contact_id", contactId)
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
    enabled: !!contactId,
  });

  const handleStageChange = async (newStage: string) => {
    if (!crmClient?.id) return;
    const { error } = await supabase
      .from("crm_client" as any)
      .update({ stage: newStage, stage_changed_at: new Date().toISOString() })
      .eq("id", crmClient.id);
    if (error) {
      toast.error("Erro ao atualizar estágio");
    } else {
      toast.success(`Estágio alterado para ${newStage}`);
      refetchCrm();
    }
  };

  // ── Appointments ──
  const { data: appointments } = useQuery({
    queryKey: ["contact-appointments-sidebar", contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*, professionals(name)")
        .eq("contact_id", contactId)
        .order("start_time", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!contactId,
  });

  const now = new Date().toISOString();
  const pastAppointments = appointments?.filter((a: any) => a.start_time < now && a.status === "completed") || [];
  const pendingAppointments = appointments?.filter((a: any) => (a.start_time >= now || a.status === "agendado") && a.status !== "completed" && a.status !== "cancelled") || [];
  const lastCompleted = pastAppointments[0];

  // ── States ──
  const [copilotMessage, setCopilotMessage] = useState("");
  const [copilotHistory, setCopilotHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [isLoadingCopilot, setIsLoadingCopilot] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpdatingSatisfaction, setIsUpdatingSatisfaction] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);

  // Collapsible states
  const [openSection, setOpenSection] = useState<string | null>(() => {
    const saved = localStorage.getItem("ai-sidebar-open-section");
    return saved || null;
  });

  useEffect(() => {
    if (openSection) localStorage.setItem("ai-sidebar-open-section", openSection);
    else localStorage.removeItem("ai-sidebar-open-section");
  }, [openSection]);

  const toggleSection = (id: string) => setOpenSection(prev => prev === id ? null : id);

  const handleUpdateSatisfaction = async () => {
    if (!conversationId) return;
    setIsUpdatingSatisfaction(true);
    const loadingToast = toast.loading("Atualizando índice de satisfação...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.functions.invoke("ai-analyze-conversation", {
        body: { conversationId, userId: user?.id },
      });
      await queryClient.invalidateQueries({ queryKey: ["ai-analysis", conversationId] });
      toast.success("Índice atualizado com sucesso!");
    } catch {
      toast.error("Erro ao atualizar índice.");
    } finally {
      setIsUpdatingSatisfaction(false);
      toast.dismiss(loadingToast);
    }
  };

  const summary = conversationData?.summary || analysis?.summary || "Clique em 'Gerar Resumo' para analisar esta conversa.";

  const handleSendCopilot = async () => {
    if (!copilotMessage.trim()) return;
    const userMessage = { role: "user", content: copilotMessage };
    setCopilotHistory(prev => [...prev, userMessage]);
    setCopilotMessage("");
    setIsLoadingCopilot(true);
    try {
      const { data } = await supabase.functions.invoke("ai-copilot-chat", {
        body: { message: copilotMessage, conversationId, userId: session?.user?.id },
      });
      if (data?.response) {
        setCopilotHistory(prev => [...prev, { role: "assistant", content: data.response }]);
      }
    } catch {
      setCopilotHistory(prev => [...prev, { role: "assistant", content: "Desculpe, ocorreu um erro." }]);
    } finally {
      setIsLoadingCopilot(false);
    }
  };

  const handleGenerateSummary = () => {
    if (conversationId) generateSummary(conversationId);
  };

  const isGroup = !!conversationData?.group_id;
  const { satisfactionScore: autoScore, lastUpdated: autoLastUpdated } = useAutoAnalysis(conversationId, isGroup);
  const satisfactionScore = analysis?.sentiment_score ?? 5;

  // ── Menu items for icon-only sidebar ──
  const menuItems = [
    { id: "crm", icon: MessageSquare, label: "CRM", hideGroup: true },
    { id: "sale", icon: DollarSign, label: "Venda", hideGroup: true },
    { id: "schedule", icon: Calendar, label: "Agenda", hideGroup: true },
    { id: "satisfaction", icon: TrendingUp, label: "Satisfação", hideGroup: true },
    { id: "summary", icon: FileText, label: "Resumo", hideGroup: false },
    { id: "copilot", icon: Bot, label: "Copilot", hideGroup: false },
  ];

  const visibleItems = menuItems.filter(item => !item.hideGroup || !isGroup);

  return (
    <>
      <CopilotSettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <SaleModal open={showSaleModal} onOpenChange={setShowSaleModal} fixedContactId={!isGroup ? contactId : undefined} />
      <AppointmentModal
        open={showAppointmentModal}
        onOpenChange={setShowAppointmentModal}
        defaultContactId={contactId}
        defaultContactName={conversationData?.contacts?.push_name}
        defaultContactPhone={conversationData?.contacts?.number?.split("@")[0]}
        hideTypeTabs={true}
      />

      <div
        className={cn(
          "h-full border-l border-[#1E2229]/20 dark:border-border bg-white dark:bg-background/50 backdrop-blur-sm flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
          isHovered ? "w-[320px]" : "w-[60px]"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Collapsed: icon-only */}
        {!isHovered && (
          <div className="flex flex-col items-center gap-1 pt-4">
            {visibleItems.map(item => (
              <button
                key={item.id}
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                  openSection === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={item.label}
                onClick={() => { setIsHovered(true); toggleSection(item.id); }}
              >
                <item.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}

        {/* Expanded: full content */}
        {isHovered && (
          <div className="flex flex-col gap-3 pt-4 px-3 pb-20 overflow-y-auto flex-1">

            {/* ── CRM Section ── */}
            {!isGroup && contactId && (
              <Collapsible open={openSection === "crm"} onOpenChange={() => toggleSection("crm")}>
                <Card className="border-[#1E2229]/20 dark:border-border">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" /> CRM
                      </CardTitle>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
                          <ChevronUp className={`h-3.5 w-3.5 transition-transform ${openSection === "crm" ? "" : "rotate-180"}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="px-3 pb-3 pt-0">
                      {crmClient ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge style={{ backgroundColor: STAGE_COLORS[crmClient.stage as CrmStage] || "#666", color: "#fff" }} className="text-[10px]">
                              {crmClient.stage}
                            </Badge>
                            {crmClient.value > 0 && (
                              <span className="text-xs font-semibold text-green-600">
                                R$ {Number(crmClient.value).toFixed(2)}
                              </span>
                            )}
                          </div>
                          <select
                            className="w-full text-xs border rounded p-1.5 bg-background"
                            value={crmClient.stage}
                            onChange={(e) => handleStageChange(e.target.value)}
                          >
                            {CRM_STAGES.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          {crmClient.crm_client_services?.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[10px] text-muted-foreground font-medium">Serviços:</span>
                              {crmClient.crm_client_services.map((svc: any) => (
                                <div key={svc.id} className="text-[11px] flex justify-between bg-muted/30 rounded px-2 py-1">
                                  <span className="truncate">{svc.service_name || "Serviço"}</span>
                                  {svc.price > 0 && <span className="text-green-600 flex-shrink-0 ml-1">R${Number(svc.price).toFixed(0)}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Nenhum ticket CRM ativo
                        </p>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* ── Venda Section ── */}
            {!isGroup && contactId && (
              <Collapsible open={openSection === "sale"} onOpenChange={() => toggleSection("sale")}>
                <Card className="border-[#1E2229]/20 dark:border-border">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" /> Realizar Venda
                      </CardTitle>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
                          <ChevronUp className={`h-3.5 w-3.5 transition-transform ${openSection === "sale" ? "" : "rotate-180"}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="px-3 pb-3 pt-0">
                      <Button onClick={() => setShowSaleModal(true)} variant="default" size="sm" className="w-full text-xs">
                        <DollarSign className="w-3.5 h-3.5 mr-1.5" /> Nova Venda
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* ── Agendamento Section ── */}
            {!isGroup && contactId && (
              <Collapsible open={openSection === "schedule"} onOpenChange={() => toggleSection("schedule")}>
                <Card className="border-[#1E2229]/20 dark:border-border">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" /> Agendamento
                      </CardTitle>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
                          <ChevronUp className={`h-3.5 w-3.5 transition-transform ${openSection === "schedule" ? "" : "rotate-180"}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="px-3 pb-3 pt-0 space-y-2">
                      {/* Last completed */}
                      {lastCompleted && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground font-medium">Último realizado:</span>
                          <div className="text-[11px] bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-2">
                            <div className="font-medium">{lastCompleted.service_name || "Consulta"}</div>
                            <div className="text-muted-foreground">
                              {format(new Date(lastCompleted.start_time), "dd/MM/yy HH:mm", { locale: ptBR })}
                              {lastCompleted.professionals?.name && ` · ${lastCompleted.professionals.name}`}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Pending appointments */}
                      {pendingAppointments.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground font-medium">Pendentes ({pendingAppointments.length}):</span>
                          {pendingAppointments.map((apt: any) => (
                            <div key={apt.id} className="text-[11px] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                              <div className="font-medium">{apt.service_name || "Consulta"}</div>
                              <div className="text-muted-foreground">
                                {format(new Date(apt.start_time), "dd/MM/yy HH:mm", { locale: ptBR })}
                                {apt.professionals?.name && ` · ${apt.professionals.name}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!lastCompleted && pendingAppointments.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-1">Nenhum agendamento</p>
                      )}

                      <Button onClick={() => setShowAppointmentModal(true)} variant="default" size="sm" className="w-full text-xs">
                        <Calendar className="w-3.5 h-3.5 mr-1.5" /> Novo Agendamento
                      </Button>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* ── Satisfaction Section ── */}
            {!isGroup && (
              <Collapsible open={openSection === "satisfaction"} onOpenChange={() => toggleSection("satisfaction")}>
                <Card className="border-[#1E2229]/20 dark:border-border">
                  <CardHeader className="pb-2 px-3 pt-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" /> Satisfação
                      </CardTitle>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
                          <ChevronUp className={`h-3.5 w-3.5 transition-transform ${openSection === "satisfaction" ? "" : "rotate-180"}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="px-3 pb-3 pt-0">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className={`text-2xl font-bold ${getScoreColor(satisfactionScore)}`}>
                            {satisfactionScore.toFixed(1)}
                          </span>
                          <Badge variant="outline" className={getScoreColor(satisfactionScore)}>
                            {getScoreLabel(satisfactionScore)}
                          </Badge>
                        </div>
                        <Progress value={satisfactionScore * 10} className="h-2" />
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground">
                            Análise IA
                            {(autoLastUpdated || analysis?.last_updated) && (
                              <span className="block mt-0.5 opacity-70">
                                {new Date(autoLastUpdated || analysis?.last_updated || "").toLocaleString()}
                              </span>
                            )}
                          </p>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleUpdateSatisfaction} disabled={isUpdatingSatisfaction || !conversationId}>
                            <RefreshCw className={`h-3 w-3 ${isUpdatingSatisfaction ? "animate-spin" : ""}`} />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* ── Summary Section ── */}
            <Collapsible open={openSection === "summary"} onOpenChange={() => toggleSection("summary")}>
              <Card className="border-[#1E2229]/20 dark:border-border">
                <CardHeader className="pb-2 px-3 pt-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Resumo
                    </CardTitle>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
                        <ChevronUp className={`h-3.5 w-3.5 transition-transform ${openSection === "summary" ? "" : "rotate-180"}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="px-3 pb-3 pt-0">
                    <div className="space-y-2">
                      <Button onClick={handleGenerateSummary} disabled={!conversationId || isGeneratingSummary} variant="outline" size="sm" className="w-full text-xs">
                        <Zap className="w-3 h-3 mr-1.5" />
                        {isGeneratingSummary ? "Gerando..." : "Gerar Resumo"}
                      </Button>
                      <ScrollArea className="max-h-[300px] w-full rounded-md border">
                        <div className="text-xs p-3 whitespace-pre-wrap">
                          {summary}
                        </div>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* ── Copilot Section ── */}
            <Collapsible open={openSection === "copilot"} onOpenChange={() => toggleSection("copilot")} className={openSection === "copilot" ? "flex-1 flex flex-col" : ""}>
              <Card className={cn("border-[#1E2229]/20 dark:border-border", openSection === "copilot" && "flex-1 flex flex-col")}>
                <CardHeader className="pb-2 px-3 pt-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" /> Copilot IA
                    </CardTitle>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" className="w-7 h-7 p-0" onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(true); }}>
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-7 h-7 p-0">
                          <ChevronUp className={`h-3.5 w-3.5 transition-transform ${openSection === "copilot" ? "" : "rotate-180"}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                </CardHeader>
                <CollapsibleContent className="flex-1 flex flex-col">
                  <CardContent className="flex-1 flex flex-col p-0">
                    <ScrollArea className="h-[250px] w-full px-3">
                      <div className="space-y-2 py-2">
                        {copilotHistory.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">Pergunte algo ao assistente</p>
                        ) : (
                          copilotHistory.map((msg, idx) => (
                            <div key={idx} className={`text-xs p-2 rounded ${msg.role === "user" ? "bg-primary text-primary-foreground ml-4" : "bg-muted text-foreground mr-4"}`}>
                              {msg.content}
                            </div>
                          ))
                        )}
                        {isLoadingCopilot && <div className="text-xs p-2 rounded bg-muted mr-4">Pensando...</div>}
                      </div>
                    </ScrollArea>
                    <div className="p-3 border-t">
                      <div className="flex gap-1.5">
                        <Input placeholder="Pergunte ao Copilot..." value={copilotMessage} onChange={(e) => setCopilotMessage(e.target.value)} onKeyPress={(e) => e.key === "Enter" && handleSendCopilot()} className="text-xs h-8" disabled={isLoadingCopilot} />
                        <Button size="icon" className="h-8 w-8 flex-shrink-0" onClick={handleSendCopilot} disabled={isLoadingCopilot || !copilotMessage.trim()}>
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

          </div>
        )}
      </div>
    </>
  );
};
