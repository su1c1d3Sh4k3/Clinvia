import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Selects compartilhados de equipe e salas.
 * O antigo módulo financeiro (receitas/despesas/custos/campanhas) foi removido
 * junto com a página /financial v1 — só sobraram estes dois hooks de select.
 */

// Team members (para selects)
export function useTeamMembers() {
    return useQuery({
        queryKey: ['team-members-list'],
        queryFn: async () => {
            const { data: teamMembers, error } = await supabase
                .from('team_members')
                .select('id, user_id, name, avatar_url, role, commission')
                .order('name');

            if (error) throw error;

            return (teamMembers || []).map((tm: any) => ({
                id: tm.id,           // team_members.id - usar para FK
                user_id: tm.user_id, // profiles.id - para referência
                name: tm.name,
                avatar_url: tm.avatar_url,
                role: tm.role,
                commission: tm.commission || 0
            }));
        },
    });
}

// Salas / profissionais (para selects)
export function useProfessionals() {
    return useQuery({
        queryKey: ['professionals-list'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('professionals' as any)
                .select('id, name, service_ids, work_days, work_hours, commission, responsavel:responsaveis(role, photo_url)')
                .eq('active', true)
                .order('name');

            if (error) throw error;
            // Foto e cargo vêm do profissional dono da sala.
            return (data || []).map((p: any) => ({
                ...p,
                photo_url: p.responsavel?.photo_url ?? null,
                role: p.responsavel?.role ?? null,
            }));
        },
    });
}
