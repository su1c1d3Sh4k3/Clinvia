// Avisos publicados no painel admin (/admin?tab=atualizacoes).
// Fonte única para a página /reports e para a aba "Avisos" do widget de suporte.
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UpdateType = "update" | "improvement" | "fix" | "alert";

export interface SystemUpdate {
    id: string;
    type: UpdateType;
    title: string;
    content: string;
    affected_areas: string[];
    impact_level: number;
    published_at: string;
}

export function useSystemUpdates() {
    return useQuery<SystemUpdate[]>({
        queryKey: ["system-updates"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("system_updates" as any)
                .select("*")
                .order("published_at", { ascending: false });
            if (error) throw error;
            return (data || []) as unknown as SystemUpdate[];
        },
    });
}

/** Ids já lidos pela PESSOA logada (system_update_reads é por usuário). */
export function useReadUpdateIds() {
    const { user } = useAuth();

    return useQuery<string[]>({
        queryKey: ["system-update-reads", user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("system_update_reads" as any)
                .select("update_id")
                .eq("user_id", user!.id);
            if (error) throw error;
            return (data || []).map((r: any) => r.update_id as string);
        },
    });
}

/** Marca como lidos os avisos que ainda não foram vistos. */
export function useMarkUpdatesRead() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (updateIds: string[]) => {
            if (!user?.id || updateIds.length === 0) return;
            const rows = updateIds.map((id) => ({ update_id: id, user_id: user.id }));
            const { error } = await supabase
                .from("system_update_reads" as any)
                .upsert(rows, { onConflict: "update_id,user_id", ignoreDuplicates: true });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["system-update-reads"] });
        },
    });

    return mutation;
}

/** Quantidade de avisos não lidos — alimenta a bolinha do botão flutuante. */
export function useUnreadUpdates() {
    const { data: updates = [] } = useSystemUpdates();
    const { data: readIds = [] } = useReadUpdateIds();
    const markRead = useMarkUpdatesRead();

    const readSet = new Set(readIds);
    const unreadIds = updates.filter((u) => !readSet.has(u.id)).map((u) => u.id);

    const markAllRead = useCallback(() => {
        if (unreadIds.length > 0) markRead.mutate(unreadIds);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unreadIds.join(",")]);

    return { updates, unreadIds, unread: unreadIds.length, markAllRead };
}
