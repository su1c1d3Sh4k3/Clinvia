import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { callCampaignApi, type CampaignService } from "@/hooks/useCampaigns";

export interface GroupMonitoring {
    id: string;
    name: string;
    group_id: string;
    monitor_term: string;
    monitor_match_mode: "contains" | "equals";
    initial_message: string;
    objective: string;
    ia_enabled: boolean;
    services: CampaignService[];
    discount_pct: number | null;
    valid_until: string;
    tag_id: string | null;
    status: string;
    created_at: string;
}

/** Monitoramento ativo do grupo (campanha source_type='monitoring'). */
export function useActiveGroupMonitoring(groupId?: string | null) {
    return useQuery({
        queryKey: ["group-monitoring", groupId],
        queryFn: async (): Promise<GroupMonitoring | null> => {
            const { data, error } = await supabase
                .from("campaigns" as any)
                .select("id, name, group_id, monitor_term, monitor_match_mode, initial_message, objective, ia_enabled, services, discount_pct, valid_until, tag_id, status, created_at")
                .eq("group_id", groupId)
                .eq("source_type", "monitoring")
                .not("status", "in", '("cancelled","expired","error")')
                .gt("valid_until", new Date().toISOString())
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return (data as unknown as GroupMonitoring) || null;
        },
        enabled: !!groupId,
        refetchInterval: 60_000,
    });
}

/** Quantidade de leads capturados pelo monitoramento. */
export function useMonitoringLeadCount(campaignId?: string | null) {
    return useQuery({
        queryKey: ["group-monitoring-leads", campaignId],
        queryFn: async (): Promise<number> => {
            const { count, error } = await supabase
                .from("campaign_contacts" as any)
                .select("id", { count: "exact", head: true })
                .eq("campaign_id", campaignId);
            if (error) throw error;
            return count || 0;
        },
        enabled: !!campaignId,
        refetchInterval: 60_000,
    });
}

/** Cores de status do lead monitorado (user rule): verde=conversa aberta,
 *  laranja=pendente humano, lilás=pendente IA, azul-claro=resolvida. */
export const MONITOR_STATUS_COLORS = {
    open: "#22c55e",
    pending_ia: "#a78bfa",
    pending_human: "#f97316",
    resolved: "#38bdf8",
} as const;

export interface MonitoringVisuals {
    monitoringActive: boolean;
    /** messages.id da mensagem-gatilho → cor do status do lead */
    triggerColorByMessageId: Record<string, string>;
    /** últimos 8 dígitos do telefone do lead → cor (borda na foto, sempre) */
    colorByPhoneLast8: Record<string, string>;
}

const EMPTY_VISUALS: MonitoringVisuals = {
    monitoringActive: false,
    triggerColorByMessageId: {},
    colorByPhoneLast8: {},
};

/** Bordas/filtro do chat de grupo: leads capturados pelo monitoramento ativo. */
export function useGroupMonitoringVisuals(groupId?: string | null) {
    return useQuery({
        queryKey: ["group-monitoring-visuals", groupId],
        queryFn: async (): Promise<MonitoringVisuals> => {
            const { data: camp, error: campErr } = await supabase
                .from("campaigns" as any)
                .select("id")
                .eq("group_id", groupId)
                .eq("source_type", "monitoring")
                .not("status", "in", '("cancelled","expired","error")')
                .gt("valid_until", new Date().toISOString())
                .limit(1)
                .maybeSingle();
            if (campErr) throw campErr;
            if (!camp) return EMPTY_VISUALS;

            const { data: entries, error: entErr } = await supabase
                .from("campaign_contacts" as any)
                .select("monitor_message_id, contact_id, conversation_id")
                .eq("campaign_id", (camp as any).id);
            if (entErr) throw entErr;
            const rows = (entries || []) as any[];
            if (rows.length === 0) return { ...EMPTY_VISUALS, monitoringActive: true };

            const convIds = rows.map((r) => r.conversation_id).filter(Boolean);
            const convMap = new Map<string, { status: string; queueName: string | null }>();
            if (convIds.length > 0) {
                const { data: convs } = await supabase
                    .from("conversations")
                    .select("id, status, queue:queues(name)")
                    .in("id", convIds);
                for (const c of (convs || []) as any[]) {
                    convMap.set(c.id, { status: c.status, queueName: c.queue?.name ?? null });
                }
            }

            const contactIds = rows.map((r) => r.contact_id).filter(Boolean);
            const numberMap = new Map<string, string>();
            if (contactIds.length > 0) {
                const { data: contacts } = await supabase
                    .from("contacts")
                    .select("id, number")
                    .in("id", contactIds);
                for (const c of (contacts || []) as any[]) {
                    const digits = String(c.number || "").split("@")[0].replace(/\D/g, "");
                    if (digits.length >= 8) numberMap.set(c.id, digits.slice(-8));
                }
            }

            const triggerColorByMessageId: Record<string, string> = {};
            const colorByPhoneLast8: Record<string, string> = {};
            for (const r of rows) {
                const conv = r.conversation_id ? convMap.get(r.conversation_id) : null;
                let color: string = MONITOR_STATUS_COLORS.resolved;
                if (conv?.status === "open") color = MONITOR_STATUS_COLORS.open;
                else if (conv?.status === "pending") {
                    color = conv.queueName === "Atendimento IA"
                        ? MONITOR_STATUS_COLORS.pending_ia
                        : MONITOR_STATUS_COLORS.pending_human;
                }
                if (r.monitor_message_id) triggerColorByMessageId[r.monitor_message_id] = color;
                const last8 = r.contact_id ? numberMap.get(r.contact_id) : null;
                if (last8) colorByPhoneLast8[last8] = color;
            }
            return { monitoringActive: true, triggerColorByMessageId, colorByPhoneLast8 };
        },
        enabled: !!groupId,
        refetchInterval: 30_000,
    });
}

export interface CreateMonitoringPayload {
    group_id: string;
    monitor_term: string;
    monitor_match_mode: "contains" | "equals";
    valid_until: string; // ISO
    initial_message: string;
    ia_enabled: boolean;
    objective?: string;
    services?: CampaignService[];
    discount_pct?: number | null;
}

export function useGroupMonitoringMutations(groupId?: string | null) {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["group-monitoring", groupId] });
        queryClient.invalidateQueries({ queryKey: ["group-monitoring-leads"] });
    };

    const createMonitoring = useMutation({
        mutationFn: async (payload: CreateMonitoringPayload) => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            return callCampaignApi({ action: "create_monitoring", user_id: ownerId, ...payload });
        },
        onSuccess: invalidate,
    });

    const endMonitoring = useMutation({
        mutationFn: async (campaignId: string) => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            return callCampaignApi({ action: "end_monitoring", user_id: ownerId, campaign_id: campaignId });
        },
        onSuccess: invalidate,
    });

    return { createMonitoring, endMonitoring };
}
