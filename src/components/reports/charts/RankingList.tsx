import { cn } from "@/lib/utils";
import { Medal } from "lucide-react";

interface RankingListProps {
  data: Array<{
    name: string;
    value: number;
    secondary?: string;
    type?: string;
  }>;
  valueFormat?: (value: number) => string;
  valueLabel?: string;
  limit?: number;
}

const MEDAL_COLORS = [
  "text-yellow-500",
  "text-gray-400",
  "text-amber-700",
];

export function RankingList({
  data,
  valueFormat = (v) => String(v),
  valueLabel,
  limit = 10,
}: RankingListProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-muted-foreground">Sem dados para exibir</span>
      </div>
    );
  }

  const sorted = [...data]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  const maxValue = sorted[0]?.value || 1;

  return (
    <div className="space-y-2">
      {sorted.map((item, i) => {
        const pct = (item.value / maxValue) * 100;
        return (
          <div
            key={i}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
          >
            {/* Position */}
            <div className="w-7 shrink-0 flex items-center justify-center">
              {i < 3 ? (
                <Medal className={cn("w-5 h-5", MEDAL_COLORS[i])} />
              ) : (
                <span className="text-sm font-medium text-muted-foreground">
                  {i + 1}
                </span>
              )}
            </div>

            {/* Name & Bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate">
                  {item.name}
                </span>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  <span className="text-sm font-bold tabular-nums">
                    {valueFormat(item.value)}
                  </span>
                  {valueLabel && (
                    <span className="text-xs text-muted-foreground">
                      {valueLabel}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {(item.secondary || item.type) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.type && (
                    <span className="font-medium">{item.type}</span>
                  )}
                  {item.type && item.secondary && " · "}
                  {item.secondary}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
