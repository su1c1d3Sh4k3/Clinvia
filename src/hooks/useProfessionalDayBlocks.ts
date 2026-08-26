import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

/**
 * Dias com a agenda fechada (tabela professional_day_blocks).
 * A presença da linha bloqueia TODOS os horários daquele profissional na data —
 * agenda, modal de agendamento e APIs consultam a mesma tabela.
 */
export function useProfessionalDayBlocks(date: Date | undefined) {
    const { data: ownerId } = useOwnerId();
    const dateStr = date ? format(date, "yyyy-MM-dd") : null;

    const query = useQuery({
        queryKey: ["professional-day-blocks", dateStr],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("professional_day_blocks" as any)
                .select("professional_id")
                .eq("block_date", dateStr);
            if (error) throw error;
            return (data as any[]).map((r) => r.professional_id as string);
        },
        enabled: !!dateStr,
    });

    const queryClient = useQueryClient();

    const toggle = useMutation({
        mutationFn: async ({ professionalId, block }: { professionalId: string; block: boolean }) => {
            if (!dateStr) throw new Error("Data inválida");
            if (block) {
                const { error } = await supabase
                    .from("professional_day_blocks" as any)
                    .insert({ user_id: ownerId, professional_id: professionalId, block_date: dateStr });
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("professional_day_blocks" as any)
                    .delete()
                    .eq("professional_id", professionalId)
                    .eq("block_date", dateStr);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["professional-day-blocks"] });
        },
    });

    return {
        blockedIds: query.data ?? [],
        isLoading: query.isLoading,
        toggleBlock: toggle.mutateAsync,
        isToggling: toggle.isPending,
    };
}
