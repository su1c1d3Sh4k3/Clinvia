// @ts-nocheck - support_tickets/support_messages ainda não estão nos types gerados
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupportMessage, SupportPriority, SupportStatus, SupportTicket } from "@/types/support";

export interface SupportInboxTicket extends SupportTicket {
    company_name: string | null;
    owner_name: string | null;
    owner_email: string | null;
    unread_count: number;
    last_preview: string | null;
}

/** Lista de chamados do painel admin (todos os tenants). */
export function useSupportTickets() {
    const queryClient = useQueryClient();

    const query = useQuery<SupportInboxTicket[]>({
        queryKey: ["admin-support-tickets"],
        queryFn: async () => {
            const { data: tickets, error } = await supabase
                .from("support_tickets")
                .select("*")
                .order("last_message_at", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
                .limit(300);
            if (error) throw error;
            const rows = (tickets || []) as SupportTicket[];
            if (rows.length === 0) return [];

            const userIds = [...new Set(rows.map((t) => t.user_id).filter(Boolean))];
            const ticketIds = rows.map((t) => t.id);

            const [{ data: profiles }, { data: messages }] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("id, company_name, full_name, email")
                    .in("id", userIds),
                supabase
                    .from("support_messages")
                    .select("ticket_id, body, sender_type, read_at, created_at")
                    .in("ticket_id", ticketIds)
                    .order("created_at", { ascending: true }),
            ]);

            const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
            const unread = new Map<string, number>();
            const preview = new Map<string, string>();
            for (const m of (messages || []) as any[]) {
                preview.set(m.ticket_id, m.body);
                if (m.sender_type === "client" && !m.read_at) {
                    unread.set(m.ticket_id, (unread.get(m.ticket_id) || 0) + 1);
                }
            }

            return rows.map((t) => {
                const profile = profileMap.get(t.user_id) as any;
                return {
                    ...t,
                    company_name: profile?.company_name ?? null,
                    owner_name: profile?.full_name ?? null,
                    owner_email: profile?.email ?? null,
                    unread_count: unread.get(t.id) || 0,
                    last_preview: preview.get(t.id) ?? t.client_summary ?? t.description ?? null,
                };
            });
        },
    });

    // realtime global: qualquer mensagem nova recarrega a lista (badge/prévia/ordem)
    useEffect(() => {
        const channel = supabase
            .channel("admin-support-inbox")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "support_messages" },
                () => queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] })
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "support_tickets" },
                () => queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] })
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    return query;
}

/** Thread de mensagens de um chamado + realtime filtrado. */
export function useSupportMessages(ticketId: string | null) {
    const queryClient = useQueryClient();
    const queryKey = ["support-messages", ticketId];

    const query = useQuery<SupportMessage[]>({
        queryKey,
        enabled: !!ticketId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("support_messages")
                .select("*")
                .eq("ticket_id", ticketId)
                .order("created_at", { ascending: true });
            if (error) throw error;
            return (data || []) as SupportMessage[];
        },
    });

    useEffect(() => {
        if (!ticketId) return;
        const channel = supabase
            .channel(`support-messages-${ticketId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "support_messages",
                    filter: `ticket_id=eq.${ticketId}`,
                },
                (payload) => {
                    const row = payload.new as SupportMessage;
                    queryClient.setQueryData<SupportMessage[]>(queryKey, (old) => {
                        if (!old) return [row];
                        if (old.some((m) => m.id === row.id)) return old;
                        return [...old, row];
                    });
                }
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticketId, queryClient]);

    return query;
}

interface SendArgs {
    ticketId: string;
    body: string;
    senderName: string;
}

/** Envia mensagem como suporte (painel admin). */
export function useSendSupportMessage() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ticketId, body, senderName }: SendArgs) => {
            const { data: auth } = await supabase.auth.getUser();
            const { error } = await supabase.from("support_messages").insert({
                ticket_id: ticketId,
                sender_type: "support",
                sender_auth_user_id: auth?.user?.id ?? null,
                sender_name: senderName,
                body,
            });
            if (error) throw error;
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ["support-messages", vars.ticketId] });
            queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
        },
    });
}

/** Status / prioridade / atribuição do chamado. */
export function useUpdateSupportTicket() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            ticketId,
            status,
            priority,
            assignedAdminId,
        }: {
            ticketId: string;
            status?: SupportStatus;
            priority?: SupportPriority;
            assignedAdminId?: string | null;
        }) => {
            const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (status) patch.status = status;
            if (priority) patch.priority = priority;
            if (assignedAdminId !== undefined) patch.assigned_admin_id = assignedAdminId;
            const { error } = await supabase.from("support_tickets").update(patch).eq("id", ticketId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
        },
    });
}

/** Marca como lidas as mensagens do cliente ao abrir a thread. */
export function useMarkSupportRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ticketId: string) => {
            const { error } = await supabase
                .from("support_messages")
                .update({ read_at: new Date().toISOString() })
                .eq("ticket_id", ticketId)
                .eq("sender_type", "client")
                .is("read_at", null);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
        },
    });
}
