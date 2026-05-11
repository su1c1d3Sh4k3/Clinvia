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
 *
 * Otimização de boot: o resultado é cacheado em localStorage com chave por
 * auth.uid(). Em todo reload, o `initialData` retorna o owner_id em <1ms
 * sem esperar a RPC — que continua rodando em background e atualiza o cache.
 * Elimina o flash de "loading" no boot do app.
 */
const OWNER_ID_CACHE_PREFIX = "clinvia.owner_id.";

function readCachedOwnerId(authUserId: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        const v = window.localStorage.getItem(OWNER_ID_CACHE_PREFIX + authUserId);
        return v && v.length > 0 ? v : null;
    } catch {
        return null;
    }
}

function writeCachedOwnerId(authUserId: string, ownerId: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(OWNER_ID_CACHE_PREFIX + authUserId, ownerId);
    } catch { /* ignore */ }
}

export function useOwnerId() {
    const { user } = useAuth();
    const authUid = user?.id;
    // Lê cache local sincronamente — usado como initialData abaixo. Reload
    // tem owner_id em <1ms sem esperar RPC.
    const cached = authUid ? readCachedOwnerId(authUid) : null;

    return useQuery({
        queryKey: ["owner-id", authUid],
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
                    const v = (memberByAuth as any).user_id as string;
                    writeCachedOwnerId(user.id, v);
                    return v;
                }

                const { data: adminMember } = await supabase
                    .from("team_members" as any)
                    .select("user_id")
                    .eq("user_id", user.id)
                    .eq("role", "admin")
                    .maybeSingle();

                if ((adminMember as any)?.user_id) {
                    const v = (adminMember as any).user_id as string;
                    writeCachedOwnerId(user.id, v);
                    return v;
                }

                writeCachedOwnerId(user.id, user.id);
                return user.id;
            }

            const v = ownerId as string;
            writeCachedOwnerId(user.id, v);
            return v;
        },
        enabled: !!user,
        staleTime: 1000 * 60 * 10, // Cache por 10 minutos
        initialData: cached ?? undefined,
        // initialData entra como dado fresh (zero loading). A query roda em
        // background em outro tick e atualiza o cache se algo mudou.
    });
}
