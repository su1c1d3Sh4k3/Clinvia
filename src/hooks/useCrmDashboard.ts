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

export interface CrmStageDeal {
    deal_id: string;
    contact_id: string;
    contact_name: string;
    contact_number: string | null;
    stage_changed_at: string;
    deal_value: number;
    services_count: number;
    services_label: string | null;
    conversation_id: string | null;
    ticket_id: string | null;
    conversation_started_at: string | null;
    conversation_ended_at: string | null;
    conversation_status: string | null;
    agent_name: string | null;
    sender_names: string | null;
    is_ai_handled: boolean;
    message_count: number;
}

/**
 * Negociações por trás de um card da aba CRM: uma linha por negociação que
 * entrou na etapa dentro do período, com os dados do ticket que estava em
 * andamento na hora da mudança. `stage` nulo desliga a query.
 */
export function useCrmStageDeals(stage: string | null, range: CrmRange, channelId?: string | null) {
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    return useQuery({
        queryKey: ["crm-stage-deals", stage, startIso, endIso, channelId ?? "todos"],
        queryFn: async (): Promise<CrmStageDeal[]> => {
            const { data, error } = await supabase.rpc("get_crm_stage_deals" as any, {
                p_stage: stage,
                p_start: startIso,
                p_end: endIso,
                p_channel: channelId || null,
            });
            if (error) throw error;
            return (data || []) as CrmStageDeal[];
        },
        enabled: !!stage,
    });
}
