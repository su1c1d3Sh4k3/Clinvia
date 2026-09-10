import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { serviceDisplayName } from "@/lib/serviceDisplayName";

/**
 * Mapa `services_client.id` → "Serviço - Aplicação".
 *
 * Vendas, orçamentos, agendamentos e negociações guardam o nome da aplicação em
 * texto (snapshot). Para exibir o nome composto inclusive nas linhas antigas,
 * resolvemos pelo FK em tempo de leitura — o catálogo de um tenant tem dezenas
 * de linhas, então uma consulta única serve a tela inteira.
 */
export function useServiceDisplayNames() {
    const { data: ownerId } = useOwnerId();

    const query = useQuery({
        queryKey: ["service-display-names", ownerId],
        enabled: !!ownerId,
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<Record<string, string>> => {
            const { data, error } = await supabase
                .from("services_client" as any)
                .select("id, name, servico:service_name(name), categoria:services_category(category_type)")
                .eq("user_id", ownerId!);
            if (error) throw error;

            const map: Record<string, string> = {};
            for (const row of (data || []) as any[]) {
                const servico = Array.isArray(row.servico) ? row.servico[0] : row.servico;
                const categoria = Array.isArray(row.categoria) ? row.categoria[0] : row.categoria;
                map[row.id] = serviceDisplayName({
                    serviceName: servico?.name,
                    applicationName: row.name,
                    categoryType: categoria?.category_type,
                });
            }
            return map;
        },
    });

    const map = query.data;

    /** Nome composto do procedimento; cai no snapshot quando o serviço foi excluído. */
    const resolveServiceName = useCallback(
        (serviceClientId?: string | null, fallback?: string | null): string => {
            const composed = serviceClientId ? map?.[serviceClientId] : undefined;
            return composed || (fallback || "").trim();
        },
        [map],
    );

    return { resolveServiceName, isLoading: query.isLoading };
}
