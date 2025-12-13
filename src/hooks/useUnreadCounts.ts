import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export const useUnreadCounts = (userId?: string) => {
    const queryClient = useQueryClient();

    const { data: counts = { people: 0, groups: 0 } } = useQuery({
        queryKey: ["unread-counts", userId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("conversations")
                .select("group_id, unread_count, status")
                .gt("unread_count", 0)
                .in("status", ["open", "pending"]);

            if (error) throw error;

            return (data as any[]).reduce(
                (acc, curr) => {
                    if (curr.group_id) {
                        acc.groups += curr.unread_count;
                    } else {
                        acc.people += curr.unread_count;

                        if (curr.status === 'open') {
                            acc.open += curr.unread_count;
                        } else if (curr.status === 'pending') {
                            acc.pending += curr.unread_count;
                        }
                    }
                    return acc;
                },
                { people: 0, groups: 0, open: 0, pending: 0 }
            );
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
