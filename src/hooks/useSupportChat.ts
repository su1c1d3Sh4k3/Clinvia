// @ts-nocheck - support_tickets/support_messages ainda não estão nos types gerados
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupportMessage, SupportTicket } from "@/types/support";

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

/** Badge do botão flutuante: respostas do suporte ou da IA ainda não vistas. */
export function useSupportUnread(tickets: SupportTicket[]) {
    const [lastSeen, setLastSeen] = useState<number>(() => readLastSeen());

    const markSeen = useCallback(() => {
        const now = new Date().toISOString();
        localStorage.setItem(LAST_SEEN_KEY, now);
        setLastSeen(Date.parse(now));
    }, []);

    const unread = tickets.filter(
        (t) =>
            (t.last_sender_type === "support" || t.last_sender_type === "ai") &&
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

/**
 * Fala com o assistente de 1º nível (edge fn support-ai-chat).
 * Sem ticketId, a própria função abre o chamado na 1ª mensagem.
 */
export function useSendToAi() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ ticketId, message }: { ticketId?: string | null; message: string }) => {
            const { data, error } = await supabase.functions.invoke("support-ai-chat", {
                body: { ticketId: ticketId ?? undefined, message },
            });
            if (error) {
                // erro HTTP: o corpo traz a mensagem humana do contrato de erros
                const detail = await (error as any)?.context?.json?.().catch(() => null);
                throw new Error(detail?.message || error.message || "Não foi possível falar com o assistente");
            }
            if (data && data.success === false) throw new Error(data.message || "Não foi possível falar com o assistente");
            return data as { ticket_id: string; transferred: boolean; handled_by: string; message: SupportMessage };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["support-messages", data.ticket_id] });
            queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
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
