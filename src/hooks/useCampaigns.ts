import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

const SUPABASE_URL = "https://swfshqvvbohnahdyndch.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTAyMzIsImV4cCI6MjA3OTE2NjIzMn0.rUja2PsYj9kWODdizhJNS6HjfA9Tg7DrJJylUH8RTnY";

async function callCampaignApi(body: any): Promise<any> {
    let token = SUPABASE_ANON_KEY;
    try {
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.access_token) token = session.access_token;
    } catch { /* usa anon */ }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/campaign-manage`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
    });
    const text = await resp.text();
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Resposta inválida: ${text.substring(0, 200)}`);
    }
    if (!resp.ok || !data.success) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    return data;
}

/** Sincroniza os templates de uma instância com a Meta (Graph API → message_templates). */
async function syncInstanceTemplates(ownerId: string, instanceId: string): Promise<void> {
    let token = SUPABASE_ANON_KEY;
    try {
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.access_token) token = session.access_token;
    } catch { /* usa anon */ }
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/meta-template-manage`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: "sync", user_id: ownerId, instance_id: instanceId }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data?.error || `HTTP ${resp.status}`);
}

export interface CampaignService {
    id: string;
    name: string;
    price: number | null;
}

export interface Campaign {
    id: string;
    user_id: string;
    instance_id: string | null;
    name: string;
    source_type: "csv" | "xml" | "crm" | "tag" | "appointments" | "sales";
    source_config: any;
    scheduled_at: string;
    valid_until: string;
    services: CampaignService[];
    discount_pct: number | null;
    initial_message: string;
    variable_map: string[];
    objective: string;
    ai_prompt: string | null;
    ia_enabled: boolean;
    tag_id: string | null;
    template_id: string | null;
    template_name: string | null;
    template_version: number;
    status: "scheduled" | "awaiting_template" | "dispatching" | "dispatched" | "error" | "cancelled" | "expired";
    error_message: string | null;
    created_at: string;
    updated_at: string;
    // Enriquecidos client-side
    template_status?: string | null;
    template_rejection_reason?: string | null;
    contact_counts?: Record<string, number>;
    total_contacts?: number;
}

export interface CampaignContactRow {
    id: string;
    campaign_id: string;
    contact_id: string | null;
    raw_data: any;
    status: "pending" | "sending" | "sent" | "failed" | "invalid" | "skipped";
    error: string | null;
    sent_at: string | null;
    contact?: { push_name: string | null; number: string | null; phone: string | null } | null;
}

export function useCampaigns() {
    const { data: ownerId } = useOwnerId();

    return useQuery({
        queryKey: ["campaigns", ownerId],
        queryFn: async (): Promise<Campaign[]> => {
            const { data: campaigns, error } = await supabase
                .from("campaigns" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            const list = (campaigns || []) as unknown as Campaign[];
            if (list.length === 0) return [];

            // Sync com a Meta antes de ler status (mesmo padrão da página Templates,
            // que consulta a Graph API a cada listagem) — só instâncias com campanha ativa
            const activeInstanceIds = [
                ...new Set(
                    list
                        .filter(
                            (c) =>
                                c.instance_id &&
                                c.template_name &&
                                ["scheduled", "awaiting_template", "dispatching"].includes(c.status)
                        )
                        .map((c) => c.instance_id as string)
                ),
            ];
            if (activeInstanceIds.length > 0) {
                await Promise.allSettled(
                    activeInstanceIds.map((id) => syncInstanceTemplates(ownerId!, id))
                );
            }

            // Status dos templates (join manual: instance_id + name)
            const templateNames = list.map((c) => c.template_name).filter(Boolean) as string[];
            const templateMap = new Map<string, { status: string; rejection_reason: string | null }>();
            if (templateNames.length > 0) {
                const { data: tpls } = await supabase
                    .from("message_templates" as any)
                    .select("instance_id, name, status, rejection_reason")
                    .in("name", templateNames);
                for (const t of (tpls || []) as any[]) {
                    templateMap.set(`${t.instance_id}:${t.name}`, {
                        status: t.status,
                        rejection_reason: t.rejection_reason,
                    });
                }
            }

            // Contagem de contatos por status
            const { data: ccRows } = await supabase
                .from("campaign_contacts" as any)
                .select("campaign_id, status")
                .in("campaign_id", list.map((c) => c.id));
            const countMap = new Map<string, Record<string, number>>();
            for (const r of (ccRows || []) as any[]) {
                const counts = countMap.get(r.campaign_id) || {};
                counts[r.status] = (counts[r.status] || 0) + 1;
                countMap.set(r.campaign_id, counts);
            }

            return list.map((c) => {
                const tpl = c.template_name ? templateMap.get(`${c.instance_id}:${c.template_name}`) : undefined;
                const counts = countMap.get(c.id) || {};
                return {
                    ...c,
                    template_status: tpl?.status ?? null,
                    template_rejection_reason: tpl?.rejection_reason ?? null,
                    contact_counts: counts,
                    total_contacts: Object.values(counts).reduce((a, b) => a + b, 0),
                };
            });
        },
        enabled: !!ownerId,
        refetchInterval: 60_000,
    });
}

export function useCampaignContacts(campaignId: string | null) {
    return useQuery({
        queryKey: ["campaign-contacts", campaignId],
        queryFn: async (): Promise<CampaignContactRow[]> => {
            const { data, error } = await supabase
                .from("campaign_contacts" as any)
                .select("id, campaign_id, contact_id, raw_data, status, error, sent_at, contact:contacts(push_name, number, phone)")
                .eq("campaign_id", campaignId)
                .order("created_at", { ascending: true });
            if (error) throw error;
            return (data || []) as unknown as CampaignContactRow[];
        },
        enabled: !!campaignId,
    });
}

/** Instâncias Meta conectadas (únicas permitidas para campanhas). */
export function useMetaInstances() {
    return useQuery({
        queryKey: ["campaigns-meta-instances"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instances")
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return ((data || []) as any[]).filter(
                (i) =>
                    (i.provider === "meta" || (i.instance_name || "").startsWith("meta-")) &&
                    i.status === "connected"
            );
        },
        staleTime: 30_000,
    });
}

export function useCampaignMutations() {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["campaign-contacts"] });
    };

    const createCampaign = useMutation({
        mutationFn: async (payload: any) => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            return callCampaignApi({ action: "create", user_id: ownerId, ...payload });
        },
        onSuccess: invalidate,
    });

    const updateCampaign = useMutation({
        mutationFn: async ({ campaignId, ...payload }: any) => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            return callCampaignApi({ action: "update", user_id: ownerId, campaign_id: campaignId, ...payload });
        },
        onSuccess: invalidate,
    });

    const deleteCampaign = useMutation({
        mutationFn: async (campaignId: string) => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            return callCampaignApi({ action: "delete", user_id: ownerId, campaign_id: campaignId });
        },
        onSuccess: invalidate,
    });

    const recreateTemplate = useMutation({
        mutationFn: async (campaignId: string): Promise<string> => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            const data = await callCampaignApi({
                action: "recreate_template",
                user_id: ownerId,
                campaign_id: campaignId,
            });
            return data.suggestion as string;
        },
    });

    const regeneratePrompt = useMutation({
        mutationFn: async (campaignId: string) => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            return callCampaignApi({ action: "regenerate_prompt", user_id: ownerId, campaign_id: campaignId });
        },
        onSuccess: invalidate,
    });

    /** Força sync dos templates da instância com a Meta e recarrega campanhas. */
    const syncTemplates = useMutation({
        mutationFn: async (instanceId: string) => {
            if (!ownerId) throw new Error("Usuário não autenticado");
            await syncInstanceTemplates(ownerId, instanceId);
        },
        onSuccess: invalidate,
    });

    return { createCampaign, updateCampaign, deleteCampaign, recreateTemplate, regeneratePrompt, syncTemplates };
}
