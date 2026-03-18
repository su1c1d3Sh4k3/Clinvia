import { cn } from "@/lib/utils";

interface PerformanceTableProps {
  data: Array<Record<string, any>>;
  columns: Array<{
    key: string;
    label: string;
    format?: (value: any) => string;
    barKey?: boolean; // if true, render as horizontal bar
    barMax?: number;
  }>;
  nameKey?: string;
}

export function PerformanceTable({
  data,
  columns,
  nameKey = "name",
}: PerformanceTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-muted-foreground">Sem dados para exibir</span>
      </div>
    );
  }

  // Find max for bar rendering
  const barColumn = columns.find((c) => c.barKey);
  const barMax =
    barColumn?.barMax ??
    (barColumn
      ? Math.max(...data.map((d) => Number(d[barColumn.key]) || 0), 1)
      : 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">
              #
            </th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground">
              Nome
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "py-2 px-3 font-medium text-muted-foreground",
                  col.barKey ? "text-left min-w-[200px]" : "text-right"
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className="border-b last:border-0 hover:bg-accent/50 transition-colors"
            >
              <td className="py-2.5 px-3 text-muted-foreground">{i + 1}</td>
              <td className="py-2.5 px-3 font-medium truncate max-w-[200px]">
                {row[nameKey] || "—"}
              </td>
              {columns.map((col) => {
                const val = row[col.key];
                if (col.barKey) {
                  const pct = barMax > 0 ? ((Number(val) || 0) / barMax) * 100 : 0;
                  return (
                    <td key={col.key} className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-5 bg-accent rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/70 rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums w-10 text-right">
                          {col.format ? col.format(val) : val}
                        </span>
                      </div>
                    </td>
                  );
                }
                return (
                  <td key={col.key} className="py-2.5 px-3 text-right tabular-nums">
                    {col.format ? col.format(val) : (val ?? "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
