import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "./useOwnerId";
import { useUserRole } from "./useUserRole";
import { useAuth } from "./useAuth";

export interface CrmChannel {
    id: string;
    label: string;
    kind: "wpp" | "ig";
}

/**
 * Recorta as conexões pelo escopo do atendente. Escopo vazio/nulo = todas
 * (mesma convenção de team_members.allowed_instance_ids).
 */
export function filterChannelsByScope(
    all: CrmChannel[],
    role: string | null | undefined,
    allowedInstanceIds: string[] | null | undefined,
): CrmChannel[] {
    if (role !== "agent") return all;
    if (!allowedInstanceIds || allowedInstanceIds.length === 0) return all;
    return all.filter((c) => allowedInstanceIds.includes(c.id));
}

/**
 * Conexões do tenant que viram abas/funis do CRM (uma por número WhatsApp e uma
 * por conta Instagram). Atendente com escopo de instância só recebe as dele — a
 * RLS já corta os cards, a aba precisa sumir para não ficar vazia.
 */
export function useCrmChannels() {
    const { data: ownerId } = useOwnerId();
    const { data: role } = useUserRole();
    const { user } = useAuth();

    return useQuery({
        queryKey: ["crm-channels", ownerId, user?.id, role],
        enabled: !!ownerId,
        staleTime: 1000 * 60 * 5,
        queryFn: async (): Promise<CrmChannel[]> => {
            const [wpp, ig] = await Promise.all([
                supabase.from("instances").select("id, name").eq("user_id", ownerId).order("name"),
                supabase
                    .from("instagram_instances")
                    .select("id, account_name")
                    .eq("user_id", ownerId)
                    .order("account_name"),
            ]);

            const all: CrmChannel[] = [
                ...(wpp.data || []).map((i: any) => ({ id: i.id, label: i.name, kind: "wpp" as const })),
                ...(ig.data || []).map((i: any) => ({
                    id: i.id,
                    label: `${i.account_name} (Instagram)`,
                    kind: "ig" as const,
                })),
            ];

            if (role !== "agent" || !user?.id) return all;

            const { data: me } = await supabase
                .from("team_members")
                .select("allowed_instance_ids")
                .eq("auth_user_id", user.id)
                .maybeSingle();

            const allowed = (me as any)?.allowed_instance_ids as string[] | null | undefined;
            return filterChannelsByScope(all, role, allowed);
        },
    });
}
