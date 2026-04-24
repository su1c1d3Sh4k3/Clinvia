import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

export interface AppointmentGoal {
    id: string;
    user_id: string;
    month: number;  // 1-12
    year: number;
    target: number;
    created_at: string;
    updated_at: string;
}

/**
 * Lê a meta de agendamentos para um mês/ano específico.
 * Retorna null se não houver meta configurada.
 */
export function useAppointmentGoal(month: number, year: number) {
    const { data: ownerId } = useOwnerId();

    return useQuery<AppointmentGoal | null>({
        queryKey: ["appointment_goal", ownerId, year, month],
        queryFn: async () => {
            if (!ownerId) return null;
            const { data, error } = await supabase
                .from("appointment_goals" as any)
                .select("*")
                .eq("user_id", ownerId)
                .eq("month", month)
                .eq("year", year)
                .maybeSingle();
            if (error) throw error;
            return (data as AppointmentGoal | null) ?? null;
        },
        enabled: !!ownerId,
        staleTime: 1000 * 60 * 5,
    });
}

/**
 * Leitura conveniente da meta do mês corrente.
 */
export function useCurrentMonthGoal() {
    const now = new Date();
    return useAppointmentGoal(now.getMonth() + 1, now.getFullYear());
}

/**
 * Mutation para definir/atualizar a meta de um mês/ano (upsert).
 */
export function useSetAppointmentGoal() {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: { month: number; year: number; target: number }) => {
            if (!ownerId) throw new Error("Owner ID não disponível");
            const { data, error } = await supabase
                .from("appointment_goals" as any)
                .upsert(
                    {
                        user_id: ownerId,
                        month: params.month,
                        year: params.year,
                        target: params.target,
                    },
                    { onConflict: "user_id,month,year" },
                )
                .select()
                .single();
            if (error) throw error;
            return data as AppointmentGoal;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: ["appointment_goal", ownerId, variables.year, variables.month],
            });
            queryClient.invalidateQueries({ queryKey: ["report-data"] });
        },
    });
}
