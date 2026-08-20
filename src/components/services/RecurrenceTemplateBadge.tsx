import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RecurrenceBadgeStatus } from "../../../supabase/functions/_shared/recurrence-meta-template";

const BADGE_CONFIG: Record<Exclude<RecurrenceBadgeStatus, null>, { label: string; className: string }> = {
    approved: {
        label: "template aprovado",
        className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900",
    },
    pending: {
        label: "aprovação pendente",
        className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-900",
    },
    rejected: {
        label: "aprovação negada",
        className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-red-200 dark:border-red-900",
    },
};

/** Selo de aprovação dos templates Meta de recorrência do serviço (R6 — só API oficial). */
export const RecurrenceTemplateBadge = ({ status }: { status: RecurrenceBadgeStatus | undefined }) => {
    if (!status) return null;
    const config = BADGE_CONFIG[status];
    return (
        <Badge
            variant="outline"
            className={cn("text-[10px] font-medium px-1.5 py-0 whitespace-nowrap", config.className)}
        >
            {config.label}
        </Badge>
    );
};
