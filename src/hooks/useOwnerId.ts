import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook para obter o owner_id (ID do admin/dono da conta) do usuário logado.
 * 
 * Para admins: owner_id = auth.uid()
 * Para membros de equipe: owner_id = team_members.user_id (que é o ID do admin)
 * 
 * Esta versão usa RPC para garantir que o frontend retorne EXATAMENTE
 * o mesmo valor que o get_owner_id() usado nas RLS policies.
 */
export function useOwnerId() {
    return useQuery({
        queryKey: ["owner-id"],
        queryFn: async () => {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) return null;

            // Usa RPC que chama diretamente a função get_owner_id() do banco
            const { data: ownerId, error } = await supabase.rpc('get_my_owner_id');

            if (error) {
                console.error('[useOwnerId] RPC error, using fallback:', error);

                // Fallback: tenta buscar manualmente (para o caso do RPC não existir ainda)
                const { data: memberByAuth } = await supabase
                    .from("team_members" as any)
                    .select("user_id")
                    .eq("auth_user_id", userData.user.id)
                    .maybeSingle();

                if ((memberByAuth as any)?.user_id) {
                    return (memberByAuth as any).user_id as string;
                }

                const { data: adminMember } = await supabase
                    .from("team_members" as any)
                    .select("user_id")
                    .eq("user_id", userData.user.id)
                    .eq("role", "admin")
                    .maybeSingle();

                if ((adminMember as any)?.user_id) {
                    return (adminMember as any).user_id as string;
                }

                return userData.user.id;
            }

            console.log('[useOwnerId] Got owner_id from RPC:', ownerId);
            return ownerId as string;
        },
        staleTime: 1000 * 60 * 10, // Cache por 10 minutos
    });
}

