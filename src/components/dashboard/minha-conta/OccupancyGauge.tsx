// Gauge circular de ocupação — mesmo SVG do header do SchedulingCalendar
// (viewBox 36, pathLength 100, -rotate-90). Percent null = sem expediente no período.
export function OccupancyGauge({ percent, title }: { percent: number | null; title?: string }) {
    if (percent == null) {
        return (
            <div className="relative w-10 h-10 shrink-0 flex items-center justify-center" title={title || "Sem expediente configurado no período"}>
                <span className="text-[10px] text-muted-foreground font-semibold">—</span>
            </div>
        );
    }
    const p = Math.min(100, Math.max(0, Math.round(percent)));
    return (
        <div className="relative w-10 h-10 shrink-0" title={title || `Ocupação da agenda: ${p}%`}>
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" strokeWidth="5" className="stroke-muted" />
                <circle
                    cx="18" cy="18" r="15" fill="none" strokeWidth="5"
                    pathLength={100}
                    strokeDasharray={`${p} ${100 - p}`}
                    strokeLinecap="round"
                    className="stroke-primary transition-all duration-500"
                />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold">
                {p}%
            </span>
        </div>
    );
}
