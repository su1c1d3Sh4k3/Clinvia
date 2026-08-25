import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import {
    deriveRecurrenceBadge,
    type RecurrenceBadgeStatus,
} from "../../supabase/functions/_shared/recurrence-meta-template";

interface RecurrenceTemplateBadges {
    /** false = tenant sem instância Meta conectada (badge não se aplica, R10). */
    hasMeta: boolean;
    /** service_name_id → pior status entre os templates de recorrência 1-3. */
    badges: Record<string, RecurrenceBadgeStatus>;
    /** Status do template padrão da conta (service_name_id null); null = não submetido. */
    defaultBadge: RecurrenceBadgeStatus | null;
}

/** Status de aprovação dos templates Meta de recorrência por serviço (R6). */
export function useRecurrenceTemplateBadges() {
    const { data: ownerId } = useOwnerId();

    return useQuery<RecurrenceTemplateBadges>({
        queryKey: ["recurrence-template-badges", ownerId],
        enabled: !!ownerId,
        queryFn: async () => {
            const { data: metaInstances } = await supabase
                .from("instances")
                .select("id")
                .eq("provider", "meta")
                .eq("status", "connected")
                .limit(1);
            if (!metaInstances || metaInstances.length === 0) {
                return { hasMeta: false, badges: {}, defaultBadge: null };
            }

            const { data, error } = await supabase
                .from("message_templates" as any)
                .select("service_name_id, status")
                .not("recurrence_msg_number", "is", null);
            if (error) throw error;

            const byService: Record<string, string[]> = {};
            const defaultStatuses: string[] = [];
            for (const row of (data as any[]) || []) {
                if (row.service_name_id) {
                    (byService[row.service_name_id] ||= []).push(row.status);
                } else {
                    defaultStatuses.push(row.status);
                }
            }
            const badges: Record<string, RecurrenceBadgeStatus> = {};
            for (const [serviceId, statuses] of Object.entries(byService)) {
                badges[serviceId] = deriveRecurrenceBadge(statuses);
            }
            const defaultBadge = defaultStatuses.length > 0
                ? deriveRecurrenceBadge(defaultStatuses)
                : null;
            return { hasMeta: true, badges, defaultBadge };
        },
    });
}
