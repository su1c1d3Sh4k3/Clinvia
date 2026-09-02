import { useCallback, useMemo } from "react";
import { useUserRole } from "./useUserRole";
import { usePermissions, DASHBOARD_TAB_FEATURES } from "./usePermissions";

/**
 * Quais abas do Dashboard o usuário logado pode ver.
 * Admin vê todas; supervisor/agente dependem das permissões da subcategoria
 * "Abas do Dashboard" (features dash_*).
 */
export function useDashboardTabAccess() {
    const { data: userRole } = useUserRole();
    const { hasAnyAccess, isReady } = usePermissions();

    // Assinatura estável para o memo (hasAnyAccess é recriado a cada render)
    const signature =
        userRole === "admin"
            ? "admin"
            : !isReady
                ? ""
                : DASHBOARD_TAB_FEATURES.map(t => (hasAnyAccess(t.feature) ? "1" : "0")).join("");

    const allowedTabs = useMemo<string[]>(() => {
        if (signature === "admin") return DASHBOARD_TAB_FEATURES.map(t => t.tab);
        if (!signature) return [];
        return DASHBOARD_TAB_FEATURES.filter((_, i) => signature[i] === "1").map(t => t.tab);
    }, [signature]);

    const canSeeTab = useCallback((tab: string) => allowedTabs.includes(tab), [allowedTabs]);

    return { allowedTabs, canSeeTab, isReady: userRole === "admin" || isReady };
}
