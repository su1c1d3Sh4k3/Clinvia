import { useState } from "react";
import { CalendarDays, ChevronDown, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Campaign } from "@/hooks/useCampaigns";
import { CampaignStatsRow } from "@/hooks/useCampaignDashboard";
import { CampaignExpandableCard } from "@/components/dashboard/campanhas/CampaignExpandableCard";
import {
    RecurrenceDayGroup,
    recurrenceBlockedAlert,
} from "@/lib/recurrenceCampaigns";

interface RecurrenceDayCardProps {
    group: RecurrenceDayGroup<Campaign>;
    statsMap: Map<string, CampaignStatsRow>;
}

/** Container pai "Recorrencia - dd/MM/yyyy" com as campanhas filhas do dia (R13). */
export function RecurrenceDayCard({ group, statsMap }: RecurrenceDayCardProps) {
    const [expanded, setExpanded] = useState(false);

    const totalContacts = group.campaigns.reduce(
        (acc, c) => acc + (statsMap.get(c.id)?.total_contacts ?? c.total_contacts ?? 0),
        0,
    );

    return (
        <div className="border rounded-xl bg-card overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex flex-wrap items-center gap-x-3 gap-y-2 p-4 text-left hover:bg-muted/30 transition-colors"
            >
                <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                <span className="font-semibold">{group.label}</span>
                <Badge variant="secondary">
                    {group.campaigns.length} campanha{group.campaigns.length !== 1 ? "s" : ""}
                </Badge>
                <Badge variant="outline">{totalContacts} contato{totalContacts !== 1 ? "s" : ""}</Badge>
                {group.blockedCount > 0 && (
                    <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 gap-1">
                        <AlertCircle className="w-3 h-3" /> {group.blockedCount} bloqueada{group.blockedCount !== 1 ? "s" : ""}
                    </Badge>
                )}
                <ChevronDown
                    className={cn(
                        "w-4 h-4 text-muted-foreground shrink-0 ml-auto transition-transform",
                        expanded && "rotate-180",
                    )}
                />
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {group.campaigns.map((c) => {
                        const alert = recurrenceBlockedAlert(c);
                        return (
                            <div key={c.id} className="space-y-2">
                                {alert && (
                                    <div className="flex items-start gap-2 border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-lg p-3 text-sm">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>{alert}</span>
                                    </div>
                                )}
                                <CampaignExpandableCard campaign={c} stats={statsMap.get(c.id)} />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
