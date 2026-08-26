import { useQuery } from "@tanstack/react-query";
import { format, isToday, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { TERMINAL_STAGES } from "@/types/crm-client";

export interface CrmStageCount {
    stage: string;
    total: number;
    open_count: number;
    pending_count: number;
    resolved_count: number;
}

/**
 * Counts per CRM stage for a given date.
 * Today: live data via RPC. Past dates: daily snapshot table (captured at 23:59 BRT).
 * `channelId` filtra pelo funil de uma conexão (só vale para hoje — o snapshot
 * histórico é agregado por conta).
 */
export function useCrmStageCounts(date: Date, channelId?: string | null) {
    const dateKey = format(date, "yyyy-MM-dd");
    const live = isToday(date);

    return useQuery({
        queryKey: ["crm-stage-counts", dateKey, live, channelId ?? "todos"],
        queryFn: async (): Promise<CrmStageCount[]> => {
            if (live) {
                const { data, error } = await supabase.rpc("get_crm_stage_counts" as any, {
                    p_channel: channelId || null,
                });
                if (error) throw error;
                return (data || []) as CrmStageCount[];
            }
            const { data, error } = await supabase
                .from("crm_stage_daily_snapshots" as any)
                .select("stage, total, open_count, pending_count, resolved_count")
                .eq("snapshot_date", dateKey);
            if (error) throw error;
            return (data || []) as unknown as CrmStageCount[];
        },
        refetchInterval: live ? 60_000 : false,
    });
}

export interface CrmResults {
    Ganho: { count: number; value: number };
    Perdido: { count: number; value: number };
    Finalizado: { count: number; value: number };
}

/**
 * Deals that ENTERED a terminal stage (Ganho/Perdido/Finalizado) on the given date.
 */
export function useCrmResults(date: Date, channelId?: string | null) {
    const dateKey = format(date, "yyyy-MM-dd");

    return useQuery({
        queryKey: ["crm-results", dateKey, channelId ?? "todos"],
        queryFn: async (): Promise<CrmResults> => {
            let q = supabase
                .from("crm_client" as any)
                .select("stage, value")
                .in("stage", TERMINAL_STAGES)
                .gte("stage_changed_at", startOfDay(date).toISOString())
                .lte("stage_changed_at", endOfDay(date).toISOString());
            if (channelId) q = q.eq("channel_key", channelId);
            const { data, error } = await q;
            if (error) throw error;

            const results: CrmResults = {
                Ganho: { count: 0, value: 0 },
                Perdido: { count: 0, value: 0 },
                Finalizado: { count: 0, value: 0 },
            };
            (data || []).forEach((d: any) => {
                const key = d.stage as keyof CrmResults;
                if (results[key]) {
                    results[key].count += 1;
                    results[key].value += Number(d.value) || 0;
                }
            });
            return results;
        },
    });
}
