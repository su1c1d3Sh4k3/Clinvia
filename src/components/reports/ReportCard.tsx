import { Card, CardContent } from "@/components/ui/card";
import { ReportComparisonBadge } from "./ReportComparisonBadge";
import { ReportSparkline } from "./ReportSparkline";
import {
  REPORT_TYPE_CONFIG,
  getComparisonPct,
  formatMetricValue,
} from "@/types/reports";
import type { StrategicReport } from "@/types/reports";
import {
  GitBranch, Filter, Bot, RefreshCw, UserPlus, TrendingUp,
  Repeat, DollarSign, Headphones, Heart, Users, Stethoscope,
  Calendar, Layers, ShoppingBag, Star, AlertTriangle, Clock,
  UserX, Target, Receipt, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ICON_MAP: Record<string, any> = {
  GitBranch, Filter, Bot, RefreshCw, UserPlus, TrendingUp,
  Repeat, DollarSign, Headphones, Heart, Users, Stethoscope,
  Calendar, Layers, ShoppingBag, Star, AlertTriangle, Clock,
  UserX, Target, Receipt, LogOut,
};

interface ReportCardProps {
  report: StrategicReport;
  onClick: (report: StrategicReport) => void;
}

export function ReportCard({ report, onClick }: ReportCardProps) {
  const config = REPORT_TYPE_CONFIG[report.report_type];
  if (!config) return null;

  const Icon = ICON_MAP[config.icon] || GitBranch;

  // Primary metric
  const primaryValue = report.data?.metrics?.[config.primaryMetric];
  const previousPrimaryValue =
    report.previous_data?.metrics?.[config.primaryMetric];

  // Comparison
  const comparison =
    typeof primaryValue === "number" && typeof previousPrimaryValue === "number"
      ? getComparisonPct(primaryValue, previousPrimaryValue)
      : { pct: 0, direction: "neutral" as const };

  // Secondary metric
  const secondaryValue = config.secondaryMetric
    ? report.data?.metrics?.[config.secondaryMetric]
    : undefined;

  // Sparkline data from breakdown
  const sparklineData = (() => {
    const breakdown = report.data?.breakdown;
    if (!Array.isArray(breakdown) || breakdown.length === 0) return [];
    // Try to extract numeric values from breakdown
    const numericKey = Object.keys(breakdown[0]).find(
      (k) => typeof breakdown[0][k] === "number" && k !== "index"
    );
    if (!numericKey) return [];
    return breakdown.slice(-7).map((item: any) => item[numericKey] ?? 0);
  })();

  // Format period
  const periodLabel = (() => {
    try {
      const start = new Date(report.period_start + "T00:00:00");
      const end = new Date(report.period_end + "T00:00:00");
      if (report.frequency === "daily") {
        return format(start, "dd/MM/yyyy", { locale: ptBR });
      }
      if (report.frequency === "weekly") {
        return `${format(start, "dd/MM", { locale: ptBR })} - ${format(end, "dd/MM", { locale: ptBR })}`;
      }
      return format(start, "MMMM yyyy", { locale: ptBR });
    } catch {
      return "";
    }
  })();

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200",
        "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5",
        "dark:hover:border-primary/40"
      )}
      onClick={() => onClick(report)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="shrink-0 p-1.5 rounded-md bg-primary/10 dark:bg-primary/20">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">
                #{String(report.report_number).padStart(4, "0")}
              </p>
              <h3 className="text-sm font-semibold truncate">{config.label}</h3>
            </div>
          </div>
        </div>

        {/* Period */}
        <p className="text-xs text-muted-foreground">{periodLabel}</p>

        {/* Sparkline */}
        {sparklineData.length > 1 && (
          <ReportSparkline data={sparklineData} />
        )}

        {/* Primary Metric */}
        <div>
          <p className="text-xl font-bold tabular-nums">
            {formatMetricValue(primaryValue, config.primaryMetric)}
          </p>
          <p className="text-xs text-muted-foreground">{config.primaryLabel}</p>
        </div>

        {/* Secondary Metric */}
        {secondaryValue !== undefined && secondaryValue !== null && config.secondaryMetric && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatMetricValue(secondaryValue, config.secondaryMetric)}
            </span>{" "}
            {config.secondaryLabel}
          </div>
        )}

        {/* Comparison */}
        <div className="pt-1 border-t">
          <ReportComparisonBadge
            pct={comparison.pct}
            direction={comparison.direction}
          />
          <span className="text-xs text-muted-foreground ml-1">
            vs anterior
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
