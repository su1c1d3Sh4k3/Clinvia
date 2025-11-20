import { useState } from "react";
import { Send, Sparkles, TrendingUp, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { supabase } from "@/integrations/supabase/client";

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

export const AIIntelligenceSidebar = ({ conversationId }: { conversationId?: string }) => {
  const { analysis } = useAIAnalysis(conversationId);
  const [copilotMessage, setCopilotMessage] = useState("");
  const [copilotHistory, setCopilotHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [isLoadingCopilot, setIsLoadingCopilot] = useState(false);

  const satisfactionScore = analysis?.sentiment_score || 5;
  const summary = analysis?.summary || "Aguardando análise da conversa...";

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

  return (
    <div className="w-[320px] h-screen border-l border-border bg-background/50 backdrop-blur-sm flex flex-col p-4 gap-4">
      {/* Satisfaction Meter */}
      <Card className="bg-background/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Índice de Satisfação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-2xl font-bold ${getScoreColor(satisfactionScore)}`}>
                {satisfactionScore.toFixed(1)}
              </span>
              <Badge variant="outline" className={getScoreColor(satisfactionScore)}>
                {getScoreLabel(satisfactionScore)}
              </Badge>
            </div>
            <Progress value={satisfactionScore * 10} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Baseado na análise de sentimento da IA
            </p>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="bg-background/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Insights da IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 text-primary" />
              <p className="text-sm text-muted-foreground">{summary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Copilot Chat */}
      <Card className="bg-background/80 flex-1 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Copilot IA
          </CardTitle>
        </CardHeader>
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
      </Card>
    </div>
  );
};
