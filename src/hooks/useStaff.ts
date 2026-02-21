import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface StaffMember {
    id: string; // team_members.id (UUID próprio)
    user_id: string; // ID do owner/admin da conta
    auth_user_id?: string; // ID do próprio membro no auth.users
    name: string;
    role: 'admin' | 'agent' | 'supervisor';
    email?: string;
    avatar_url?: string;
}

export function useStaff() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ["staff-members", user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            // 1. Obter usuário logado
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) return [];

            // 2. Encontrar o team_member do usuário logado para obter o owner_id (user_id)
            // Primeiro tenta por auth_user_id (membros), depois por user_id (admin)
            let { data: currentMember } = await supabase
                .from("team_members" as any)
                .select("user_id")
                .eq("auth_user_id", userData.user.id)
                .maybeSingle();

            // Fallback para admins (onde user_id = auth.users.id)
            if (!currentMember) {
                const { data: adminMember } = await supabase
                    .from("team_members" as any)
                    .select("user_id")
                    .eq("user_id", userData.user.id)
                    .eq("role", "admin")
                    .maybeSingle();
                currentMember = adminMember;
            }

            if (!currentMember) return [];

            const ownerId = currentMember.user_id;

            // 3. Buscar TODOS os membros que pertencem ao mesmo owner
            const { data: teamMembers, error } = await supabase
                .from("team_members" as any)
                .select("id, user_id, auth_user_id, name, role, email, avatar_url")
                .eq("user_id", ownerId) // Filtrar pela conta do owner
                .order("name");

            if (error) {
                console.error("Error fetching team members:", error);
                throw error;
            }

            const staff: StaffMember[] = (teamMembers || []).map((tm: any) => ({
                id: tm.id,
                user_id: tm.user_id,
                auth_user_id: tm.auth_user_id,
                name: tm.name,
                role: tm.role,
                email: tm.email,
                avatar_url: tm.avatar_url
            }));

            return staff;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

// Hook auxiliar para obter o team_member do usuário logado
export function useCurrentTeamMember() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ["current-team-member", user?.id],
        enabled: !!user?.id,
        queryFn: async () => {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) return null;

            // Seleciona todos os campos incluindo os de configurações
            const selectFields = "*";

            // Primeiro tenta por auth_user_id (membros)
            let { data: teamMember, error } = await supabase
                .from("team_members" as any)
                .select(selectFields)
                .eq("auth_user_id", userData.user.id)
                .maybeSingle();

            // Fallback para admins (onde user_id = auth.users.id e auth_user_id pode não existir ainda)
            if (!teamMember) {
                const { data: adminMember, error: adminError } = await supabase
                    .from("team_members" as any)
                    .select(selectFields)
                    .eq("user_id", userData.user.id)
                    .eq("role", "admin")
                    .maybeSingle();

                if (adminError) {
                    console.error("Error fetching admin team member:", adminError);
                    return null;
                }
                teamMember = adminMember;
            }

            if (error) {
                console.error("Error fetching current team member:", error);
                return null;
            }

            return teamMember as StaffMember | null;
        },
        staleTime: 1000 * 60 * 5,
    });
}


