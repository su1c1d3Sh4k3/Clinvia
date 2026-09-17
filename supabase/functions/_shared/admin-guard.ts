// Porta única de autorização do painel admin nas edge functions.
//
// Espelha os helpers SQL is_super_admin() / admin_can() / admin_can_access_client().
// Usar SEMPRE isto em vez de reimplementar a checagem: um usuário do painel só
// pode alcançar as contas que o super-admin liberou para ele, e NUNCA um perfil
// super-admin.
//
// ATENÇÃO: o bundler do Deno inclui _shared/ — editar este arquivo obriga
// redeploy de TODAS as funções que o importam.

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export interface AdminCaller {
    authUserId: string;
    isSuperAdmin: boolean;
    scopeAll: boolean;
    allowedClientIds: string[];
    permissions: Record<string, string>;
}

/** Resolve o chamador pelo JWT. Retorna null se não for staff do painel. */
export async function resolveAdminCaller(
    supabaseAdmin: SupabaseAdmin,
    req: Request,
): Promise<AdminCaller | null> {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;

    const { data: caller, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !caller?.user) return null;

    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", caller.user.id)
        .maybeSingle();

    if (profile?.role === "super-admin") {
        return {
            authUserId: caller.user.id,
            isSuperAdmin: true,
            scopeAll: true,
            allowedClientIds: [],
            permissions: {},
        };
    }

    const { data: adminUser } = await supabaseAdmin
        .from("admin_users")
        .select("is_active, permissions, client_scope, allowed_client_ids")
        .eq("auth_user_id", caller.user.id)
        .maybeSingle();

    if (!adminUser?.is_active) return null;

    return {
        authUserId: caller.user.id,
        isSuperAdmin: false,
        scopeAll: adminUser.client_scope === "all",
        allowedClientIds: (adminUser.allowed_client_ids as string[] | null) ?? [],
        permissions: (adminUser.permissions as Record<string, string> | null) ?? {},
    };
}

export function adminCan(caller: AdminCaller, page: string, level: "view" | "edit" = "view"): boolean {
    if (caller.isSuperAdmin) return true;
    const current = caller.permissions[page] ?? "none";
    if (current === "none") return false;
    return level === "edit" ? current === "edit" : true;
}

/** Uma conta de cliente só é alcançável se estiver no escopo e não for super-admin. */
export async function adminCanAccessClient(
    supabaseAdmin: SupabaseAdmin,
    caller: AdminCaller,
    profileId: string | null | undefined,
): Promise<boolean> {
    if (!profileId) return false;
    if (caller.isSuperAdmin) return true;
    if (!adminCan(caller, "clientes", "view")) return false;
    if (!caller.scopeAll && !caller.allowedClientIds.includes(profileId)) return false;

    const { data: target } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", profileId)
        .maybeSingle();

    return !!target && target.role !== "super-admin";
}

export function adminForbidden(
    corsHeaders: Record<string, string>,
    message = "Acesso negado. Esta conta não faz parte das suas atribuições.",
): Response {
    return new Response(
        JSON.stringify({ success: false, error: message, message, code: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
}
