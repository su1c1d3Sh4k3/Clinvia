import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

export type OrcamentoItemStatus = "pendente" | "vendido" | "recusado" | "expirado";

export interface OrcamentoItem {
    id: string;
    orcamento_id: string;
    service_client_id: string | null;
    service_name: string;
    unit_price: number;
    min_price: number | null;
    status: OrcamentoItemStatus;
    sale_id: string | null;
    decided_at: string | null;
}

export interface Orcamento {
    id: string;
    user_id: string;
    contact_id: string;
    responsavel_id: string;
    indicacao: string | null;
    validade: string | null;
    notes: string | null;
    created_at: string;
    responsavel: { id: string; name: string; role: string | null; photo_url: string | null } | null;
    criado_por: { id: string; name: string } | null;
    itens: OrcamentoItem[];
}

const SELECT = `
    id, user_id, contact_id, responsavel_id, indicacao, validade, notes, created_at,
    responsavel:responsaveis(id, name, role, photo_url),
    criado_por:team_members(id, name),
    itens:orcamento_itens(id, orcamento_id, service_client_id, service_name, unit_price, min_price, status, sale_id, decided_at)
`;

function normalize(rows: any[]): Orcamento[] {
    return (rows || []).map((o: any) => ({
        ...o,
        responsavel: Array.isArray(o.responsavel) ? (o.responsavel[0] ?? null) : (o.responsavel ?? null),
        criado_por: Array.isArray(o.criado_por) ? (o.criado_por[0] ?? null) : (o.criado_por ?? null),
        itens: (o.itens || []).sort((a: any, b: any) => a.service_name.localeCompare(b.service_name)),
    })) as Orcamento[];
}

/** Um orçamento está expirado quando passou da validade. */
export function isOrcamentoExpirado(o: Orcamento): boolean {
    if (!o.validade) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return new Date(`${o.validade}T00:00:00`) < hoje;
}

export function hasPendentes(o: Orcamento): boolean {
    return o.itens.some((i) => i.status === "pendente");
}

export function orcamentoTotal(o: Orcamento): number {
    return o.itens.reduce((acc, i) => acc + Number(i.unit_price || 0), 0);
}

/** Orçamentos de um contato (todos, inclusive resolvidos/expirados). */
export function useOrcamentos(contactId?: string | null) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["orcamentos", ownerId, contactId],
        enabled: !!ownerId && !!contactId,
        queryFn: async (): Promise<Orcamento[]> => {
            const { data, error } = await supabase
                .from("orcamentos" as any)
                .select(SELECT)
                .eq("user_id", ownerId!)
                .eq("contact_id", contactId!)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return normalize(data as any[]);
        },
    });
}

export interface OrcamentoItemInput {
    service_client_id: string;
    service_name: string;
    unit_price: number;
    min_price: number | null;
}

export interface OrcamentoInput {
    contact_id: string;
    responsavel_id: string;
    indicacao: string | null;
    validade: string | null;
    notes: string | null;
    itens: OrcamentoItemInput[];
}

function useInvalidate() {
    const queryClient = useQueryClient();
    return (contactId?: string) => {
        queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
        queryClient.invalidateQueries({ queryKey: ["orcamento-indicacoes"] });
        if (contactId) queryClient.invalidateQueries({ queryKey: ["valor-movimentado", contactId] });
    };
}

export function useCreateOrcamento() {
    const { data: ownerId } = useOwnerId();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (input: OrcamentoInput) => {
            if (!ownerId) throw new Error("Organização não identificada.");

            const { data: { user } } = await supabase.auth.getUser();
            let createdBy: string | null = null;
            if (user) {
                const { data: tm } = await supabase
                    .from("team_members")
                    .select("id")
                    .eq("auth_user_id", user.id)
                    .maybeSingle();
                createdBy = tm?.id ?? null;
            }

            const { data: orc, error } = await supabase
                .from("orcamentos" as any)
                .insert({
                    user_id: ownerId,
                    contact_id: input.contact_id,
                    responsavel_id: input.responsavel_id,
                    indicacao: input.indicacao,
                    validade: input.validade,
                    notes: input.notes,
                    created_by: createdBy,
                } as any)
                .select("id")
                .single();
            if (error) throw error;

            const orcamentoId = (orc as any).id as string;
            const { error: itemErr } = await supabase.from("orcamento_itens" as any).insert(
                input.itens.map((i) => ({
                    user_id: ownerId,
                    orcamento_id: orcamentoId,
                    service_client_id: i.service_client_id,
                    service_name: i.service_name,
                    unit_price: i.unit_price,
                    min_price: i.min_price,
                })) as any,
            );
            if (itemErr) {
                // Orçamento sem item não serve pra nada — desfaz para não virar lixo
                await supabase.from("orcamentos" as any).delete().eq("id", orcamentoId);
                throw itemErr;
            }

            return orcamentoId;
        },
        onSuccess: (_id, vars) => invalidate(vars.contact_id),
    });
}

