// Permissions matrix for Bia AI Function Calling
// Controls what actions each role can perform

import { UserRole } from './types.ts';

// ============================================
// PERMISSION ACTIONS
// ============================================

export type PermissionAction =
    // CRM
    | 'crm:view_all' | 'crm:view_own' | 'crm:create' | 'crm:update' | 'crm:delete'
    // Products
    | 'products:view' | 'products:create' | 'products:update' | 'products:delete'
    // Contacts
    | 'contacts:view_all' | 'contacts:view_own' | 'contacts:create' | 'contacts:update'
    // Appointments
    | 'appointments:view_all' | 'appointments:view_own' | 'appointments:create' | 'appointments:update' | 'appointments:delete'
    // Tasks
    | 'tasks:view_all' | 'tasks:view_own' | 'tasks:create' | 'tasks:update' | 'tasks:delete'
    // Sales
    | 'sales:view_all' | 'sales:view_own' | 'sales:reports';

// ============================================
// PERMISSIONS MATRIX
// ============================================

const PERMISSIONS_MATRIX: Record<UserRole, PermissionAction[]> = {
    admin: [
        // CRM - Full access
        'crm:view_all', 'crm:view_own', 'crm:create', 'crm:update', 'crm:delete',
        // Products - Full access
        'products:view', 'products:create', 'products:update', 'products:delete',
        // Contacts - Full access
        'contacts:view_all', 'contacts:view_own', 'contacts:create', 'contacts:update',
        // Appointments - Full access
        'appointments:view_all', 'appointments:view_own', 'appointments:create', 'appointments:update', 'appointments:delete',
        // Tasks - Full access
        'tasks:view_all', 'tasks:view_own', 'tasks:create', 'tasks:update', 'tasks:delete',
        // Sales - Full access
        'sales:view_all', 'sales:view_own', 'sales:reports',
    ],

    supervisor: [
        // CRM - Full access
        'crm:view_all', 'crm:view_own', 'crm:create', 'crm:update',
        // Products - Can view and edit, not delete
        'products:view', 'products:create', 'products:update',
        // Contacts - Full view
        'contacts:view_all', 'contacts:view_own', 'contacts:create', 'contacts:update',
        // Appointments - Full access
        'appointments:view_all', 'appointments:view_own', 'appointments:create', 'appointments:update',
        // Tasks - Full access
        'tasks:view_all', 'tasks:view_own', 'tasks:create', 'tasks:update',
        // Sales - Full access
        'sales:view_all', 'sales:view_own', 'sales:reports',
    ],

    agent: [
        // CRM - Own only
        'crm:view_own', 'crm:create',
        // Products - View only
        'products:view',
        // Contacts - Own only
        'contacts:view_own',
        // Appointments - Own only + create
        'appointments:view_own', 'appointments:create', 'appointments:update',
        // Tasks - Own only + create
        'tasks:view_own', 'tasks:create',
        // Sales - Own only
        'sales:view_own',
    ],
};

// ============================================
// PERMISSION CHECK FUNCTIONS
// ============================================

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, action: PermissionAction): boolean {
    const permissions = PERMISSIONS_MATRIX[role] || [];
    return permissions.includes(action);
}

/**
 * Check if user can view all records or only their own
 */
export function canViewAll(role: UserRole, entity: 'crm' | 'contacts' | 'appointments' | 'tasks' | 'sales'): boolean {
    const viewAllAction = `${entity}:view_all` as PermissionAction;
    return hasPermission(role, viewAllAction);
}

/**
 * Get the appropriate filter for queries based on role
 * Returns null if can view all, or the field to filter by if restricted
 */
export function getOwnershipFilter(role: UserRole, entity: string): 'team_member_id' | 'assigned_to' | null {
    if (canViewAll(role, entity as any)) {
        return null;
    }

    // For agents, filter by their own records
    switch (entity) {
        case 'crm':
        case 'sales':
            return 'team_member_id';
        case 'tasks':
        case 'appointments':
            return 'assigned_to';
        default:
            return null;
    }
}

/**
 * Validate permission and throw error if not allowed
 */
export function validatePermission(role: UserRole, action: PermissionAction): void {
    if (!hasPermission(role, action)) {
        throw new Error(`Você não tem permissão para realizar esta ação (${action})`);
    }
}

/**
 * Get user-friendly permission denied message
 */
export function getPermissionDeniedMessage(action: PermissionAction): string {
    const messages: Record<string, string> = {
        'products:create': 'Apenas administradores e supervisores podem criar produtos',
        'products:update': 'Apenas administradores e supervisores podem editar produtos',
        'products:delete': 'Apenas administradores podem excluir produtos',
        'sales:reports': 'Apenas administradores e supervisores podem ver relatórios de vendas',
        'crm:view_all': 'Você só pode ver suas próprias negociações',
        'tasks:view_all': 'Você só pode ver suas próprias tarefas',
    };

    return messages[action] || 'Você não tem permissão para realizar esta ação';
}
