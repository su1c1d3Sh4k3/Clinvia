import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    endOfMonth,
    endOfYear,
    startOfMonth,
    startOfYear,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useUsdBrlRate } from "@/hooks/useUsdBrlRate";
import { useCampaigns, Campaign } from "@/hooks/useCampaigns";
import { COST_PER_MSG_USD } from "@/components/campaigns/CampaignCard";
import { RecurrenceEntry } from "@/components/recurrence/RecurrenceMonthTable";

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export type CampanhasPeriod =
    | { mode: "all" }
    | { mode: "month"; year: number; month: number } // month 1-12
    | { mode: "year"; year: number }
    | { mode: "custom"; from?: Date; to?: Date };

export function periodToRange(p: CampanhasPeriod): { from: Date | null; to: Date | null } {
    switch (p.mode) {
        case "month": {
            const base = new Date(p.year, p.month - 1, 1);
            return { from: startOfMonth(base), to: endOfMonth(base) };
        }
        case "year": {
            const base = new Date(p.year, 0, 1);
            return { from: startOfYear(base), to: endOfYear(base) };
        }
        case "custom":
            return { from: p.from ?? null, to: p.to ?? null };
        default:
            return { from: null, to: null };
    }
}

function inRange(date: Date, range: { from: Date | null; to: Date | null }): boolean {
    if (range.from && date < range.from) return false;
    if (range.to && date > range.to) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

export interface CampaignStatsRow {
    campaign_id: string;
    total_contacts: number;
    valid_contacts: number;
    sent_count: number;
    delivered_count: number;
    failed_count: number;
    responded_count: number;
    converted_count: number;
}

export function useCampaignDashboardStats(period: CampanhasPeriod) {
    const { data: ownerId } = useOwnerId();
    const range = periodToRange(period);
    const fromIso = range.from?.toISOString() ?? null;
    const toIso = range.to?.toISOString() ?? null;

    return useQuery({
        queryKey: ["campaign-dashboard-stats", ownerId, fromIso, toIso],
        queryFn: async (): Promise<CampaignStatsRow[]> => {
            const { data, error } = await (supabase.rpc as any)("get_campaign_dashboard_stats", {
                p_from: fromIso,
                p_to: toIso,
            });
            if (error) throw error;
            return (data || []) as CampaignStatsRow[];
        },
        enabled: !!ownerId,
        refetchInterval: 60_000,
    });
}

/** Mesma query/queryKey da página /recurrence — cache compartilhado. */
export function useRecurrenceEntries() {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["recurrence-tracking", ownerId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("recurrence_tracking")
                .select("*")
                .eq("user_id", ownerId)
                .order("recurrence_date", { ascending: true });
            if (error) throw error;
            return (data || []) as RecurrenceEntry[];
        },
        enabled: !!ownerId,
    });
}

// ---------------------------------------------------------------------------
// Agregações
// ---------------------------------------------------------------------------

export const RECURRENCE_PHASES = ["Prévia", "Vencimento", "Pós"] as const;

export interface RecurrencePhaseAgg {
    total: number; // entries do mês com approach_N_date
    completed: number; // destas, status != 'pendente'
    done: boolean;
}

export interface RecurrenceMonthAgg {
    monthKey: string; // "2026-07"
    entries: RecurrenceEntry[];
    contactCount: number;
    phases: RecurrencePhaseAgg[]; // [Prévia, Vencimento, Pós]
    currentPhaseIndex: number | null; // null = tudo concluído
    currentPhaseProgress: number; // 0-100
    conversionPct: number; // scheduled=true / entries
    scheduledCount: number;
    realizedApproaches: number; // Σ abordagens status != 'pendente'
    inContactCount: number; // entries com algum approach 'cliente em contato'
    sortDate: Date; // dia 1 do mês
}

export type DashboardListItem =
    | { kind: "campaign"; campaign: Campaign; stats?: CampaignStatsRow; sortDate: Date }
    | { kind: "recurrence"; agg: RecurrenceMonthAgg; sortDate: Date };

export interface CampanhasKpis {
    totalContacts: number;
    sentMessages: number;
    errorMessages: number;
    respondedMessages: number;
    conversionPct: number; // só campanhas
    costBRL: number;
    rateIsFallback: boolean;
}

