import { useState } from "react";
import { TrendingUp, Lightbulb, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const AIIntelligenceSidebar = () => {
  const [copilotMessage, setCopilotMessage] = useState("");
  const satisfactionScore = 8.5;
  const [copilotHistory, setCopilotHistory] = useState<Array<{ role: string; content: string }>>([
    {
      role: "assistant",
      content: "Olá! Como posso ajudar você com este atendimento?",
    },
  ]);

  const getScoreColor = (score: number) => {
    if (score > 7) return "bg-green-500";
    if (score > 4) return "bg-yellow-500";
    return "bg-red-500";
  };

  const handleSendCopilot = () => {
    if (!copilotMessage.trim()) return;
    
    setCopilotHistory([
      ...copilotHistory,
      { role: "user", content: copilotMessage },
      { role: "assistant", content: "Entendi. Sugiro que você responda de forma empática e profissional..." },
    ]);
    setCopilotMessage("");
  };

  return (
    <div className="w-[320px] h-screen p-4 space-y-4 overflow-y-auto backdrop-blur-lg bg-[hsl(var(--glassmorphism-bg))] border-l border-border">
      {/* Widget 1: Satisfaction Meter */}
      <Card className="bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Índice de Satisfação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">{satisfactionScore.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">/10</span>
          </div>
          <Progress 
            value={satisfactionScore * 10} 
            className="h-2"
          />
          <div className={cn(
            "w-full h-1 rounded-full",
            getScoreColor(satisfactionScore)
          )} />
          <p className="text-xs text-muted-foreground mt-2">
            Cliente satisfeito com o atendimento
          </p>
        </CardContent>
      </Card>

      {/* Widget 2: AI Insights */}
      <Card className="bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Insights da IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
              <p className="text-sm">
                <strong>Intenção:</strong> Cliente interessado em compra
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
              <p className="text-sm">
                <strong>Sentimento:</strong> Positivo e engajado
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
              <p className="text-sm">
                <strong>Urgência:</strong> Média - responder em até 5 minutos
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Widget 3: Copilot Chat */}
      <Card className="bg-card/50 backdrop-blur flex flex-col h-[400px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Copilot Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-2 p-0">
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-3">
              {copilotHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "text-sm p-2 rounded-lg",
                    msg.role === "user"
                      ? "bg-primary/10 text-foreground ml-4"
                      : "bg-muted mr-4"
                  )}
                >
                  {msg.content}
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <div className="p-4 pt-2 flex gap-2">
            <Input
              placeholder="Pergunte ao Copilot..."
              value={copilotMessage}
              onChange={(e) => setCopilotMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendCopilot()}
              className="text-sm"
            />
            <Button size="icon" onClick={handleSendCopilot}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
