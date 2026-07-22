import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRM_STAGES, TERMINAL_STAGES } from "@/types/crm-client";

export const MONITOR_STAGES = CRM_STAGES.filter(
    (s) => !TERMINAL_STAGES.includes(s as (typeof TERMINAL_STAGES)[number])
);

export interface MonitorContact {
    id: string;
    push_name: string | null;
    phone: string | null;
    number: string | null;
    profile_pic_url: string | null;
}

export interface MonitorCard {
    conversationId: string;
    contactId: string;
    contact: MonitorContact;
    stage: string;
    status: "open" | "pending";
    assignedAgentId: string | null;
    channel: "whatsapp" | "instagram";
    instanceId: string | null;
    instanceName: string;
    isOfficialApi: boolean; // Meta Cloud API (whatsapp) or Instagram — has 24h window
    createdAt: string;
    lastMessageAt: string | null;
    lastCustomerMessageAt: string | null;
}

export interface AgentTicketCounts {
    open: number;
    pending: number;
}

/**
 * Open/pending conversations joined (client-side) with active crm_client deals.
 * Also returns per-agent ticket counts over ALL open/pending conversations.
 */
export function useMonitorConversations() {
    return useQuery({
        queryKey: ["monitor-conversations"],
        queryFn: async () => {
            const [dealsRes, convsRes] = await Promise.all([
                supabase
                    .from("crm_client" as any)
                    .select("contact_id, stage, contacts(id, push_name, phone, number, profile_pic_url)")
                    .eq("is_active", true)
                    .in("stage", MONITOR_STAGES),
                supabase
                    .from("conversations")
                    .select(
                        "id, contact_id, status, assigned_agent_id, instance_id, instagram_instance_id, channel, created_at, last_message_at, last_customer_message_at, instances(name, provider), instagram_instances(account_name)"
                    )
                    .in("status", ["open", "pending"])
                    .limit(10000),
            ]);
            if (dealsRes.error) throw dealsRes.error;
            if (convsRes.error) throw convsRes.error;

            const dealByContact = new Map<string, { stage: string; contact: MonitorContact }>();
            (dealsRes.data || []).forEach((d: any) => {
                if (d.contact_id && d.contacts) {
                    dealByContact.set(d.contact_id, { stage: d.stage, contact: d.contacts });
                }
            });

            const cards: MonitorCard[] = [];
            const agentCounts = new Map<string, AgentTicketCounts>();

            (convsRes.data || []).forEach((c: any) => {
                if (c.assigned_agent_id) {
                    const counts = agentCounts.get(c.assigned_agent_id) || { open: 0, pending: 0 };
                    if (c.status === "open") counts.open += 1;
                    else counts.pending += 1;
                    agentCounts.set(c.assigned_agent_id, counts);
                }

                const deal = dealByContact.get(c.contact_id);
                if (!deal) return;

                const channel: "whatsapp" | "instagram" = c.channel === "instagram" ? "instagram" : "whatsapp";
                const isMeta = c.instances?.provider === "meta";
                cards.push({
                    conversationId: c.id,
                    contactId: c.contact_id,
                    contact: deal.contact,
                    stage: deal.stage,
                    status: c.status,
                    assignedAgentId: c.assigned_agent_id,
                    channel,
                    instanceId: channel === "instagram" ? c.instagram_instance_id : c.instance_id,
                    instanceName:
                        channel === "instagram"
                            ? c.instagram_instances?.account_name || "Instagram"
                            : c.instances?.name || "—",
                    isOfficialApi: isMeta || channel === "instagram",
                    createdAt: c.created_at,
                    lastMessageAt: c.last_message_at,
                    lastCustomerMessageAt: c.last_customer_message_at,
                });
            });

            return { cards, agentCounts };
        },
        refetchInterval: 60_000,
    });
}

export function useMonitorInstances() {
    return useQuery({
        queryKey: ["monitor-instances"],
        queryFn: async () => {
            const [wpp, insta] = await Promise.all([
                supabase.from("instances").select("id, name, provider").order("name"),
                supabase.from("instagram_instances" as any).select("id, account_name").order("account_name"),
            ]);
            if (wpp.error) throw wpp.error;
            return {
                whatsapp: (wpp.data || []) as { id: string; name: string; provider: string }[],
                instagram: ((insta.data || []) as any[]).map((i) => ({
                    id: i.id as string,
                    name: (i.account_name as string) || "Instagram",
                })),
            };
        },
    });
}

/** Map team_member_id → online (heartbeat < 2 min). */
export function useTeamOnlineStatus() {
    return useQuery({
        queryKey: ["team-online-status"],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_team_online_status" as any);
            if (error) throw error;
            const online = new Set<string>();
            ((data || []) as any[]).forEach((r) => {
                if (
                    r.last_heartbeat_at &&
                    Date.now() - new Date(r.last_heartbeat_at).getTime() < 2 * 60 * 1000
                ) {
                    online.add(r.team_member_id);
                }
            });
            return online;
        },
        refetchInterval: 60_000,
    });
}

/** True when the customer sent the last message (awaiting reply). */
export function lastMsgFromClient(card: MonitorCard): boolean {
    if (!card.lastCustomerMessageAt) return false;
    if (!card.lastMessageAt) return true;
    return (
        new Date(card.lastCustomerMessageAt).getTime() >=
        new Date(card.lastMessageAt).getTime() - 2000
    );
}

/** Remaining ms of the 24h service window; null when not applicable. */
export function windowRemainingMs(card: MonitorCard): number | null {
    if (!card.isOfficialApi) return null;
    if (!card.lastCustomerMessageAt) return 0;
    return Math.max(
        0,
        new Date(card.lastCustomerMessageAt).getTime() + 24 * 60 * 60 * 1000 - Date.now()
    );
}