function aggregateRecurrenceMonth(monthKey: string, entries: RecurrenceEntry[]): RecurrenceMonthAgg {
    const approachOf = (e: RecurrenceEntry, i: number): { date: string | null; status: string } => {
        if (i === 0) return { date: e.approach_1_date, status: e.approach_1_status };
        if (i === 1) return { date: e.approach_2_date, status: e.approach_2_status };
        return { date: e.approach_3_date, status: e.approach_3_status };
    };

    const phases: RecurrencePhaseAgg[] = [0, 1, 2].map((i) => {
        const withDate = entries.filter((e) => approachOf(e, i).date);
        const completed = withDate.filter((e) => approachOf(e, i).status !== "pendente").length;
        return {
            total: withDate.length,
            completed,
            // Fase sem nenhuma data = vacuamente concluída (pulada)
            done: withDate.length === 0 || completed === withDate.length,
        };
    });

    const firstOpen = phases.findIndex((p) => !p.done);
    const currentPhaseIndex = firstOpen === -1 ? null : firstOpen;
    const current = currentPhaseIndex != null ? phases[currentPhaseIndex] : null;
    const currentPhaseProgress = current && current.total > 0
        ? Math.round((current.completed / current.total) * 100)
        : 100;

    let realizedApproaches = 0;
    let inContactCount = 0;
    for (const e of entries) {
        let inContact = false;
        for (let i = 0; i < 3; i++) {
            const a = approachOf(e, i);
            if (a.date && a.status !== "pendente") realizedApproaches++;
            if (a.status === "cliente em contato") inContact = true;
        }
        if (inContact) inContactCount++;
    }

    const scheduledCount = entries.filter((e) => e.scheduled).length;
    const [y, m] = monthKey.split("-").map(Number);

    return {
        monthKey,
        entries,
        contactCount: entries.length,
        phases,
        currentPhaseIndex,
        currentPhaseProgress,
        conversionPct: entries.length > 0 ? (scheduledCount / entries.length) * 100 : 0,
        scheduledCount,
        realizedApproaches,
        inContactCount,
        sortDate: new Date(y, m - 1, 1),
    };
}

export function useCampaignDashboard(period: CampanhasPeriod) {
    const { data: campaigns, isLoading: loadingCampaigns } = useCampaigns();
    const { data: stats, isLoading: loadingStats } = useCampaignDashboardStats(period);
    const { data: recurrence, isLoading: loadingRecurrence } = useRecurrenceEntries();
    const { data: rateData } = useUsdBrlRate();

    const range = periodToRange(period);

    return useMemo(() => {
        const statsMap = new Map<string, CampaignStatsRow>();
        for (const s of stats || []) statsMap.set(s.campaign_id, s);

        // Campanhas no período (scheduled_at)
        const filteredCampaigns = (campaigns || []).filter((c) =>
            inRange(new Date(c.scheduled_at), range)
        );

        // Recorrências no período (recurrence_date) agrupadas por mês
        const monthMap = new Map<string, RecurrenceEntry[]>();
        for (const e of recurrence || []) {
            const d = new Date(e.recurrence_date + "T12:00:00");
            if (!inRange(d, range)) continue;
            const [y, m] = e.recurrence_date.split("-");
            const key = `${y}-${m}`;
            if (!monthMap.has(key)) monthMap.set(key, []);
            monthMap.get(key)!.push(e);
        }
        const monthAggs = [...monthMap.entries()].map(([key, entries]) =>
            aggregateRecurrenceMonth(key, entries)
        );

        // Lista unificada, mais recentes primeiro (empate: campanha antes)
        const items: DashboardListItem[] = [
            ...filteredCampaigns.map((c) => ({
                kind: "campaign" as const,
                campaign: c,
                stats: statsMap.get(c.id),
                sortDate: new Date(c.scheduled_at),
            })),
            ...monthAggs.map((agg) => ({
                kind: "recurrence" as const,
                agg,
                sortDate: agg.sortDate,
            })),
        ].sort((a, b) => {
            const diff = b.sortDate.getTime() - a.sortDate.getTime();
            if (diff !== 0) return diff;
            return a.kind === "campaign" ? -1 : 1;
        });

        // KPIs
        let campTotal = 0, campDelivered = 0, campFailed = 0, campResponded = 0, campConverted = 0, campSent = 0;
        for (const c of filteredCampaigns) {
            const s = statsMap.get(c.id);
            if (!s) continue;
            campTotal += s.total_contacts;
            campSent += s.sent_count;
            campDelivered += s.delivered_count;
            campFailed += s.failed_count;
            campResponded += s.responded_count;
            campConverted += s.converted_count;
        }
        let recContacts = 0, recRealized = 0, recInContact = 0;
        for (const agg of monthAggs) {
            recContacts += agg.contactCount;
            recRealized += agg.realizedApproaches;
            recInContact += agg.inContactCount;
        }

        const rate = rateData?.rate ?? 5.5;
        const kpis: CampanhasKpis = {
            totalContacts: campTotal + recContacts,
            sentMessages: campDelivered + recRealized,
            errorMessages: campFailed,
            respondedMessages: campResponded + recInContact,
            conversionPct: campTotal > 0 ? (campConverted / campTotal) * 100 : 0,
            costBRL: (campSent + recRealized) * COST_PER_MSG_USD * rate,
            rateIsFallback: rateData?.isFallback ?? true,
        };

        return {
            kpis,
            items,
            isLoading: loadingCampaigns || loadingStats || loadingRecurrence,
        };
    }, [campaigns, stats, recurrence, rateData, range.from?.getTime(), range.to?.getTime(), loadingCampaigns, loadingStats, loadingRecurrence]);
}
