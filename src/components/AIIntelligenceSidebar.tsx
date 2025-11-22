import { useState, useEffect } from "react";
import { Send, Sparkles, TrendingUp, AlertCircle, ChevronUp, Zap, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useGenerateSummary } from "@/hooks/useGenerateSummary";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

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

const getSpeedLabel = (score: number) => {
  if (score >= 9) return "Excelente";
  if (score >= 6) return "Rápido";
  if (score >= 3) return "Demorado";
  if (score >= 1) return "Ruim";
  return "Muito Demorado";
};

export const AIIntelligenceSidebar = ({ conversationId }: { conversationId?: string }) => {
  const { analysis } = useAIAnalysis(conversationId);
  const { mutate: generateSummary, isPending: isGeneratingSummary } = useGenerateSummary();
  
  const [copilotMessage, setCopilotMessage] = useState("");
  const [copilotHistory, setCopilotHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [isLoadingCopilot, setIsLoadingCopilot] = useState(false);

  // Collapsible states with localStorage persistence
  const [isSatisfactionOpen, setIsSatisfactionOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-satisfaction-open");
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  const [isSummaryOpen, setIsSummaryOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-summary-open");
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  const [isCopilotOpen, setIsCopilotOpen] = useState(() => {
    const saved = localStorage.getItem("ai-sidebar-copilot-open");
    return saved !== null ? JSON.parse(saved) : true;
  });

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

  const satisfactionScore = analysis?.sentiment_score || 5;
  const speedScore = analysis?.speed_score || 5;
  const summary = analysis?.summary || "Clique em 'Gerar Resumo' para analisar esta conversa.";

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

  return (
    <div className="w-[320px] h-screen border-l border-border bg-background/50 backdrop-blur-sm flex flex-col p-4 gap-4">
      {/* Satisfaction Meter - Collapsible */}
      <Collapsible open={isSatisfactionOpen} onOpenChange={setIsSatisfactionOpen}>
        <Card className="bg-background/80">
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

                {/* Velocidade */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>Velocidade</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold ${getScoreColor(speedScore)}`}>
                      {speedScore.toFixed(1)}
                    </span>
                    <Badge variant="outline" className={getScoreColor(speedScore)}>
                      {getSpeedLabel(speedScore)}
                    </Badge>
                  </div>
                  <Progress value={speedScore * 10} className="h-2" />
                </div>

                <p className="text-xs text-muted-foreground">
                  Baseado em análise de IA e tempo de resposta
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Resumo da Conversa - Collapsible */}
      <Collapsible open={isSummaryOpen} onOpenChange={setIsSummaryOpen}>
        <Card className="bg-background/80">
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
                
                <ScrollArea className="max-h-[300px]">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Copilot Chat - Collapsible */}
      <Collapsible open={isCopilotOpen} onOpenChange={setIsCopilotOpen} className="flex-1 flex flex-col">
        <Card className="bg-background/80 flex-1 flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Copilot IA
              </CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-9 p-0">
                  <ChevronUp className={`h-4 w-4 transition-transform ${isCopilotOpen ? "" : "rotate-180"}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent className="flex-1 flex flex-col">
            <CardContent className="flex-1 flex flex-col p-0">
              <ScrollArea className="flex-1 px-4">
                <div className="space-y-3 py-2">
                  {copilotHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Pergunte algo ao assistente de IA
                    </p>
                  ) : (
                    copilotHistory.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`text-xs p-2 rounded ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground ml-4"
                            : "bg-muted mr-4"
                        }`}
                      >
                        {msg.content}
                      </div>
                    ))
                  )}
                  {isLoadingCopilot && (
                    <div className="text-xs p-2 rounded bg-muted mr-4">
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
    </div>
  );
};
