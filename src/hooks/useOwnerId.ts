import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook para obter o owner_id (ID do admin/dono da conta) do usuário logado.
 * 
 * Para admins: owner_id = auth.uid()
 * Para membros de equipe: owner_id = team_members.user_id (que é o ID do admin)
 * 
 * Uso: Todas as queries que precisam filtrar por user_id devem usar este hook
 * ao invés de usar diretamente auth.uid() ou user?.id
 */
export function useOwnerId() {
    return useQuery({
        queryKey: ["owner-id"],
        queryFn: async () => {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) return null;

            // Primeiro tenta buscar por auth_user_id (membros de equipe)
            const { data: memberByAuth } = await supabase
                .from("team_members" as any)
                .select("user_id")
                .eq("auth_user_id", userData.user.id)
                .maybeSingle();

            if ((memberByAuth as any)?.user_id) {
                return (memberByAuth as any).user_id as string;
            }

            // Fallback: busca por user_id onde role = admin
            const { data: adminMember } = await supabase
                .from("team_members" as any)
                .select("user_id")
                .eq("user_id", userData.user.id)
                .eq("role", "admin")
                .maybeSingle();

            if ((adminMember as any)?.user_id) {
                return (adminMember as any).user_id as string;
            }

            // Último fallback: retorna o próprio auth.uid()
            return userData.user.id;
        },
        staleTime: 1000 * 60 * 10, // Cache por 10 minutos
    });
}
