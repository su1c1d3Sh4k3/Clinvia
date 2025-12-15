import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type UserRole = "admin" | "supervisor" | "agent";

export const useUserRole = () => {
    const { user } = useAuth();

    return useQuery({
        queryKey: ["user-role", user?.id],
        queryFn: async (): Promise<UserRole | null> => {
            if (!user) return null;

            // Buscar por auth_user_id (ID do próprio membro no auth.users)
            // Primeiro tenta auth_user_id, se não encontrar, tenta user_id (para admins antigos)
            let { data: teamMember, error } = await supabase
                .from("team_members")
                .select("role")
                .eq("auth_user_id", user.id)
                .maybeSingle();

            // Fallback: se não encontrou por auth_user_id, busca por user_id (admins)
            if (!teamMember) {
                const { data: adminMember, error: adminError } = await supabase
                    .from("team_members")
                    .select("role")
                    .eq("user_id", user.id)
                    .eq("role", "admin")
                    .maybeSingle();

                if (adminError) {
                    console.error("Error fetching admin role:", adminError);
                    return null;
                }
                teamMember = adminMember;
            }

            if (error) {
                console.error("Error fetching user role:", error);
                return null;
            }

            if (teamMember) return teamMember.role as UserRole;

            return null; // Usuário não registrado em team_members
        },
        enabled: !!user,
        staleTime: 1000 * 60 * 10, // Cache for 10 minutes (optimized from 5 min)
    });
};

