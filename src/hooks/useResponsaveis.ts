import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

/** Colunas da janela de convênio da sala — o modal precisa delas para editar. */
export const CONVENIO_SALA_COLUMNS =
    "convenio_enabled, convenio_all, convenio_days, convenio_hours, convenio_use_daily, convenio_hours_daily";

export interface ConvenioSalaFields {
    convenio_enabled: boolean | null;
    convenio_all: boolean | null;
    convenio_days: number[] | null;
    convenio_hours: any;
    convenio_use_daily: boolean | null;
    convenio_hours_daily: any;
}

export interface Responsavel {
    id: string;
    user_id: string;
    name: string;
    role: string | null;
    photo_url: string | null;
    active: boolean;
    sala: {
        id: string;
        name: string;
        work_days: number[] | null;
        work_hours: any;
        use_daily_schedule: boolean | null;
        work_hours_daily: any;
    } & ConvenioSalaFields | null;
}

export interface Sala extends ConvenioSalaFields {
    id: string;
    name: string;
    responsavel_id: string | null;
    active: boolean;
    work_days: number[] | null;
    work_hours: any;
    use_daily_schedule: boolean | null;
    work_hours_daily: any;
    responsavel: { id: string; name: string; role: string | null; photo_url: string | null } | null;
}

/** Profissionais (pessoas). A sala de cada um vem no embed. */
export function useResponsaveis() {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["responsaveis", ownerId],
        enabled: !!ownerId,
        queryFn: async (): Promise<Responsavel[]> => {
            const { data, error } = await supabase
                .from("responsaveis" as any)
                .select(`id, user_id, name, role, photo_url, active, sala:professionals(id, name, work_days, work_hours, use_daily_schedule, work_hours_daily, ${CONVENIO_SALA_COLUMNS})`)
                .eq("user_id", ownerId!)
                .order("name");
            if (error) throw error;
            // O embed vem como array (FK reversa), mas o vínculo é 1:1.
            return (data || []).map((r: any) => ({
                ...r,
                sala: Array.isArray(r.sala) ? (r.sala[0] ?? null) : (r.sala ?? null),
            })) as Responsavel[];
        },
    });
}

/** Salas (agendas). É a tabela `professionals` — appointments.professional_id aponta pra cá. */
export function useSalas() {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["salas", ownerId],
        enabled: !!ownerId,
        queryFn: async (): Promise<Sala[]> => {
            const { data, error } = await supabase
                .from("professionals" as any)
                .select(`id, name, responsavel_id, active, work_days, work_hours, use_daily_schedule, work_hours_daily, ${CONVENIO_SALA_COLUMNS}, responsavel:responsaveis(id, name, role, photo_url)`)
                .eq("user_id", ownerId!)
                .order("name");
            if (error) throw error;
            return (data || []) as unknown as Sala[];
        },
    });
}

/** Agendamentos futuros que seriam cancelados se a sala fosse inativada. */
export async function countFutureAppointments(salaId: string): Promise<number> {
    const { data, error } = await supabase.rpc("count_future_appointments" as any, {
        p_professional_id: salaId,
    });
    if (error) throw error;
    return Number(data ?? 0);
}

function useInvalidate() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ["responsaveis"] });
        queryClient.invalidateQueries({ queryKey: ["salas"] });
        queryClient.invalidateQueries({ queryKey: ["professionals-list"] });
        queryClient.invalidateQueries({ queryKey: ["professionals-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["appointments"] });
    };
}

/** Liga/desliga o profissional. A sala dele acompanha por trigger no banco. */
export function useToggleResponsavelActive() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
            const { error } = await supabase
                .from("responsaveis" as any)
                .update({ active })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: invalidate,
    });
}

/** Liga/desliga a sala. O banco recusa se ela pertencer a um profissional. */
export function useToggleSalaActive() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
            const { error } = await supabase
                .from("professionals" as any)
                .update({ active })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: invalidate,
    });
}

export function useDeleteResponsavel() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("responsaveis" as any).delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: invalidate,
    });
}

export function useDeleteSala() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("professionals" as any).delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: invalidate,
    });
}
