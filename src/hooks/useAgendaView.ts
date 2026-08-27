import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AgendaView = "grade" | "calendario";

/**
 * Modo de exibição da agenda (grade por profissional x calendário mensal).
 * Guardado em team_members.agenda_view — é preferência de CADA pessoa que
 * acessa o sistema (profiles só tem linha para donos de conta).
 */
export function useAgendaView() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["agenda-view", user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("team_members" as any)
                .select("id, agenda_view")
                .eq("auth_user_id", user!.id)
                .maybeSingle();
            if (error) throw error;
            return {
                memberId: (data as any)?.id as string | undefined,
                view: (((data as any)?.agenda_view as AgendaView) || "grade"),
            };
        },
        enabled: !!user,
        staleTime: 1000 * 60 * 60,
    });

    const mutation = useMutation({
        mutationFn: async (view: AgendaView) => {
            const memberId = query.data?.memberId;
            if (!memberId) return;
            const { error } = await supabase
                .from("team_members" as any)
                .update({ agenda_view: view })
                .eq("id", memberId);
            if (error) throw error;
        },
        onMutate: async (view) => {
            queryClient.setQueryData(["agenda-view", user?.id], (old: any) =>
                old ? { ...old, view } : old);
        },
    });

    return {
        view: query.data?.view ?? "grade",
        setView: (view: AgendaView) => mutation.mutate(view),
    };
}
