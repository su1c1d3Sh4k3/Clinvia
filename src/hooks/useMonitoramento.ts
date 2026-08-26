import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRM_STAGES, TERMINAL_STAGES, CHANNEL_SENTINEL, channelKeyOf } from "@/types/crm-client";

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
    status: "open" | "pending" | "resolved";
    assignedAgentId: string | null;
    channel: "whatsapp" | "instagram";
    instanceId: string | null;
    instanceName: string;
    isOfficialApi: boolean; // Meta Cloud API (whatsapp) or Instagram — has 24h window
    createdAt: string;
    lastMessageAt: string | null;
    lastCustomerMessageAt: string | null;
    /** Timestamp em que o card entrou na etapa final (só cards Finalizados) */
    finalizedAt?: string;
}

export interface AgentTicketCounts {
    open: number;
    pending: number;
    resolved: number;
}

export interface MonitorRange {
    start: Date;
    end: Date;
}

/**
 * Conversas do período (created_at no range) joinadas (client-side) com deals
 * ativos do crm_client + cards finalizados (etapa terminal no período — pela
 * regra do negócio, entrar em etapa final ≡ conversa resolvida).
 * Também retorna contadores por atendente (abertos/pendentes/resolvidos), todos
 * restritos ao período.
 */
export function useMonitorConversations(range: MonitorRange) {
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();
    return useQuery({
        queryKey: ["monitor-conversations", startIso, endIso],
        queryFn: async () => {
            const [dealsRes, convsRes, terminalRes, resolvedRes] = await Promise.all([
                supabase
                    .from("crm_client" as any)
                    .select("contact_id, stage, instance_id, instagram_instance_id, contacts(id, push_name, phone, number, profile_pic_url)")
                    .eq("is_active", true)
                    .in("stage", MONITOR_STAGES),
                supabase
                    .from("conversations")
                    .select(
                        "id, contact_id, status, assigned_agent_id, instance_id, instagram_instance_id, channel, created_at, last_message_at, last_customer_message_at, instances(name, provider), instagram_instances(account_name)"
                    )
                    .in("status", ["open", "pending"])
                    .gte("created_at", startIso)
                    .lte("created_at", endIso)
                    .limit(10000),
                supabase
                    .from("crm_client" as any)
                    .select(
                        "id, contact_id, stage, stage_changed_at, instance_id, instagram_instance_id, contacts(id, push_name, phone, number, profile_pic_url)"
                    )
                    .in("stage", TERMINAL_STAGES)
                    .gte("stage_changed_at", startIso)
                    .lte("stage_changed_at", endIso)
                    .order("stage_changed_at", { ascending: false })
                    .limit(5000),
                supabase
                    .from("conversations" as any)
                    .select(
                        "id, contact_id, assigned_agent_id, instance_id, instagram_instance_id, channel, created_at, resolved_at, last_message_at, instances(name, provider), instagram_instances(account_name)"
                    )
                    .eq("status", "resolved")
                    .gte("resolved_at", startIso)
                    .lte("resolved_at", endIso)
                    .limit(10000),
            ]);
            if (dealsRes.error) throw dealsRes.error;
            if (convsRes.error) throw convsRes.error;
            if (terminalRes.error) throw terminalRes.error;
            if (resolvedRes.error) throw resolvedRes.error;

            // O card é por (contato, conexão) — a conversa só casa com o card do
            // funil dela; card sem conexão (legado) vale como fallback.
            const dealKey = (contactId: string, channel: string) => `${contactId}|${channel}`;
            const dealByContactChannel = new Map<string, { stage: string; contact: MonitorContact }>();
            (dealsRes.data || []).forEach((d: any) => {
                if (d.contact_id && d.contacts) {
                    dealByContactChannel.set(dealKey(d.contact_id, channelKeyOf(d)), {
                        stage: d.stage,
                        contact: d.contacts,
                    });
                }
            });
            const findDeal = (conv: any) =>
                dealByContactChannel.get(dealKey(conv.contact_id, channelKeyOf(conv))) ||
                dealByContactChannel.get(dealKey(conv.contact_id, CHANNEL_SENTINEL));

            const cards: MonitorCard[] = [];
            const agentCounts = new Map<string, AgentTicketCounts>();

            const bumpAgent = (agentId: string | null, key: keyof AgentTicketCounts) => {
                if (!agentId) return;
                const counts = agentCounts.get(agentId) || { open: 0, pending: 0, resolved: 0 };
                counts[key] += 1;
                agentCounts.set(agentId, counts);
            };

            (convsRes.data || []).forEach((c: any) => {
                bumpAgent(c.assigned_agent_id, c.status === "open" ? "open" : "pending");

                const deal = findDeal(c);
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

            // Resolvidos por atendente + última conversa resolvida COM atendente por
            // contato. USER RULE: o board Finalizados só mostra atendimentos
            // encerrados por um usuário — resoluções automáticas (campanha/cron,
            // sem assigned_agent_id) ficam de fora.
            const resolvedByContact = new Map<string, any>();
            const resolvedByChannel = new Map<string, any>();
            (resolvedRes.data || []).forEach((c: any) => {
                bumpAgent(c.assigned_agent_id, "resolved");
                if (!c.assigned_agent_id) return;
                const prev = resolvedByContact.get(c.contact_id);
                if (!prev || (c.resolved_at || "") > (prev.resolved_at || "")) {
                    resolvedByContact.set(c.contact_id, c);
                }
                const k = dealKey(c.contact_id, channelKeyOf(c));
                const prevCh = resolvedByChannel.get(k);
                if (!prevCh || (c.resolved_at || "") > (prevCh.resolved_at || "")) {
                    resolvedByChannel.set(k, c);
                }
            });

            const finalizados: MonitorCard[] = [];
            const seenContacts = new Set<string>();
            // terminalRes vem ordenado por stage_changed_at desc → 1 card (o mais
            // recente) por contato+conexão, evitando key duplicada quando o contato
            // tem mais de um desfecho no período
            (terminalRes.data || []).forEach((d: any) => {
                if (!d.contact_id || !d.contacts) return;
                const cardChannel = channelKeyOf(d);
                const seenKey = dealKey(d.contact_id, cardChannel);
                if (seenContacts.has(seenKey)) return;
                // Card com conexão só casa com a conversa resolvida daquela conexão;
                // card legado (sem conexão) aceita qualquer uma do contato.
                const conv =
                    cardChannel === CHANNEL_SENTINEL
                        ? resolvedByContact.get(d.contact_id)
                        : resolvedByChannel.get(seenKey);
                if (!conv) return; // finalizado sem usuário que encerrou → não aparece
                seenContacts.add(seenKey);
                const channel: "whatsapp" | "instagram" =
                    conv.channel === "instagram" ? "instagram" : "whatsapp";
                finalizados.push({
                    conversationId: conv.id,
                    contactId: d.contact_id,
                    contact: d.contacts,
                    stage: d.stage,
                    status: "resolved",
                    assignedAgentId: conv.assigned_agent_id,
                    channel,
                    instanceId:
                        channel === "instagram" ? conv.instagram_instance_id : conv.instance_id,
                    instanceName:
                        channel === "instagram"
                            ? conv.instagram_instances?.account_name || "Instagram"
                            : conv.instances?.name || "—",
                    isOfficialApi: false,
                    createdAt: conv.created_at,
                    lastMessageAt: conv.last_message_at,
                    lastCustomerMessageAt: null,
                    finalizedAt: d.stage_changed_at,
                });
            });

            return { cards, finalizados, agentCounts };
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
