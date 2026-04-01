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
            let { data: teamMember, error } = await supabase
                .from("team_members")
                .select("role, auth_user_id, user_id")
                .eq("auth_user_id", user.id)
                .maybeSingle();

            // Fallback: se não encontrou por auth_user_id, busca por user_id (admins antigos)
            if (!teamMember) {
                const { data: adminMember, error: adminError } = await supabase
                    .from("team_members")
                    .select("role, auth_user_id, user_id")
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

            if (teamMember) {
                // BLINDAGEM: Se auth_user_id === user_id, o usuário é o dono da conta.
                // Independente do que está no campo role, ele DEVE ser tratado como admin.
                // Isso previne o caso onde o dono foi cadastrado acidentalmente como supervisor/agent.
                if (teamMember.auth_user_id && teamMember.user_id &&
                    teamMember.auth_user_id === teamMember.user_id) {
                    return "admin";
                }
                return teamMember.role as UserRole;
            }

            return null; // Usuário não registrado em team_members
        },
        enabled: !!user,
        staleTime: 1000 * 60 * 10, // Cache for 10 minutes
    });
};
