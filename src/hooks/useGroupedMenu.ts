import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Menu lateral agrupado (Atendimento / Cadastros / Marketing) x menu plano.
 * Guardado em team_members.grouped_menu — preferência de CADA pessoa que acessa
 * o sistema (profiles só tem linha para donos de conta), igual ao agenda_view.
 */
export function useGroupedMenu() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["grouped-menu", user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("team_members" as any)
                .select("id, grouped_menu")
                .eq("auth_user_id", user!.id)
                .maybeSingle();
            if (error) throw error;
            return {
                memberId: (data as any)?.id as string | undefined,
                grouped: ((data as any)?.grouped_menu ?? true) as boolean,
            };
        },
        enabled: !!user,
        staleTime: 1000 * 60 * 60,
    });

    const mutation = useMutation({
        mutationFn: async (grouped: boolean) => {
            const memberId = query.data?.memberId;
            if (!memberId) throw new Error("Membro da equipe não encontrado");
            const { error } = await supabase
                .from("team_members" as any)
                .update({ grouped_menu: grouped })
                .eq("id", memberId);
            if (error) throw error;
        },
        onMutate: async (grouped) => {
            queryClient.setQueryData(["grouped-menu", user?.id], (old: any) =>
                old ? { ...old, grouped } : old);
        },
        onError: () => {
            queryClient.invalidateQueries({ queryKey: ["grouped-menu", user?.id] });
        },
    });

    return {
        grouped: query.data?.grouped ?? true,
        setGrouped: (grouped: boolean) => mutation.mutateAsync(grouped),
    };
}
