import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ReportComparisonBadgeProps {
  pct: number;
  direction: "up" | "down" | "neutral";
  className?: string;
  size?: "sm" | "md";
}

export function ReportComparisonBadge({
  pct,
  direction,
  className,
  size = "sm",
}: ReportComparisonBadgeProps) {
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  if (direction === "neutral") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium text-muted-foreground",
          textSize,
          className
        )}
      >
        <Minus className={iconSize} />
        <span>0%</span>
      </span>
    );
  }

  const isUp = direction === "up";
  const colorClass = isUp
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-500 dark:text-red-400";
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        colorClass,
        textSize,
        className
      )}
    >
      <Icon className={iconSize} />
      <span>
        {isUp ? "+" : "-"}
        {pct}%
      </span>
    </span>
  );
}