/**
 * Edição: só mexe no que ainda está pendente. Itens já decididos permanecem.
 */
export function useUpdateOrcamento() {
    const { data: ownerId } = useOwnerId();
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: OrcamentoInput }) => {
            if (!ownerId) throw new Error("Organização não identificada.");

            const { error } = await supabase
                .from("orcamentos" as any)
                .update({
                    responsavel_id: input.responsavel_id,
                    indicacao: input.indicacao,
                    validade: input.validade,
                    notes: input.notes,
                } as any)
                .eq("id", id);
            if (error) throw error;

            // Itens pendentes são substituídos pelos novos (os decididos ficam intactos)
            const { error: delErr } = await supabase
                .from("orcamento_itens" as any)
                .delete()
                .eq("orcamento_id", id)
                .eq("status", "pendente");
            if (delErr) throw delErr;

            if (input.itens.length > 0) {
                const { error: insErr } = await supabase.from("orcamento_itens" as any).insert(
                    input.itens.map((i) => ({
                        user_id: ownerId,
                        orcamento_id: id,
                        service_client_id: i.service_client_id,
                        service_name: i.service_name,
                        unit_price: i.unit_price,
                        min_price: i.min_price,
                    })) as any,
                );
                if (insErr) throw insErr;
            }
        },
        onSuccess: (_r, vars) => invalidate(vars.input.contact_id),
    });
}

export function useDeleteOrcamento() {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("orcamentos" as any).delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => invalidate(),
    });
}

/** Autocomplete de indicações já usadas pela empresa. */
export function useIndicacoes(q: string) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["orcamento-indicacoes", ownerId, q],
        enabled: !!ownerId,
        staleTime: 1000 * 60,
        queryFn: async (): Promise<string[]> => {
            const { data, error } = await supabase.rpc("get_orcamento_indicacoes" as any, { p_q: q || null });
            if (error) throw error;
            return ((data || []) as any[]).map((r) => r.indicacao as string);
        },
    });
}

export function useValorMovimentado(contactId?: string | null) {
    const { data: ownerId } = useOwnerId();
    return useQuery({
        queryKey: ["valor-movimentado", contactId, ownerId],
        enabled: !!ownerId && !!contactId,
        queryFn: async (): Promise<number> => {
            const { data, error } = await supabase.rpc("get_contact_valor_movimentado" as any, {
                p_contact_id: contactId!,
            });
            if (error) throw error;
            return Number(data ?? 0);
        },
    });
}

/** Payload por item enviado ao RPC de lançamento de venda. */
export interface LancarVendaItem {
    item_id: string;
    unit_price: number;
    professional_id: string | null;
    payment_type: "cash" | "installment" | "pending" | "mixed";
    installments: number;
    interest_rate: number;
    cash_amount: number | null;
    sale_date: string;
    notes: string | null;
    ia_scheduling: boolean;
    ia_contact_days: number | null;
}

export interface LancarVendaResult {
    item_id: string;
    sale_id: string;
    service_client_id: string | null;
    service_name: string;
}

export async function lancarVendaDoOrcamento(args: {
    orcamentoId: string;
    itens: LancarVendaItem[];
    recusados: string[];
    teamMemberId: string | null;
}): Promise<LancarVendaResult[]> {
    const { data, error } = await supabase.rpc("lancar_venda_do_orcamento" as any, {
        p_orcamento_id: args.orcamentoId,
        p_itens: args.itens as any,
        p_recusados: args.recusados,
        p_team_member_id: args.teamMemberId,
    });
    if (error) throw error;
    return (data || []) as LancarVendaResult[];
}
