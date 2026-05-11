import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Hook para obter o owner_id (ID do admin/dono da conta) do usuário logado.
 *
 * Para admins: owner_id = auth.uid()
 * Para membros de equipe: owner_id = team_members.user_id (que é o ID do admin)
 *
 * Esta versão usa RPC para garantir que o frontend retorne EXATAMENTE
 * o mesmo valor que o get_owner_id() usado nas RLS policies.
 *
 * IMPORTANTE: queryKey inclui user.id para evitar cache cruzado
 * quando outro usuário loga no mesmo navegador.
 */
export function useOwnerId() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ["owner-id", user?.id],
        queryFn: async () => {
            if (!user) return null;

            // Usa RPC que chama diretamente a função get_owner_id() do banco
            const { data: ownerId, error } = await supabase.rpc('get_my_owner_id');

            if (error) {
                console.error('[useOwnerId] RPC error, using fallback:', error);

                // Fallback: tenta buscar manualmente (para o caso do RPC não existir ainda)
                const { data: memberByAuth } = await supabase
                    .from("team_members" as any)
                    .select("user_id")
                    .eq("auth_user_id", user.id)
                    .maybeSingle();

                if ((memberByAuth as any)?.user_id) {
                    return (memberByAuth as any).user_id as string;
                }

                const { data: adminMember } = await supabase
                    .from("team_members" as any)
                    .select("user_id")
                    .eq("user_id", user.id)
                    .eq("role", "admin")
                    .maybeSingle();

                if ((adminMember as any)?.user_id) {
                    return (adminMember as any).user_id as string;
                }

                return user.id;
            }

            return ownerId as string;
        },
        enabled: !!user,
        staleTime: 1000 * 60 * 10, // Cache por 10 minutos
    });
}
