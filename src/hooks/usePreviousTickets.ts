import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PreviousTicket {
    id: string;
    ticketNumber: string;
    status: string;
    channelLabel: string;
    /** Atendente que encerrou; null = encerrado pela IA/automação */
    closedBy: string | null;
    openedAt: string | null;
    closedAt: string | null;
}

/** Quantos tickets do par (contato, conexão) o menu lateral lista. */
const MAX_TICKETS = 100;

/**
 * Tickets do MESMO contato na MESMA conexão da conversa aberta.
 *
 * USER RULE: cada instância é um workflow separado — se o cliente tem 3 tickets
 * na instância A e 5 na B, abrir um ticket da A lista só os 3 da A. Grupos
 * ficam de fora (estrutura à parte).
 */
export function usePreviousTickets(conversationId?: string) {
    return useQuery({
        queryKey: ["previous-tickets", conversationId],
        enabled: !!conversationId,
        staleTime: 60_000,
        queryFn: async (): Promise<PreviousTicket[]> => {
            const { data: conv, error: convError } = await supabase
                .from("conversations")
                .select("contact_id, group_id, instance_id, instagram_instance_id")
                .eq("id", conversationId!)
                .single();
            if (convError) throw convError;
            if (!conv?.contact_id || conv.group_id) return [];

            let query = supabase
                .from("conversations")
                .select("id, ticket_id, status, created_at, resolved_at, assigned_agent_id, instance_id, instagram_instance_id")
                .eq("contact_id", conv.contact_id)
                .is("group_id", null)
                .order("created_at", { ascending: false })
                .limit(MAX_TICKETS);

            // Mesma conexão (espelha conversation_channel_key do banco)
            if (conv.instance_id) {
                query = query.eq("instance_id", conv.instance_id);
            } else if (conv.instagram_instance_id) {
                query = query.eq("instagram_instance_id", conv.instagram_instance_id);
            } else {
                query = query.is("instance_id", null).is("instagram_instance_id", null);
            }

            const { data: rows, error } = await query;
            if (error) throw error;
            const tickets = rows || [];
            if (tickets.length === 0) return [];

            // Nome da conexão e do atendente em 2 lookups (evita depender do
            // nome das FKs nos embeds do PostgREST)
            const agentIds = [...new Set(tickets.map((t: any) => t.assigned_agent_id).filter(Boolean))];
            const wppIds = [...new Set(tickets.map((t: any) => t.instance_id).filter(Boolean))];
            const igIds = [...new Set(tickets.map((t: any) => t.instagram_instance_id).filter(Boolean))];

            const [agentsRes, wppRes, igRes] = await Promise.all([
                agentIds.length
                    ? supabase.from("team_members").select("id, name").in("id", agentIds as string[])
                    : Promise.resolve({ data: [] as any[] }),
                wppIds.length
                    ? supabase.from("instances").select("id, name").in("id", wppIds as string[])
                    : Promise.resolve({ data: [] as any[] }),
                igIds.length
                    ? supabase.from("instagram_instances").select("id, account_name").in("id", igIds as string[])
                    : Promise.resolve({ data: [] as any[] }),
            ]);

            const agentName = new Map((agentsRes.data || []).map((a: any) => [a.id, a.name]));
            const wppName = new Map((wppRes.data || []).map((i: any) => [i.id, i.name]));
            const igName = new Map((igRes.data || []).map((i: any) => [i.id, `${i.account_name} (Instagram)`]));

            return tickets.map((t: any) => ({
                id: t.id,
                ticketNumber: t.ticket_id ? `#${t.ticket_id}` : `#${String(t.id).slice(0, 8)}`,
                status: t.status,
                channelLabel:
                    (t.instance_id ? wppName.get(t.instance_id) : igName.get(t.instagram_instance_id)) ||
                    "Sem conexão",
                closedBy: t.assigned_agent_id ? agentName.get(t.assigned_agent_id) || null : null,
                openedAt: t.created_at,
                closedAt: t.resolved_at,
            }));
        },
    });
}
