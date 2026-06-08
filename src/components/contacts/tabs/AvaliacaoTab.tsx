import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AvaliacaoTabProps {
  contact: any;
}

export const AvaliacaoTab = ({ contact }: AvaliacaoTabProps) => {
  const npsArray = (contact.nps || []) as any[];

  if (npsArray.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Star className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma avaliação ou feedback registrado.</p>
      </div>
    );
  }

  const avg = (npsArray.reduce((a, n) => a + (n.nota || 0), 0) / npsArray.length).toFixed(1);

  const noteColor = (n: number) => {
    if (n >= 4) return "text-green-600";
    if (n >= 3) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 border rounded-md bg-muted/20">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
          <span className="text-2xl font-bold">{avg}</span>
          <span className="text-sm text-muted-foreground">/ 5</span>
        </div>
        <span className="text-sm text-muted-foreground">{npsArray.length} avaliação{npsArray.length !== 1 ? "ões" : ""}</span>
      </div>

      {/* History */}
      <div className="space-y-2">
        {npsArray
          .sort((a, b) => new Date(b.dataPesquisa).getTime() - new Date(a.dataPesquisa).getTime())
          .map((entry: any, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 border rounded-md">
              <div className={`text-lg font-bold ${noteColor(entry.nota)}`}>
                {entry.nota}
              </div>
              <div className="flex-1 min-w-0">
                {entry.feedback && (
                  <p className="text-sm whitespace-pre-wrap">{entry.feedback}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {entry.dataPesquisa
                    ? format(new Date(entry.dataPesquisa), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : "—"}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                NPS
              </Badge>
            </div>
          ))}
      </div>
    </div>
  );
};
