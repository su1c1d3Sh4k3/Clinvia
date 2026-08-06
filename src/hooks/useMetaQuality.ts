import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MetaQualityInstance {
    instance_id: string;
    instance_name: string | null;
    quality_rating?: "GREEN" | "YELLOW" | "RED" | "NA";
    messaging_limit_tier?: string | null;
    tier_limit?: number | null;
    display_phone_number?: string | null;
    verified_name?: string | null;
    throughput_level?: string | null;
    used_24h?: number | null;
    window_resets_at?: string | null;
    error?: string;
}

/** Consulta a Graph API (via edge fn) a cada carregamento da página. */
export function useMetaQuality() {
    return useQuery({
        queryKey: ["meta-quality-status"],
        queryFn: async (): Promise<MetaQualityInstance[]> => {
            const { data, error } = await supabase.functions.invoke("meta-quality-status", {
                body: {},
            });
            if (error) throw error;
            return (data?.instances || []) as MetaQualityInstance[];
        },
        staleTime: 0,
        refetchOnMount: "always",
        retry: 1,
    });
}
