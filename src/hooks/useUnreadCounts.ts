import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";

export interface UnreadConvRow {
    group_id: string | null;
    unread_count: number;
    status: string;
    channel: string | null;
    queue_id: string | null;
    instance_id: string | null;
    assigned_agent_id: string | null;
    contacts: {
        id: string;
        contact_tags: { tag_id: string }[];
        crm: { stage: string; is_active: boolean }[];
    } | null;
}

/**
 * Linhas de conversas open/pending com unread_count > 0, com os campos usados
 * pelos Filtros Avançados do inbox (fila/tag/instância/usuário/etapa). Os balões de
 * notificação das abas Abertos/Pendentes/Grupos são calculados no consumidor
 * aplicando os MESMOS filtros da lista — regra do usuário: o balão sempre se
 * adapta ao filtro aplicado.
 */
export const useUnreadCounts = (userId?: string) => {
    const queryClient = useQueryClient();

    const { data: rows = [] } = useQuery({
        queryKey: ["unread-counts", userId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("conversations")
                .select("group_id, unread_count, status, channel, queue_id, instance_id, assigned_agent_id, contacts(id, contact_tags(tag_id), crm:crm_client(stage, is_active))")
                .gt("unread_count", 0)
                .in("status", ["open", "pending"])
                .limit(5000);

            if (error) throw error;
            return (data || []) as unknown as UnreadConvRow[];
        },
        enabled: !!userId,
        // 30s de cache. O realtime já invalida imediatamente quando uma
        // conversation muda (nova msg, marcar como lida) — o staleTime evita
        // refetch redundante em re-mounts (troca de tab/canal) que não
        // mudaram o estado real.
        staleTime: 30_000,
    });

    // PERF: throttle leading-edge (5s) — em tenants de alto volume conversations
    // muda ~5x/min; invalidar em toda mudança gerava refetch contínuo. O 1º
    // evento invalida na hora (feedback imediato do balão), os seguintes na
    // mesma janela agrupam num único refetch no fim dela.
    const throttleRef = useRef<{ last: number; trailing: ReturnType<typeof setTimeout> | null }>({
        last: 0,
        trailing: null,
    });

    useEffect(() => {
        const THROTTLE_MS = 5_000;
        const invalidate = () => {
            throttleRef.current.last = Date.now();
            queryClient.invalidateQueries({ queryKey: ["unread-counts"] });
        };

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
                    const t = throttleRef.current;
                    const elapsed = Date.now() - t.last;
                    if (elapsed >= THROTTLE_MS) {
                        invalidate();
                    } else if (!t.trailing) {
                        t.trailing = setTimeout(() => {
                            throttleRef.current.trailing = null;
                            invalidate();
                        }, THROTTLE_MS - elapsed);
                    }
                }
            )
            .subscribe();

        return () => {
            if (throttleRef.current.trailing) {
                clearTimeout(throttleRef.current.trailing);
                throttleRef.current.trailing = null;
            }
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    return rows;
};
