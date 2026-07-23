import { useState } from "react";
import { ChevronDown, RefreshCcw, CheckCircle2, Circle, Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RecurrenceMonthAgg, RECURRENCE_PHASES } from "@/hooks/useCampaignDashboard";
import { RecurrenceMonthTable } from "@/components/recurrence/RecurrenceMonthTable";

const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function RecurrenceMonthCard({ agg }: { agg: RecurrenceMonthAgg }) {
    const [expanded, setExpanded] = useState(false);

    const [year, month] = agg.monthKey.split("-");
    const monthLabel = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
    const barLabel = agg.currentPhaseIndex != null
        ? RECURRENCE_PHASES[agg.currentPhaseIndex]
        : "Concluído";
    const barPct = agg.currentPhaseIndex != null ? agg.currentPhaseProgress : 100;

    return (
        <div className="border rounded-xl bg-card overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left hover:bg-muted/30 transition-colors"
            >
                {/* Título */}
                <div className="flex items-center gap-2 min-w-0">
                    <RefreshCcw className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold truncate">Recorrência: {monthLabel}</span>
                    <Badge variant="secondary" className="gap-1 shrink-0">
                        <Users className="w-3 h-3" /> {agg.contactCount} contato{agg.contactCount !== 1 ? "s" : ""}
                    </Badge>
                </div>

                {/* Etapas (bolinhas) */}
                <div className="flex items-center gap-3">
                    {RECURRENCE_PHASES.map((phase, i) => (
                        <div key={phase} className="flex items-center gap-1">
                            {agg.phases[i].done ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                                <Circle className="w-4 h-4 text-muted-foreground/50" />
                            )}
                            <span className="text-[11px] text-muted-foreground">{phase}</span>
                        </div>
                    ))}
                </div>

                {/* Conversão */}
                <div className="flex items-center gap-1 text-sm">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                    <span className="font-semibold text-amber-600">{agg.conversionPct.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground">agendaram</span>
                </div>

                {/* Barra da etapa atual */}
                <div className="flex-1 min-w-[160px] max-w-[280px] ml-auto">
                    <p className="text-[10px] text-muted-foreground mb-1 text-right">{barLabel}</p>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-500"
                                style={{ width: `${barPct}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground w-9 text-right">{barPct}%</span>
                    </div>
                </div>

                <ChevronDown
                    className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", expanded && "rotate-180")}
                />
            </button>

            {expanded && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    <RecurrenceMonthTable entries={agg.entries} />
                </div>
            )}
        </div>
    );
}
