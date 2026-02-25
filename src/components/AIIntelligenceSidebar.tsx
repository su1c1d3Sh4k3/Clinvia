import { useState, useEffect } from "react";
import { Send, Sparkles, TrendingUp, ChevronUp, Zap, Settings, RefreshCw, DollarSign, Calendar, Clock, Check, Lock } from "lucide-react";
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
import { CRMIntegrationSidebar } from "@/components/crm/CRMIntegrationSidebar";
import { SaleModal } from "@/components/sales/SaleModal";
import { AppointmentModal } from "@/components/scheduling/AppointmentModal";
import { OpportunitiesSection } from "@/components/OpportunitiesSection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFollowUpCategories, useFollowUpTemplates, useConversationFollowUp, useAddConversationFollowUp, useRemoveConversationFollowUp, useLastClientMessage, isTemplateUnlocked, getUnlockTime, useToggleAutoFollowUp } from "@/hooks/useFollowUp";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Session } from "@supabase/supabase-js";

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

export const AIIntelligenceSidebar = ({ conversationId, onFollowUpMessageClick, onOpportunitySelect }: AIIntelligenceSidebarProps) => {
  const queryClient = useQueryClient();
  const { analysis } = useAIAnalysis(conversationId);
  const { mutate: generateSummary, isPending: isGeneratingSummary } = useGenerateSummary();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  // Fetch summary directly from conversations table
  const { data: conversationData } = useQuery({
    queryKey: ["conversation-summary", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from("conversations" as any)
        .select("summary, contact_id, group_id, contacts(push_name, number)")
        .eq("id", conversationId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes - rely on realtime for updates
  });

  // Debug logging removed for performance

  const [copilotMessage, setCopilotMessage] = useState("");
  const [copilotHistory, setCopilotHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [isLoadingCopilot, setIsLoadingCopilot] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpdatingSatisfaction, setIsUpdatingSatisfaction] = useState(false);

  const handleUpdateSatisfaction = async () => {
    if (!conversationId) return;
    setIsUpdatingSatisfaction(true);
    const loadingToast = toast.loading("Atualizando índice de satisfação...");

    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    try {
      console.log("Invoking ai-analyze-conversation for:", conversationId, "userId:", userId);
      const { data, error } = await supabase.functions.invoke("ai-analyze-conversation", {
        body: {
          conversationId,
          userId
        },
      });

      console.log("AI Analysis response:", { data, error });

      if (error) throw error;

      // Invalidate query to force refresh
      await queryClient.invalidateQueries({ queryKey: ["ai-analysis", conversationId] });

      toast.success("Índice atualizado com sucesso!");
    } catch (error) {
      console.error("Error updating satisfaction:", error);
      toast.error("Erro ao atualizar índice. Tente novamente.");
    } finally {
      setIsUpdatingSatisfaction(false);
      toast.dismiss(loadingToast);
    }
  };

  // Collapsible states with localStorage persistence
  const [isSatisfactionOpen, setIsSatisfactionOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-satisfaction-open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isSummaryOpen, setIsSummaryOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-summary-open");
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [isCopilotOpen, setIsCopilotOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-copilot-open");
    return saved !== null ? JSON.parse(saved) : false;
  });

  // Quick Sale states
  const [isSaleOpen, setIsSaleOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-sale-open");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [showSaleModal, setShowSaleModal] = useState(false);

  // Agendamento states
  const [isScheduleOpen, setIsScheduleOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-schedule-open");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);

  // Follow Up states
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-followup-open");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  // Persist collapsible states
  useEffect(() => {
    localStorage.setItem("ai-sidebar-satisfaction-open", JSON.stringify(isSatisfactionOpen));
  }, [isSatisfactionOpen]);

  useEffect(() => {
    localStorage.setItem("ai-sidebar-summary-open", JSON.stringify(isSummaryOpen));
  }, [isSummaryOpen]);

  useEffect(() => {
    localStorage.setItem("ai-sidebar-copilot-open", JSON.stringify(isCopilotOpen));
  }, [isCopilotOpen]);

  useEffect(() => {
    localStorage.setItem("ai-sidebar-sale-open", JSON.stringify(isSaleOpen));
  }, [isSaleOpen]);

  useEffect(() => {
    localStorage.setItem("ai-sidebar-schedule-open", JSON.stringify(isScheduleOpen));
  }, [isScheduleOpen]);

  useEffect(() => {
    localStorage.setItem("ai-sidebar-followup-open", JSON.stringify(isFollowUpOpen));
  }, [isFollowUpOpen]);

  // Follow Up hooks
  const { data: followUpCategories } = useFollowUpCategories();
  const { data: conversationFollowUp } = useConversationFollowUp(conversationId);
  const { data: followUpTemplates } = useFollowUpTemplates(conversationFollowUp?.category_id || selectedCategoryId);
  const { data: lastClientMessage } = useLastClientMessage(conversationId);
  const addFollowUpMutation = useAddConversationFollowUp();
  const removeFollowUpMutation = useRemoveConversationFollowUp();
  const toggleAutoFollowUpMutation = useToggleAutoFollowUp();
  const [showAutoFollowUpConfirm, setShowAutoFollowUpConfirm] = useState(false);

  // const satisfactionScore = analysis?.sentiment_score || 5; // Replaced by autoScore logic below
  // Use summary from conversations table if available, otherwise fallback to ai_analysis or default text
  const summary = conversationData?.summary || analysis?.summary || "Clique em 'Gerar Resumo' para analisar esta conversa.";

  const handleSendCopilot = async () => {
    if (!copilotMessage.trim()) return;

    const userMessage = { role: "user", content: copilotMessage };
    setCopilotHistory((prev) => [...prev, userMessage]);
    setCopilotMessage("");
    setIsLoadingCopilot(true);

    try {
      const { data } = await supabase.functions.invoke("ai-copilot-chat", {
        body: {
          message: copilotMessage,
          conversationId,
          userId: session?.user?.id,
        },
      });

      if (data?.response) {
        setCopilotHistory((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);
      }
    } catch (error) {
      console.error("Error in copilot chat:", error);
      setCopilotHistory((prev) => [
        ...prev,
        { role: "assistant", content: "Desculpe, ocorreu um erro. Tente novamente." },
      ]);
    } finally {
      setIsLoadingCopilot(false);
    }
  };

  const handleGenerateSummary = () => {
    if (conversationId) {
      generateSummary(conversationId);
    }
  };

  const isGroup = !!conversationData?.group_id;

  // Trigger auto-analysis (will skip if isGroup is true)
  const { satisfactionScore: autoScore, lastUpdated: autoLastUpdated } = useAutoAnalysis(conversationId, isGroup);

  // Use analysis from DB as source of truth, fallback to 5
  const satisfactionScore = analysis?.sentiment_score ?? 5;

  return (
    <div className="w-full md:w-[320px] md:h-screen md:border-l border-[#1E2229]/20 dark:border-border bg-white dark:bg-background/50 backdrop-blur-sm flex flex-col pt-4 px-4 pb-20 gap-4 overflow-y-auto">
      <CopilotSettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />

      {/* CRM Integration - Hide for Groups */}
      {!isGroup && conversationId && conversationData && (
        <CRMIntegrationSidebar
          contactId={conversationData.contact_id}
          contactName={conversationData.contacts?.push_name || conversationData.contacts?.number}
          contactPhone={conversationData.contacts?.number}
        />
      )}

      {/* Opportunities Section - Hide for Groups */}
      {!isGroup && conversationId && (
        <OpportunitiesSection onOpportunitySelect={onOpportunitySelect} />
      )}

      {/* Sale Modal (novo sistema de vendas) */}
      <SaleModal
        open={showSaleModal}
        onOpenChange={setShowSaleModal}
        fixedContactId={!isGroup ? conversationData?.contact_id : undefined}
      />

      {/* Realizar Venda - Hide for Groups */}
      {!isGroup && conversationId && (
        <Collapsible open={isSaleOpen} onOpenChange={setIsSaleOpen}>
          <Card className="bg-white dark:bg-background/80 border-[#1E2229]/20 dark:border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Realizar Venda
                </CardTitle>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-9 p-0">
                    <ChevronUp className={`h-4 w-4 transition-transform ${isSaleOpen ? "" : "rotate-180"}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Registre uma venda rápida atribuída a você nesta conversa.
                  </p>
                  <Button
                    onClick={() => setShowSaleModal(true)}
                    variant="default"
                    size="sm"
                    className="w-full"
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Nova Venda
                  </Button>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Agendamento - Hide for Groups */}
      {!isGroup && conversationId && (
        <Collapsible open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
          <Card className="bg-white dark:bg-background/80 border-[#1E2229]/20 dark:border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Agendamento
                </CardTitle>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-9 p-0">
                    <ChevronUp className={`h-4 w-4 transition-transform ${isScheduleOpen ? "" : "rotate-180"}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Agende um horário para este contato.
                  </p>
                  <Button
                    onClick={() => setShowAppointmentModal(true)}
                    variant="default"
                    size="sm"
                    className="w-full"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Novo Agendamento
                  </Button>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* AppointmentModal with pre-filled contact */}
      <AppointmentModal
        open={showAppointmentModal}
        onOpenChange={setShowAppointmentModal}
        defaultContactId={conversationData?.contact_id}
        defaultContactName={conversationData?.contacts?.push_name}
        defaultContactPhone={conversationData?.contacts?.number?.split('@')[0]}
        hideTypeTabs={true}
      />

      {/* Follow Up - Hide for Groups, Only for open tickets */}
      {!isGroup && conversationId && (
        <Collapsible open={isFollowUpOpen} onOpenChange={setIsFollowUpOpen}>
          <Card className="bg-white dark:bg-background/80 border-[#1E2229]/20 dark:border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Follow Up
                </CardTitle>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-9 p-0">
                    <ChevronUp className={`h-4 w-4 transition-transform ${isFollowUpOpen ? "" : "rotate-180"}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {/* If no follow up attached, show category select */}
                  {!conversationFollowUp ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Selecione uma categoria de follow up
                      </p>
                      <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {followUpCategories?.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedCategoryId && (
                        <Button
                          onClick={() => addFollowUpMutation.mutate({ conversationId, categoryId: selectedCategoryId })}
                          variant="default"
                          size="sm"
                          className="w-full"
                          disabled={addFollowUpMutation.isPending}
                        >
                          Adicionar Follow Up a este contato
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Show attached category and messages */}
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{conversationFollowUp.category?.name}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive text-xs"
                          onClick={() => removeFollowUpMutation.mutate(conversationId)}
                          disabled={removeFollowUpMutation.isPending}
                        >
                          Remover
                        </Button>
                      </div>

                      {/* Auto Follow Up Switch */}
                      <div className="flex items-center justify-between p-2 mt-2 border rounded bg-muted/30">
                        <Label htmlFor="auto-followup" className="text-xs cursor-pointer">
                          Follow Up Automático
                        </Label>
                        <Switch
                          id="auto-followup"
                          checked={conversationFollowUp.auto_send || false}
                          disabled={toggleAutoFollowUpMutation.isPending || conversationFollowUp.completed}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setShowAutoFollowUpConfirm(true);
                            } else {
                              toggleAutoFollowUpMutation.mutate({ conversationId, enabled: false });
                            }
                          }}
                        />
                      </div>

                      {/* Status indicator */}
                      {conversationFollowUp.auto_send && !conversationFollowUp.completed && (
                        <p className="text-xs text-green-600 dark:text-green-400">
                          ✓ Envio automático ativado
                        </p>
                      )}
                      {conversationFollowUp.completed && (
                        <p className="text-xs text-muted-foreground">
                          ✓ Todos os follow ups foram enviados
                        </p>
                      )}

                      {/* Messages list */}
                      <div className="space-y-2 mt-2">
                        {followUpTemplates?.sort((a, b) => a.time_minutes - b.time_minutes).map((template) => {
                          const unlocked = isTemplateUnlocked(template.time_minutes, lastClientMessage || null);
                          const unlockTime = getUnlockTime(template.time_minutes, lastClientMessage || null);

                          return (
                            <div
                              key={template.id}
                              className={`p-2 rounded border text-xs ${unlocked ? 'cursor-pointer hover:bg-accent' : 'opacity-50 cursor-not-allowed'}`}
                              onClick={() => {
                                if (unlocked) {
                                  // Send message to textarea instead of clipboard
                                  if (onFollowUpMessageClick) {
                                    onFollowUpMessageClick(template.message);
                                    toast("Mensagem inserida no campo de texto!");
                                  } else {
                                    // Fallback to clipboard if callback not provided
                                    navigator.clipboard.writeText(template.message);
                                    toast("Mensagem copiada para área de transferência!");
                                  }
                                }
                              }}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{template.name}</span>
                                <span className="flex items-center gap-1">
                                  {unlocked ? (
                                    <Check className="w-3 h-3 text-green-500" />
                                  ) : (
                                    <Lock className="w-3 h-3 text-muted-foreground" />
                                  )}
                                  <span>{template.time_minutes}min</span>
                                </span>
                              </div>
                              <p className="text-muted-foreground line-clamp-2">{template.message}</p>
                              {!unlocked && unlockTime && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Libera às {format(unlockTime, "HH:mm")}
                                </p>
                              )}
                            </div>
                          );
                        })}
                        {(!followUpTemplates || followUpTemplates.length === 0) && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Nenhuma mensagem cadastrada nesta categoria
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Satisfaction Meter - Collapsible - Hide for Groups */}
      {!isGroup && (
        <Collapsible open={isSatisfactionOpen} onOpenChange={setIsSatisfactionOpen}>
          <Card className="bg-white dark:bg-background/80 border-[#1E2229]/20 dark:border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Índice de Satisfação
                </CardTitle>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-9 p-0">
                    <ChevronUp className={`h-4 w-4 transition-transform ${isSatisfactionOpen ? "" : "rotate-180"}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-4">
                  {/* Qualidade */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="w-3 h-3" />
                      <span>Qualidade</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-2xl font-bold ${getScoreColor(satisfactionScore)}`}>
                        {satisfactionScore.toFixed(1)}
                      </span>
                      <Badge variant="outline" className={getScoreColor(satisfactionScore)}>
                        {getScoreLabel(satisfactionScore)}
                      </Badge>
                    </div>
                    <Progress value={satisfactionScore * 10} className="h-2" />
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground">
                      Baseado em análise de IA
                      {(autoLastUpdated || analysis?.last_updated) && (
                        <span className="block mt-1 text-[10px] opacity-70">
                          Atualizado em: {new Date(autoLastUpdated || analysis?.last_updated || "").toLocaleString()}
                        </span>
                      )}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={handleUpdateSatisfaction}
                      disabled={isUpdatingSatisfaction || !conversationId}
                      title={!conversationId ? "Selecione uma conversa para atualizar" : "Atualizar índice"}
                    >
                      <RefreshCw className={`h-3 w-3 ${isUpdatingSatisfaction ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Resumo da Conversa - Collapsible */}
      <Collapsible open={isSummaryOpen} onOpenChange={setIsSummaryOpen}>
        <Card className="bg-white dark:bg-background/80 border-[#1E2229]/20 dark:border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Resumo da Conversa
              </CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-9 p-0">
                  <ChevronUp className={`h-4 w-4 transition-transform ${isSummaryOpen ? "" : "rotate-180"}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="space-y-3">
                <Button
                  onClick={handleGenerateSummary}
                  disabled={!conversationId || isGeneratingSummary}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Zap className="w-3 h-3 mr-2" />
                  {isGeneratingSummary ? "Gerando..." : "Gerar Resumo"}
                </Button>

                <ScrollArea className="h-[400px] w-full rounded-md border">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs p-4">
                    {summary ? (
                      <div className="whitespace-pre-wrap">{summary}</div>
                    ) : (
                      <p className="text-muted-foreground">Nenhum resumo disponível.</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Copilot Chat - Collapsible */}
      <Collapsible
        open={isCopilotOpen}
        onOpenChange={setIsCopilotOpen}
        className={isCopilotOpen ? "flex-1 flex flex-col" : ""}
      >
        <Card className={`bg-white dark:bg-background/80 border-[#1E2229]/20 dark:border-border ${isCopilotOpen ? "flex-1 flex flex-col" : ""}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Copilot IA
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-9 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSettingsOpen(true);
                  }}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-9 p-0">
                    <ChevronUp className={`h-4 w-4 transition-transform ${isCopilotOpen ? "" : "rotate-180"}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </CardHeader>
          <CollapsibleContent className="flex-1 flex flex-col">
            <CardContent className="flex-1 flex flex-col p-0">
              <ScrollArea className="h-[300px] w-full rounded-md px-4">
                <div className="space-y-3 py-2">
                  {copilotHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Pergunte algo ao assistente de IA
                    </p>
                  ) : (
                    copilotHistory.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`text-xs p-2 rounded ${msg.role === "user"
                          ? "bg-primary text-primary-foreground ml-4"
                          : "bg-muted text-foreground mr-4"
                          }`}
                      >
                        {msg.content}
                      </div>
                    ))
                  )}
                  {isLoadingCopilot && (
                    <div className="text-xs p-2 rounded bg-muted text-primary-foreground mr-4">
                      Pensando...
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <Input
                    placeholder="Pergunte ao Copilot..."
                    value={copilotMessage}
                    onChange={(e) => setCopilotMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSendCopilot()}
                    className="text-sm"
                    disabled={isLoadingCopilot}
                  />
                  <Button
                    size="icon"
                    onClick={handleSendCopilot}
                    disabled={isLoadingCopilot || !copilotMessage.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Auto Follow Up Confirmation Dialog */}
      <AlertDialog open={showAutoFollowUpConfirm} onOpenChange={setShowAutoFollowUpConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar Follow Up Automático</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Ao ativar essa função, quando o horário for atingido a mensagem vai ser
                enviada exatamente como foi definida automaticamente.
              </p>
              <p className="font-medium">O envio continuará até:</p>
              <ul className="list-disc list-inside text-sm">
                <li>O cliente responder (reinicia o fluxo do primeiro follow up)</li>
                <li>Todas as mensagens da categoria serem enviadas</li>
              </ul>
              <p className="font-medium mt-2">Deseja continuar?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (conversationId) {
                  toggleAutoFollowUpMutation.mutate({ conversationId, enabled: true });
                }
              }}
            >
              Sim, Ativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
