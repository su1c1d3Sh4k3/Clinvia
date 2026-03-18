import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportCard } from "./ReportCard";
import { getFrequencyLabel } from "@/types/reports";
import type { StrategicReport, ReportFrequency } from "@/types/reports";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReportFrequencySectionProps {
  frequency: ReportFrequency;
  reports: StrategicReport[];
  onReportClick: (report: StrategicReport) => void;
  defaultOpen?: boolean;
}

export function ReportFrequencySection({
  frequency,
  reports,
  onReportClick,
  defaultOpen = false,
}: ReportFrequencySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const label = getFrequencyLabel(frequency);
  const count = reports.length;

  // Format period from first report
  const periodLabel = (() => {
    if (reports.length === 0) return "";
    const first = reports[0];
    try {
      const start = new Date(first.period_start + "T00:00:00");
      const end = new Date(first.period_end + "T00:00:00");
      if (frequency === "daily") {
        return format(start, "dd/MM/yyyy", { locale: ptBR });
      }
      if (frequency === "weekly") {
        return `${format(start, "dd/MM", { locale: ptBR })} - ${format(end, "dd/MM", { locale: ptBR })}`;
      }
      return format(start, "MMMM yyyy", { locale: ptBR });
    } catch {
      return "";
    }
  })();

  return (
    <div className="border rounded-lg bg-card">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 text-left",
          "hover:bg-accent/50 transition-colors rounded-lg",
          isOpen && "border-b rounded-b-none"
        )}
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={cn(
              "w-5 h-5 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
          <div>
            <h2 className="text-base font-semibold">
              Relatórios {label}s
            </h2>
            {periodLabel && (
              <p className="text-xs text-muted-foreground">{periodLabel}</p>
            )}
          </div>
        </div>
        <span className="text-sm text-muted-foreground font-medium">
          {count} {count === 1 ? "relatório" : "relatórios"}
        </span>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-4">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum relatório gerado para este período.
              <br />
              Configure seus relatórios nas preferências.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {reports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onClick={onReportClick}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
