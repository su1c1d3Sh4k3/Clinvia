import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    clientInScope,
    permissionAllows,
    type AdminClientScope,
    type AdminPage,
    type AdminPermissionLevel,
    type AdminPermissions,
} from "@/lib/adminPermissions";

export interface AdminUserRow {
    id: string;
    auth_user_id: string;
    name: string;
    email: string;
    is_active: boolean;
    permissions: AdminPermissions;
    client_scope: AdminClientScope;
    allowed_client_ids: string[] | null;
    created_at: string | null;
}

export interface AdminIdentity {
    authUserId: string;
    name: string;
    email: string;
    isSuperAdmin: boolean;
    adminUser: AdminUserRow | null;
}

/**
 * Identidade de quem está no painel admin: super-admin (profiles.role) ou
 * membro ativo de admin_users. Retorna null quando o usuário não tem acesso.
 */
export function useAdminUser() {
    const query = useQuery({
        queryKey: ["admin-identity"],
        staleTime: 1000 * 60,
        queryFn: async (): Promise<AdminIdentity | null> => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            const { data: profile } = await supabase
                .from("profiles")
                .select("role, full_name, email")
                .eq("id", user.id)
                .maybeSingle();

            if (profile?.role === "super-admin") {
                return {
                    authUserId: user.id,
                    name: profile.full_name || profile.email || "Super Admin",
                    email: profile.email || user.email || "",
                    isSuperAdmin: true,
                    adminUser: null,
                };
            }

            const { data: adminUser } = await supabase
                .from("admin_users" as any)
                .select("*")
                .eq("auth_user_id", user.id)
                .eq("is_active", true)
                .maybeSingle();

            if (!adminUser) return null;

            const row = adminUser as unknown as AdminUserRow;
            return {
                authUserId: user.id,
                name: row.name,
                email: row.email,
                isSuperAdmin: false,
                adminUser: row,
            };
        },
    });

    const identity = query.data ?? null;

    const can = (page: AdminPage, level: AdminPermissionLevel = "view") => {
        if (!identity) return false;
        if (identity.isSuperAdmin) return true;
        return permissionAllows(identity.adminUser?.permissions, page, level);
    };

    /** Espelho de public.admin_can_access_client — só para esconder o que o servidor recusaria. */
    const canAccessClient = (profileId: string) => {
        if (!identity) return false;
        if (identity.isSuperAdmin) return true;
        if (!can("clientes")) return false;
        return clientInScope(
            identity.adminUser?.client_scope,
            identity.adminUser?.allowed_client_ids,
            profileId,
        );
    };

    return { identity, can, canAccessClient, isLoading: query.isLoading, refetch: query.refetch };
}
