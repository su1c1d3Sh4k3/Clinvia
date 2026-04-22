import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "./useUserRole";
import { useOwnerId } from "./useOwnerId";

// ─── Feature definitions ──────────────────────────────────────────────────────

export type PermissionFeature =
    | "contacts"
    | "tags"
    | "queues"
    | "products_services"
    | "tasks"
    | "appointments"
    | "professionals"
    | "crm_deals"
    | "financial"
    | "sales"
    | "team_members"
    | "followup"
    | "connections"
    | "ia_config"
    | "quick_messages";

export interface FeatureDef {
    key: PermissionFeature;
    label: string;
    icon: string; // lucide icon name for reference
}

export const PERMISSION_FEATURES: FeatureDef[] = [
    { key: "contacts", label: "Contatos", icon: "Users" },
    { key: "tags", label: "Tags", icon: "Tag" },
    { key: "queues", label: "Filas", icon: "List" },
    { key: "products_services", label: "Produtos e Serviços", icon: "Package" },
    { key: "tasks", label: "Tarefas", icon: "CheckSquare" },
    { key: "appointments", label: "Agendamentos", icon: "Calendar" },
    { key: "professionals", label: "Profissionais", icon: "Briefcase" },
    { key: "crm_deals", label: "CRM / Negócios", icon: "TrendingUp" },
    { key: "financial", label: "Financeiro", icon: "DollarSign" },
    { key: "sales", label: "Vendas", icon: "ShoppingCart" },
    { key: "team_members", label: "Membros da Equipe", icon: "UserPlus" },
    { key: "followup", label: "Follow-up", icon: "MessageSquare" },
    { key: "connections", label: "Conexões", icon: "Wifi" },
    { key: "ia_config", label: "Configuração da IA", icon: "Bot" },
    { key: "quick_messages", label: "Mensagens Rápidas", icon: "Zap" },
];

// ─── Default permissions (mirrors current hardcoded behavior) ─────────────────

export interface PermissionSet {
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
}

export type DefaultPermissions = Record<PermissionFeature, PermissionSet>;

export const DEFAULT_PERMISSIONS: Record<"supervisor" | "agent", DefaultPermissions> = {
    supervisor: {
        contacts:          { can_create: true,  can_edit: true,  can_delete: true  },
        tags:              { can_create: true,  can_edit: true,  can_delete: false },
        queues:            { can_create: true,  can_edit: true,  can_delete: true  },
        products_services: { can_create: true,  can_edit: true,  can_delete: false },
        tasks:             { can_create: true,  can_edit: true,  can_delete: true  },
        appointments:      { can_create: true,  can_edit: true,  can_delete: true  },
        professionals:     { can_create: true,  can_edit: true,  can_delete: true  },
        crm_deals:         { can_create: true,  can_edit: true,  can_delete: true  },
        financial:         { can_create: true,  can_edit: true,  can_delete: true  },
        sales:             { can_create: true,  can_edit: true,  can_delete: false },
        team_members:      { can_create: true,  can_edit: true,  can_delete: false },
        followup:          { can_create: true,  can_edit: true,  can_delete: true  },
        connections:       { can_create: false, can_edit: false, can_delete: false },
        ia_config:         { can_create: true,  can_edit: true,  can_delete: false },
        quick_messages:    { can_create: true,  can_edit: true,  can_delete: true  },
    },
    agent: {
        contacts:          { can_create: true,  can_edit: true,  can_delete: true  },
        tags:              { can_create: false, can_edit: false, can_delete: false },
        queues:            { can_create: false, can_edit: false, can_delete: false },
        products_services: { can_create: false, can_edit: false, can_delete: false },
        tasks:             { can_create: true,  can_edit: true,  can_delete: true  },
        appointments:      { can_create: true,  can_edit: true,  can_delete: true  },
        professionals:     { can_create: true,  can_edit: true,  can_delete: true  },
        crm_deals:         { can_create: false, can_edit: true,  can_delete: false },
        financial:         { can_create: false, can_edit: false, can_delete: false },
        sales:             { can_create: false, can_edit: false, can_delete: false },
        team_members:      { can_create: false, can_edit: false, can_delete: false },
        followup:          { can_create: true,  can_edit: true,  can_delete: true  },
        connections:       { can_create: false, can_edit: false, can_delete: false },
        ia_config:         { can_create: false, can_edit: false, can_delete: false },
        quick_messages:    { can_create: true,  can_edit: true,  can_delete: true  },
    },
};

// ─── DB row type ──────────────────────────────────────────────────────────────

interface CustomPermissionRow {
    feature: string;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
}

// ─── usePermissions hook (for consumers) ─────────────────────────────────────

/**
 * Returns permission helpers for the currently logged-in user.
 * - Admins always have full access.
 * - Supervisors/Agents use custom_permissions table (falls back to DEFAULT_PERMISSIONS).
 */
export const usePermissions = () => {
    const { data: userRole } = useUserRole();
    // BUGFIX: useOwnerId() returns a React Query result object, not the UUID
    // directly. Must destructure `.data`. Previously `ownerId` was the whole
    // object and `.eq("user_id", ownerId)` silently fetched 0 custom_permissions,
    // forcing supervisors/agents onto the default fallback (which is correct
    // but hid custom overrides from the admin panel).
    const { data: ownerId } = useOwnerId();

    const { data: customPerms } = useQuery<CustomPermissionRow[]>({
        queryKey: ["custom_permissions", ownerId, userRole],
        queryFn: async () => {
            if (!ownerId || !userRole || userRole === "admin") return [];
            const { data, error } = await supabase
                .from("custom_permissions" as any)
                .select("feature, can_create, can_edit, can_delete")
                .eq("user_id", ownerId)
                .eq("role", userRole);
            if (error) {
                console.error("usePermissions: error fetching custom_permissions", error);
                return [];
            }
            return (data || []) as CustomPermissionRow[];
        },
        enabled: !!ownerId && !!userRole && userRole !== "admin",
        staleTime: 1000 * 60 * 5,
    });

    const getPermission = (feature: string): PermissionSet => {
        if (userRole === "admin") return { can_create: true, can_edit: true, can_delete: true };
        if (!userRole) return { can_create: false, can_edit: false, can_delete: false };

        const role = userRole as "supervisor" | "agent";
        const defaults = DEFAULT_PERMISSIONS[role]?.[feature as PermissionFeature]
            ?? { can_create: false, can_edit: false, can_delete: false };

        const custom = customPerms?.find(p => p.feature === feature);
        return custom ?? defaults;
    };

    return {
        canCreate: (feature: string) => getPermission(feature).can_create,
        canEdit:   (feature: string) => getPermission(feature).can_edit,
        canDelete: (feature: string) => getPermission(feature).can_delete,
        /** Returns true if the user has at least one permission for the feature */
        hasAnyAccess: (feature: string) => {
            const p = getPermission(feature);
            return p.can_create || p.can_edit || p.can_delete;
        },
        isReady: !!userRole,
    };
};
