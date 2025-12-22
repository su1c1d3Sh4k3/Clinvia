import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export const useUnreadCounts = (userId?: string, channel?: "whatsapp" | "instagram") => {
    const queryClient = useQueryClient();

    const { data: counts = { people: 0, groups: 0, open: 0, pending: 0, whatsapp: { people: 0, groups: 0, open: 0, pending: 0 }, instagram: { people: 0, groups: 0, open: 0, pending: 0 } } } = useQuery({
        queryKey: ["unread-counts", userId, channel],
        queryFn: async () => {
            const query = supabase
                .from("conversations")
                .select("group_id, unread_count, status, channel")
                .gt("unread_count", 0)
                .in("status", ["open", "pending"]);

            const { data, error } = await query;

            if (error) throw error;

            // Calculate counts with channel breakdown
            const result = (data as any[]).reduce(
                (acc, curr) => {
                    const convChannel = curr.channel || "whatsapp";

                    if (curr.group_id) {
                        acc.groups += curr.unread_count;
                        if (convChannel === "whatsapp") {
                            acc.whatsapp.groups += curr.unread_count;
                        } else if (convChannel === "instagram") {
                            acc.instagram.groups += curr.unread_count;
                        }
                    } else {
                        acc.people += curr.unread_count;
                        if (convChannel === "whatsapp") {
                            acc.whatsapp.people += curr.unread_count;
                        } else if (convChannel === "instagram") {
                            acc.instagram.people += curr.unread_count;
                        }

                        if (curr.status === 'open') {
                            acc.open += curr.unread_count;
                            if (convChannel === "whatsapp") {
                                acc.whatsapp.open += curr.unread_count;
                            } else if (convChannel === "instagram") {
                                acc.instagram.open += curr.unread_count;
                            }
                        } else if (curr.status === 'pending') {
                            acc.pending += curr.unread_count;
                            if (convChannel === "whatsapp") {
                                acc.whatsapp.pending += curr.unread_count;
                            } else if (convChannel === "instagram") {
                                acc.instagram.pending += curr.unread_count;
                            }
                        }
                    }
                    return acc;
                },
                {
                    people: 0, groups: 0, open: 0, pending: 0,
                    whatsapp: { people: 0, groups: 0, open: 0, pending: 0 },
                    instagram: { people: 0, groups: 0, open: 0, pending: 0 }
                }
            );

            return result;
        },
        enabled: !!userId,
    });

    useEffect(() => {
        const channel = supabase
            .channel("unread-counts-changes")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "conversations",
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    return counts;
};
