import { usePermissions } from "./usePermissions";
import { useUserRole } from "./useUserRole";

/**
 * Returns whether the current user can access the financial module.
 * Delegates to the custom_permissions system (feature: 'financial').
 * Admins always have access.
 *
 * Keeps the same { data: boolean } shape as before so all callers continue to work.
 */
export function useFinancialAccess() {
    const { data: role } = useUserRole();
    const { hasAnyAccess, isReady } = usePermissions();

    // Mirror the react-query shape expected by existing callers
    const access = role === "admin" ? true : isReady ? hasAnyAccess("financial") : true;

    return {
        data: access,
        isLoading: !isReady && role !== "admin",
    };
}
