import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

/**
 * Tamanho do slot da conta (`ia_config.slot_minutes`, default 10).
 * Espelha o `getSlotSettings` de `_shared/slot-settings.ts`, mas aqui é só
 * leitura para exibição — o encaixe manual na agenda continua livre.
 */
export function useSlotMinutes() {
    const { data: ownerId } = useOwnerId();

    return useQuery({
        queryKey: ["ia-slot-minutes", ownerId],
        enabled: !!ownerId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("ia_config" as any)
                .select("slot_minutes")
                .eq("user_id", ownerId)
                .maybeSingle();
            if (error) throw error;
            return Number((data as any)?.slot_minutes) || 10;
        },
        staleTime: 1000 * 60 * 30,
    });
}
