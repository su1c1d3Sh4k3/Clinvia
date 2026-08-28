// @ts-nocheck - support_tickets/support_messages ainda não estão nos types gerados
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import type { SupportMessage, SupportPriority, SupportTicket } from "@/types/support";

const LAST_SEEN_KEY = "clinvia:support-last-seen";

const readLastSeen = (): number => {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isNaN(parsed) ? 0 : parsed;
};

/** Nome exibido como autor das mensagens do cliente. */
export function useSupportSenderName() {
    const query = useQuery({
        queryKey: ["support-sender-name"],
        staleTime: 1000 * 60 * 30,
        queryFn: async () => {
            const { data: auth } = await supabase.auth.getUser();
            const user = auth?.user;
            if (!user) return "Cliente";

            const { data: member } = await supabase
                .from("team_members")
                .select("name")
                .eq("auth_user_id", user.id)
                .maybeSingle();
            if (member?.name) return member.name as string;

            const { data: profile } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", user.id)
                .maybeSingle();
            return (profile?.full_name as string) || user.email || "Cliente";
        },
    });

    return query.data || "Cliente";
}

/** Chamados do tenant logado (lista do widget e da página /support). */
export function useMyTickets() {
    const queryClient = useQueryClient();

    const query = useQuery<SupportTicket[]>({
        queryKey: ["my-support-tickets"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("support_tickets")
                .select("*")
                .order("last_message_at", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false });
            if (error) throw error;
            return (data || []) as SupportTicket[];
        },
    });

    useEffect(() => {
        const channel = supabase
            .channel("client-support-tickets")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "support_tickets" },
                () => queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] })
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    return query;
}

/** Badge do botão flutuante: respostas do suporte ainda não vistas. */
export function useSupportUnread(tickets: SupportTicket[]) {
    const [lastSeen, setLastSeen] = useState<number>(() => readLastSeen());

    const markSeen = useCallback(() => {
        const now = new Date().toISOString();
        localStorage.setItem(LAST_SEEN_KEY, now);
        setLastSeen(Date.parse(now));
    }, []);

    const unread = tickets.filter(
        (t) =>
            t.last_sender_type === "support" &&
            t.last_message_at &&
            Date.parse(t.last_message_at) > lastSeen
    ).length;

    return { unread, markSeen };
}

/** Thread de um chamado + realtime. */
export function useTicketMessages(ticketId: string | null) {
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
            .channel(`client-support-messages-${ticketId}`)
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

/** Abre um chamado novo: cria o ticket e grava o relato como 1ª mensagem. */
export function useCreateTicket() {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();

    return useMutation({
        mutationFn: async ({
            title,
            description,
            priority,
            creatorName,
        }: {
            title: string;
            description: string;
            priority: SupportPriority;
            creatorName: string;
        }) => {
            const { data: auth } = await supabase.auth.getUser();
            const { data: ticket, error } = await supabase
                .from("support_tickets")
                .insert({
                    user_id: ownerId,
                    auth_user_id: auth?.user?.id,
                    title,
                    description,
                    priority,
                    status: "open",
                    creator_name: creatorName,
                })
                .select()
                .single();
            if (error) throw error;

            const { error: msgError } = await supabase.from("support_messages").insert({
                ticket_id: ticket.id,
                sender_type: "client",
                sender_auth_user_id: auth?.user?.id ?? null,
                sender_name: creatorName,
                body: description,
            });
            if (msgError) throw msgError;

            return ticket as SupportTicket;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
            queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
        },
    });
}

/** Envia mensagem do cliente na thread. */
export function useSendTicketMessage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            ticketId,
            body,
            senderName,
        }: {
            ticketId: string;
            body: string;
            senderName: string;
        }) => {
            const { data: auth } = await supabase.auth.getUser();
            const { error } = await supabase.from("support_messages").insert({
                ticket_id: ticketId,
                sender_type: "client",
                sender_auth_user_id: auth?.user?.id ?? null,
                sender_name: senderName,
                body,
            });
            if (error) throw error;
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ["support-messages", vars.ticketId] });
            queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
        },
    });
}
