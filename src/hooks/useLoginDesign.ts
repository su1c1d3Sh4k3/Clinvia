import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LoginDesign {
    image_url: string | null;
    link_url: string | null;
}

/**
 * Banner opcional da tela de login (configurado em /admin?tab=design-login).
 * A linha e unica e legivel por anon — a tela de login roda sem sessao.
 */
export function useLoginDesign() {
    return useQuery<LoginDesign>({
        queryKey: ["login-design"],
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("login_design" as any)
                .select("image_url, link_url")
                .maybeSingle();
            if (error) throw error;
            return {
                image_url: (data as any)?.image_url ?? null,
                link_url: (data as any)?.link_url ?? null,
            };
        },
    });
}

/** Tamanho recomendado do banner — retrato, porque ele ocupa metade da tela. */
export const LOGIN_BANNER_SIZE = { width: 1200, height: 1600 };
export const LOGIN_BANNER_SIZE_LABEL = `${LOGIN_BANNER_SIZE.width} x ${LOGIN_BANNER_SIZE.height} px`;
