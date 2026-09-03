import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CrmStageMovement {
    stage: string;
    total: number;
    open_count: number;
    pending_count: number;
    resolved_count: number;
    value_sum: number;
}

export interface CrmRange {
    start: Date;
    end: Date;
}

/**
 * Movimentação do CRM no período: negociações cuja última mudança de etapa
 * caiu na janela, agrupadas pela etapa em que estão (com o desdobramento por
 * status da conversa atual e a soma dos valores).
 * `channelId` restringe ao funil de uma conexão.
 */
export function useCrmStageMovement(range: CrmRange, channelId?: string | null) {
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    return useQuery({
        queryKey: ["crm-stage-movement", startIso, endIso, channelId ?? "todos"],
        queryFn: async (): Promise<CrmStageMovement[]> => {
            const { data, error } = await supabase.rpc("get_crm_stage_movement" as any, {
                p_start: startIso,
                p_end: endIso,
                p_channel: channelId || null,
            });
            if (error) throw error;
            return (data || []) as CrmStageMovement[];
        },
        refetchInterval: 60_000,
    });
}
