import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import type { OrcamentoPdfBranding } from "@/lib/orcamentoPdf";

/**
 * Cabeçalho/rodapé do orçamento em PDF (Configurações > Empresa).
 * Escopo é a CONTA, então lê o profile do dono, não o do colaborador logado.
 */
export function useOrcamentoBranding() {
    const { data: ownerId } = useOwnerId();

    return useQuery({
        queryKey: ["orcamento-branding", ownerId],
        enabled: !!ownerId,
        staleTime: 1000 * 60 * 5,
        queryFn: async (): Promise<OrcamentoPdfBranding> => {
            const { data, error } = await supabase
                .from("profiles")
                .select("orcamento_header_url, orcamento_footer_text, company_name, phone")
                .eq("id", ownerId!)
                .maybeSingle();

            if (error) throw error;

            const row = (data || {}) as Record<string, string | null>;
            return {
                headerUrl: row.orcamento_header_url ?? null,
                footerText: row.orcamento_footer_text ?? null,
                companyName: row.company_name ?? null,
                companyPhone: row.phone ?? null,
            };
        },
    });
}
