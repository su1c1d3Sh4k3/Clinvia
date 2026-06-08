import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, Brain } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ResumosTabProps {
  contact: any;
}

export const ResumosTab = ({ contact }: ResumosTabProps) => {
  // AI analysis from contact
  const analysisArray = (contact.analysis || []) as any[];

  // Conversation summaries with sentiment scores
  const { data: convSummaries, isLoading } = useQuery({
    queryKey: ["client-conv-summaries", contact.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, summary, sentiment_score, created_at, updated_at")
        .eq("contact_id", contact.id)
        .not("summary", "is", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const allItems = [
    ...analysisArray.map((a) => ({
      type: "analysis" as const,
      date: a.data,
      content: a.resumo,
      score: null,
    })),
    ...(convSummaries || []).map((c) => ({
      type: "conversation" as const,
      date: c.updated_at,
      content: c.summary,
      score: c.sentiment_score,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Brain className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum resumo de atendimento disponível.</p>
      </div>
    );
  }

  const scoreColor = (s: number | null) => {
    if (s === null) return "";
    if (s >= 7) return "text-green-600";
    if (s >= 4) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-3">
      {allItems.map((item, i) => (
        <div key={i} className="p-3 border rounded-md space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {item.type === "analysis" ? "Análise IA" : "Resumo Ticket"}
              </Badge>
              {item.score !== null && (
                <span className={`text-xs font-medium ${scoreColor(item.score)}`}>
                  Nota: {item.score}/10
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {item.date ? format(new Date(item.date), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{item.content}</p>
        </div>
      ))}
    </div>
  );
};
