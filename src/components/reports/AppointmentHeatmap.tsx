import { cn } from "@/lib/utils";

interface HeatmapCell {
    dow: number;   // 0-6 (Sun-Sat)
    hour: number;  // 0-23
    count: number;
}

interface AppointmentHeatmapProps {
    data: HeatmapCell[];
    startHour?: number;  // default 6
    endHour?: number;    // default 22 (inclusive) — mostra células 6..22
}

const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Heatmap customizado: grid 7 dias (Y) x N horas (X).
 * Intensidade da cor proporcional ao valor (gradiente cinza → primária).
 * Hover mostra tooltip nativo.
 */
export function AppointmentHeatmap({ data, startHour = 6, endHour = 22 }: AppointmentHeatmapProps) {
    // Mapa (dow*24+hour) → count
    const map = new Map<string, number>();
    for (const cell of data) map.set(`${cell.dow}-${cell.hour}`, cell.count);

    const maxCount = Math.max(0, ...data.map(d => d.count));
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

    function intensity(count: number): number {
        if (maxCount === 0 || count === 0) return 0;
        return Math.min(1, count / maxCount);
    }

    function cellClass(count: number): string {
        const i = intensity(count);
        if (i === 0) return "bg-muted/30";
        if (i < 0.25) return "bg-primary/15";
        if (i < 0.5) return "bg-primary/35";
        if (i < 0.75) return "bg-primary/55";
        return "bg-primary/80";
    }

    const totalByDow = Array.from({ length: 7 }, (_, dow) =>
        hours.reduce((s, h) => s + (map.get(`${dow}-${h}`) || 0), 0)
    );
    const hasData = maxCount > 0;

    if (!hasData) {
        return (
            <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                <p className="text-sm">Sem agendamentos no período</p>
            </div>
        );
    }

    return (
        <div className="w-full overflow-x-auto">
            <div className="inline-block min-w-full">
                {/* Header: horas */}
                <div className="flex items-center gap-1 mb-1.5 pl-12">
                    {hours.map(h => (
                        <div
                            key={h}
                            className="flex-1 text-[10px] text-muted-foreground font-medium text-center min-w-[22px]"
                        >
                            {h}
                        </div>
                    ))}
                    <div className="w-10 text-[10px] text-muted-foreground font-medium text-center">Total</div>
                </div>

                {/* Rows: dias da semana */}
                {DOW_LABELS.map((label, dow) => (
                    <div key={dow} className="flex items-center gap-1 mb-1">
                        <div className="w-10 text-xs text-muted-foreground font-medium text-right pr-2">
                            {label}
                        </div>
                        {hours.map(h => {
                            const count = map.get(`${dow}-${h}`) || 0;
                            return (
                                <div
                                    key={h}
                                    className={cn(
                                        "flex-1 h-8 rounded border border-border/40 min-w-[22px] transition-all hover:scale-110 hover:border-primary cursor-default",
                                        cellClass(count),
                                    )}
                                    title={`${label} ${String(h).padStart(2, "0")}:00 — ${count} agendamento${count === 1 ? "" : "s"}`}
                                />
                            );
                        })}
                        <div className="w-10 text-xs font-semibold text-right pr-1">
                            {totalByDow[dow]}
                        </div>
                    </div>
                ))}

                {/* Legend */}
                <div className="flex items-center gap-3 mt-3 pl-12 text-[10px] text-muted-foreground">
                    <span>Menos</span>
                    {[0, 0.15, 0.35, 0.55, 0.8].map((v, i) => (
                        <div
                            key={i}
                            className={cn(
                                "w-4 h-4 rounded border border-border/40",
                                v === 0 ? "bg-muted/30" :
                                    v < 0.25 ? "bg-primary/15" :
                                        v < 0.5 ? "bg-primary/35" :
                                            v < 0.75 ? "bg-primary/55" :
                                                "bg-primary/80",
                            )}
                        />
                    ))}
                    <span>Mais</span>
                </div>
            </div>
        </div>
    );
}
