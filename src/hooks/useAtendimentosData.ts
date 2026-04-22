import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "./useOwnerId";

/**
 * Hook orquestrador para a aba "Atendimentos" do Dashboard.
 *
 * Dispara em paralelo as 4 queries que alimentam ServiceMetricsGrid,
 * HistoryCharts e TeamPerformanceTable, compartilhando o cache do
 * React Query e expondo um único `isLoading` para o loader unificado.
 *
 * staleTime: 5 min — evita refetch a cada troca de aba ou remount.
 */
export interface DashboardStats {
    tickets_by_queue?: { name: string; value: number }[];
    tickets_by_user?: { name: string; value: number }[];
    tickets_by_status?: { name: string; value: number }[];
    tickets_by_connection?: { name: string; value: number }[];
    clients_by_tag?: { name: string; value: number }[];
}

export interface DashboardHistory {
    daily_new_contacts?: { date: string; value: number }[];
    daily_new_tickets?: { date: string; value: number }[];
    monthly_combined?: { month: string; new_contacts: number; new_tickets: number }[];
}

export interface DashboardGlobalMetrics {
    avg_quality: number;
    avg_response_time_seconds: number;
    quality_change: number;
    response_time_change: number;
}

export interface TeamMemberPerformance {
    user_id: string;
    team_member_id?: string;
    name: string;
    avatar_url?: string;
    pending_tickets: number;
    open_tickets: number;
    resolved_tickets: number;
    avg_response_time_min: number;
    avg_quality: number;
}

const STALE_TIME = 1000 * 60 * 5; // 5 min
const GC_TIME = 1000 * 60 * 10;   // 10 min

export const useAtendimentosData = (enabled: boolean = true) => {
    const { data: ownerId, isLoading: isOwnerIdLoading } = useOwnerId();

    const isEnabled = enabled && !!ownerId;

    const statsQ = useQuery<DashboardStats>({
        queryKey: ["dashboard-stats", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_dashboard_stats");
            if (error) throw error;
            return (data || {}) as DashboardStats;
        },
        enabled: isEnabled,
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
    });

    const historyQ = useQuery<DashboardHistory>({
        queryKey: ["dashboard-history", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_dashboard_history");
            if (error) throw error;
            return (data || {}) as DashboardHistory;
        },
        enabled: isEnabled,
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
    });

    const globalMetricsQ = useQuery<DashboardGlobalMetrics>({
        queryKey: ["dashboard-global-metrics", ownerId],
        queryFn: async () => {
            // Usa a nova RPC consolidada — um único round-trip ao invés de 4.
            const { data, error } = await supabase.rpc("get_dashboard_global_metrics");
            if (!error && data) {
                return data as DashboardGlobalMetrics;
            }

            // Fallback: caso a migration ainda não tenha sido aplicada,
            // usa a RPC antiga para manter o dashboard funcional.
            console.warn("[useAtendimentosData] get_dashboard_global_metrics falhou, usando fallback:", error);
            if (!ownerId) {
                return { avg_quality: 0, avg_response_time_seconds: 0, quality_change: 0, response_time_change: 0 };
            }

            const [{ data: q }, { data: rtData }] = await Promise.all([
                supabase.rpc("get_avg_sentiment_score", { owner_id: ownerId }),
                supabase
                    .from("response_times")
                    .select("response_duration_seconds, conversations!inner(user_id)")
                    .not("response_duration_seconds", "is", null)
                    .lt("response_duration_seconds", 86400)
                    .eq("conversations.user_id", ownerId),
            ]);

            const avgQuality = typeof q === "number" ? q : 0;
            const avgResponseTime = (rtData && rtData.length > 0)
                ? rtData.reduce((acc: number, r: any) => acc + (r.response_duration_seconds || 0), 0) / rtData.length
                : 0;

            return {
                avg_quality: Math.round(avgQuality * 10) / 10,
                avg_response_time_seconds: Math.round(avgResponseTime),
                quality_change: 0,
                response_time_change: 0,
            };
        },
        enabled: isEnabled,
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
    });

    const teamQ = useQuery<TeamMemberPerformance[]>({
        queryKey: ["team-performance", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_team_performance");
            if (error) throw error;
            return (data || []) as TeamMemberPerformance[];
        },
        enabled: isEnabled,
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
    });

    const isLoading =
        isOwnerIdLoading ||
        statsQ.isLoading ||
        historyQ.isLoading ||
        globalMetricsQ.isLoading ||
        teamQ.isLoading;

    const isError =
        statsQ.isError ||
        historyQ.isError ||
        globalMetricsQ.isError ||
        teamQ.isError;

    const error =
        statsQ.error ||
        historyQ.error ||
        globalMetricsQ.error ||
        teamQ.error;

    return {
        isLoading,
        isError,
        error,
        stats: statsQ.data,
        history: historyQ.data,
        globalMetrics: globalMetricsQ.data,
        team: teamQ.data,
    };
};
