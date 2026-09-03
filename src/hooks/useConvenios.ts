import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

export interface Convenio {
    id: string;
    nome: string;
    descricao: string | null;
    is_catch_all: boolean;
    active: boolean;
    service_ids: string[];
    sala_ids: string[];
}

export const CATCH_ALL_NOME = "Todos os convênios";

/** Convênios ativos da conta, já com serviços e salas atrelados. */
export function useConvenios() {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["convenios", ownerId],
        enabled: !!ownerId,
        queryFn: async (): Promise<Convenio[]> => {
            const { data: rows, error } = await supabase
                .from("convenios" as any)
                .select("id, nome, descricao, is_catch_all, active")
                .eq("user_id", ownerId!)
                .eq("active", true)
                .order("nome");
            if (error) throw error;

            const ids = (rows || []).map((r: any) => r.id);
            if (ids.length === 0) return [];

            const [{ data: svcs, error: svcErr }, { data: salas, error: salaErr }] = await Promise.all([
                supabase.from("convenio_servicos" as any).select("convenio_id, service_client_id").in("convenio_id", ids),
                supabase.from("convenio_salas" as any).select("convenio_id, professional_id").in("convenio_id", ids),
            ]);
            if (svcErr) throw svcErr;
            if (salaErr) throw salaErr;

            return (rows || []).map((r: any) => ({
                id: r.id,
                nome: r.nome,
                descricao: r.descricao,
                is_catch_all: !!r.is_catch_all,
                active: !!r.active,
                service_ids: (svcs || []).filter((s: any) => s.convenio_id === r.id).map((s: any) => s.service_client_id),
                sala_ids: (salas || []).filter((s: any) => s.convenio_id === r.id).map((s: any) => s.professional_id),
            }));
        },
    });
}

export interface SaveConvenioInput {
    id?: string;
    nome: string;
    descricao: string | null;
    is_catch_all?: boolean;
    service_ids: string[];
    sala_ids: string[];
}

export function useSaveConvenio() {
    const qc = useQueryClient();
    const { data: ownerId } = useOwnerId();
    return useMutation({
        mutationFn: async (input: SaveConvenioInput) => {
            let id = input.id;
            if (id) {
                const { error } = await supabase.from("convenios" as any)
                    .update({ nome: input.nome, descricao: input.descricao })
                    .eq("id", id);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from("convenios" as any)
                    .insert({
                        user_id: ownerId,
                        nome: input.nome,
                        descricao: input.descricao,
                        is_catch_all: !!input.is_catch_all,
                    })
                    .select("id").single();
                if (error) throw error;
                id = (data as any).id;
            }

            // Vínculos são pequenos: substituir é mais simples que fazer diff
            const { error: delSvcErr } = await supabase.from("convenio_servicos" as any).delete().eq("convenio_id", id);
            if (delSvcErr) throw delSvcErr;
            if (input.service_ids.length > 0) {
                const { error } = await supabase.from("convenio_servicos" as any).insert(
                    input.service_ids.map((sid) => ({ convenio_id: id, service_client_id: sid })));
                if (error) throw error;
            }

            const { error: delSalaErr } = await supabase.from("convenio_salas" as any).delete().eq("convenio_id", id);
            if (delSalaErr) throw delSalaErr;
            if (input.sala_ids.length > 0) {
                const { error } = await supabase.from("convenio_salas" as any).insert(
                    input.sala_ids.map((pid) => ({ convenio_id: id, professional_id: pid })));
                if (error) throw error;
            }
            return id!;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["convenios"] }),
    });
}

/** Inativa (não apaga: agendamentos antigos continuam apontando para o convênio). */
export function useDeactivateConvenio() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("convenios" as any).update({ active: false }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["convenios"] }),
    });
}

/**
 * Liga/desliga "Habilitar todos os convênios".
 * Reaproveita a linha catch-all inativa quando ela já existiu (o índice único
 * só vale para linhas ativas).
 */
export function useToggleCatchAll() {
    const qc = useQueryClient();
    const { data: ownerId } = useOwnerId();
    return useMutation({
        mutationFn: async (enabled: boolean) => {
            const { data: existing, error: findErr } = await supabase.from("convenios" as any)
                .select("id, active")
                .eq("user_id", ownerId!)
                .eq("is_catch_all", true)
                .limit(1).maybeSingle();
            if (findErr) throw findErr;

            if (!enabled) {
                if (!existing) return;
                const { error } = await supabase.from("convenios" as any)
                    .update({ active: false }).eq("id", (existing as any).id);
                if (error) throw error;
                return;
            }

            if (existing) {
                const { error } = await supabase.from("convenios" as any)
                    .update({ active: true }).eq("id", (existing as any).id);
                if (error) throw error;
                return;
            }
            const { error } = await supabase.from("convenios" as any).insert({
                user_id: ownerId,
                nome: CATCH_ALL_NOME,
                is_catch_all: true,
            });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["convenios"] }),
    });
}
