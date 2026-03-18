import { cn } from "@/lib/utils";

interface SatisfactionGaugeProps {
  value: number;
  max?: number;
  label: string;
  suffix?: string;
  size?: "sm" | "md" | "lg";
  /** Inverted means lower is better (e.g., no-show rate) */
  inverted?: boolean;
}

export function SatisfactionGauge({
  value,
  max = 100,
  label,
  suffix = "%",
  size = "md",
  inverted = false,
}: SatisfactionGaugeProps) {
  const safeValue = Math.max(0, Math.min(value, max));
  const pct = (safeValue / max) * 100;

  // Color based on value
  const getColor = () => {
    const effectivePct = inverted ? 100 - pct : pct;
    if (effectivePct >= 70) return "text-emerald-500";
    if (effectivePct >= 40) return "text-amber-500";
    return "text-red-500";
  };

  const getStrokeColor = () => {
    const effectivePct = inverted ? 100 - pct : pct;
    if (effectivePct >= 70) return "#10b981";
    if (effectivePct >= 40) return "#f59e0b";
    return "#ef4444";
  };

  const dimensions = {
    sm: { size: 80, stroke: 6, fontSize: "text-lg" },
    md: { size: 120, stroke: 8, fontSize: "text-2xl" },
    lg: { size: 160, stroke: 10, fontSize: "text-3xl" },
  };

  const dim = dimensions[size];
  const radius = (dim.size - dim.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Semi-circle: use half circumference
  const semiCircumference = circumference / 2;
  const dashOffset = semiCircumference - (semiCircumference * pct) / 100;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: dim.size, height: dim.size / 2 + 20 }}>
        <svg
          width={dim.size}
          height={dim.size / 2 + 10}
          viewBox={`0 0 ${dim.size} ${dim.size / 2 + 10}`}
        >
          {/* Background arc */}
          <path
            d={`M ${dim.stroke / 2} ${dim.size / 2} A ${radius} ${radius} 0 0 1 ${dim.size - dim.stroke / 2} ${dim.size / 2}`}
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth={dim.stroke}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={`M ${dim.stroke / 2} ${dim.size / 2} A ${radius} ${radius} 0 0 1 ${dim.size - dim.stroke / 2} ${dim.size / 2}`}
            fill="none"
            stroke={getStrokeColor()}
            strokeWidth={dim.stroke}
            strokeLinecap="round"
            strokeDasharray={`${semiCircumference}`}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        {/* Value text centered */}
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ bottom: 0 }}
        >
          <span className={cn("font-bold tabular-nums", dim.fontSize, getColor())}>
            {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
            {suffix}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}
