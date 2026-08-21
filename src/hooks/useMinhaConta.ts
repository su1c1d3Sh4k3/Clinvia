import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

// Hooks da aba "Minha Conta" (Dashboard, admin-only): conexões, status da IA e
// contadores de tickets/satisfação por atendente (migration 20260822120000).

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------

export interface MyConnection {
    id: string;
    name: string;
    kind: "meta" | "uazapi" | "instagram";
    status: string | null;
    phone_number?: string | null;
}

/** Meta = provider 'meta' ou instance_name 'meta-*' (padrão Connections.tsx) */
export const isMetaInstanceRow = (i: any) =>
    i?.provider === "meta" || (typeof i?.instance_name === "string" && i.instance_name.startsWith("meta-"));

export function useMyConnections() {
    return useQuery({
        queryKey: ["minha-conta-connections"],
        queryFn: async (): Promise<MyConnection[]> => {
            const [wpp, ig] = await Promise.all([
                supabase.from("instances").select("*").order("created_at", { ascending: false }),
                supabase.from("instagram_instances" as any).select("*").order("created_at", { ascending: false }),
            ]);
            if (wpp.error) throw wpp.error;
            if (ig.error) throw ig.error;

            const wppConns: MyConnection[] = (wpp.data || []).map((i: any) => ({
                id: i.id,
                name: i.instance_name || i.name || "Instância",
                kind: isMetaInstanceRow(i) ? "meta" : "uazapi",
                status: i.status ?? null,
                phone_number: i.phone_number ?? null,
            }));
            const igConns: MyConnection[] = ((ig.data as any[]) || []).map((i: any) => ({
                id: i.id,
                name: i.account_name || i.username || "Instagram",
                kind: "instagram",
                status: i.status ?? null,
            }));
            return [...wppConns, ...igConns];
        },
    });
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------

export interface MyIAStatus {
    agentName: string | null;
    companyName: string | null;
    iaOn: boolean;
    /** instâncias WhatsApp onde a IA está efetivamente ligada (ia_on && ia_on_wpp !== false) */
    activeInstances: { id: string; name: string }[];
}

export function useMyIAStatus() {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["minha-conta-ia", ownerId],
        enabled: !!ownerId,
        queryFn: async (): Promise<MyIAStatus> => {
            const [cfgRes, profRes, instRes] = await Promise.all([
                supabase.from("ia_config" as any).select("agent_name, name, ia_on").eq("user_id", ownerId!).maybeSingle(),
                supabase.from("profiles" as any).select("company_name").eq("id", ownerId!).maybeSingle(),
                supabase.from("instances").select("*"),
            ]);
            if (cfgRes.error) throw cfgRes.error;
            if (profRes.error) throw profRes.error;
            if (instRes.error) throw instRes.error;

            const cfg = cfgRes.data as any;
            const iaOn = cfg?.ia_on === true;
            const activeInstances = iaOn
                ? (instRes.data || [])
                    .filter((i: any) => i.ia_on_wpp !== false)
                    .map((i: any) => ({ id: i.id, name: i.instance_name || i.name || "Instância" }))
                : [];

            return {
                agentName: cfg?.agent_name || null,
                companyName: cfg?.name || (profRes.data as any)?.company_name || null,
                iaOn,
                activeInstances,
            };
        },
    });
}

// ---------------------------------------------------------------------------
// Colaboradores — tickets por atendente (RPC server-side, sem cap de linhas)
// ---------------------------------------------------------------------------

export interface AgentTicketCounts {
    open: number;
    pending: number;
    resolved: number;
}

export function useAgentTicketCounts(startISO: string, endISO: string) {
    return useQuery({
        queryKey: ["minha-conta-agent-tickets", startISO, endISO],
        queryFn: async (): Promise<Map<string, AgentTicketCounts>> => {
            const { data, error } = await (supabase.rpc as any)("get_agent_ticket_counts", {
                p_start: startISO,
                p_end: endISO,
            });
            if (error) throw error;
            const map = new Map<string, AgentTicketCounts>();
            for (const r of data || []) {
                map.set(String(r.team_member_id), {
                    open: Number(r.open_count) || 0,
                    pending: Number(r.pending_count) || 0,
                    resolved: Number(r.resolved_count) || 0,
                });
            }
            return map;
        },
    });
}

// ---------------------------------------------------------------------------
// Colaboradores — métricas de satisfação por atendente (RPC existente)
// ---------------------------------------------------------------------------

export interface SatisfactionAgent {
    id: string; // team_members.id::text ou 'ia'
    name: string;
    is_ai: boolean;
    avg_response_seconds: number | null;
    total_attendance_seconds: number | null;
    avg_sentiment: number | null;
    attendance_count: number;
}

export function useSatisfactionAgents(startISO: string, endISO: string) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["minha-conta-satisfaction-agents", ownerId, startISO, endISO],
        enabled: !!ownerId,
        queryFn: async (): Promise<SatisfactionAgent[]> => {
            const { data, error } = await (supabase.rpc as any)("get_satisfaction_dashboard", {
                p_owner: ownerId,
                p_start: startISO,
                p_end: endISO,
            });
            if (error) throw error;
            return ((data as any)?.agents || []) as SatisfactionAgent[];
        },
    });
}
