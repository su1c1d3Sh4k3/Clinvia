// Types for Bia AI Function Calling
// All interfaces and types used across the tools

// ============================================
// USER CONTEXT
// ============================================

export interface UserContext {
    auth_user_id: string;      // auth.uid() - ID do usuário autenticado
    owner_id: string;          // user_id da empresa (tenant)
    role: UserRole;            // Cargo do usuário
    team_member_id: string;    // ID na tabela team_members
}

export type UserRole = 'admin' | 'supervisor' | 'agent';

// ============================================
// CONVERSATION STATE (Multi-turn)
// ============================================

export interface ConversationState {
    action: 'idle' | 'gathering_info' | 'confirming' | 'executing' | 'done';
    pending_function: string | null;
    collected_params: Record<string, any>;
    missing_required: string[];
    missing_optional_with_defaults: DefaultValue[];
    awaiting_confirmation: boolean;
}

export interface DefaultValue {
    field: string;
    default_value: any;
    description: string;
}

// ============================================
// FUNCTION DEFINITIONS
// ============================================

export interface ToolFunction {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, ParameterDefinition>;
            required?: string[];
        };
    };
}

export interface ParameterDefinition {
    type: 'string' | 'number' | 'boolean' | 'array';
    description: string;
    enum?: string[];
    items?: { type: string };
}

// ============================================
// FUNCTION RESULTS
// ============================================

export interface FunctionResult {
    success: boolean;
    data?: any;
    error?: string;
    needs_confirmation?: boolean;
    confirmation_message?: string;
    missing_fields?: MissingField[];
}

export interface MissingField {
    field: string;
    required: boolean;
    default_value?: any;
    prompt: string;
}

// ============================================
// ENTITY TYPES
// ============================================

// CRM
export interface CrmDeal {
    id: string;
    contact_id: string;
    contact_name?: string;
    stage_id: string;
    stage_name?: string;
    funnel_id: string;
    funnel_name?: string;
    value: number;
    stage_changed_at: string;
    is_stagnated?: boolean;
}

export interface CrmFunnel {
    id: string;
    name: string;
    stages: CrmStage[];
}

export interface CrmStage {
    id: string;
    name: string;
    order_index: number;
    stagnation_limit_days: number;
}

// Products & Services
export interface ProductService {
    id: string;
    type: 'product' | 'service';
    name: string;
    description?: string;
    price: number;
    stock_quantity?: number;
    duration_minutes?: number;
    opportunity_alert_days: number;
}

// Contacts
export interface Contact {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    channel?: 'whatsapp' | 'instagram';
    tags?: string[];
}

// Appointments
export interface Appointment {
    id: string;
    professional_id: string;
    professional_name?: string;
    contact_id: string;
    contact_name?: string;
    service_id?: string;
    service_name?: string;
    start_time: string;
    end_time: string;
    price: number;
    type: 'appointment' | 'absence';
    status?: 'scheduled' | 'completed' | 'cancelled';
}

// Tasks
export interface Task {
    id: string;
    title: string;
    board_id: string;
    board_name?: string;
    assignee_id?: string;
    assignee_name?: string;
    start_time: string;
    end_time: string;
    urgency: 'low' | 'medium' | 'high';
    type: 'activity' | 'schedule' | 'absence' | 'busy' | 'reminder';
    status: 'pending' | 'open' | 'finished';
}

export interface TaskBoard {
    id: string;
    name: string;
    start_hour: number;
    end_hour: number;
}

// Sales
export interface Sale {
    id: string;
    product_service_id: string;
    product_name?: string;
    category: 'product' | 'service';
    quantity: number;
    unit_price: number;
    total_amount: number;
    payment_type: 'cash' | 'installment';
    sale_date: string;
    team_member_id?: string;
    attendant_name?: string;
    professional_id?: string;
    professional_name?: string;
}

export interface SalesSummary {
    total_revenue: number;
    total_count: number;
    average_ticket: number;
    top_product?: string;
    period: string;
}

// ============================================
// LOOKUP RESULTS
// ============================================

export interface LookupResult<T> {
    found: boolean;
    exact_match: boolean;
    single: boolean;
    items: T[];
    message?: string;
}

export interface TeamMember {
    id: string;
    name: string;
    role: UserRole;
    auth_user_id: string;
}

export interface Professional {
    id: string;
    name: string;
    role?: string;
}
