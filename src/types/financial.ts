// =============================================
// TIPOS DO MÓDULO FINANCEIRO
// =============================================

// Enums
export type PaymentMethod = 'pix' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'cash' | 'boleto' | 'other';
export type FinancialStatus = 'paid' | 'pending' | 'overdue' | 'cancelled';
export type RecurrencePeriod = 'weekly' | 'monthly' | 'yearly';
export type CollaboratorType = 'agent' | 'supervisor' | 'professional';
export type MarketingOrigin = 'google' | 'meta' | 'tiktok' | 'linkedin' | 'twitter' | 'email' | 'organic' | 'referral' | 'other' | string;
export type CampaignStatus = 'active' | 'paused' | 'finished' | string;

// Labels para display
export const PaymentMethodLabels: Record<PaymentMethod, string> = {
    pix: 'PIX',
    credit_card: 'Cartão de Crédito',
    debit_card: 'Cartão de Débito',
    bank_transfer: 'Transferência',
    cash: 'Dinheiro',
    boleto: 'Boleto',
    other: 'Outro',
};

export const FinancialStatusLabels: Record<FinancialStatus, string> = {
    paid: 'Pago',
    pending: 'Pendente',
    overdue: 'Atrasado',
    cancelled: 'Cancelado',
};

export const RecurrencePeriodLabels: Record<RecurrencePeriod, string> = {
    weekly: 'Semanal',
    monthly: 'Mensal',
    yearly: 'Anual',
};

export const CollaboratorTypeLabels: Record<CollaboratorType, string> = {
    agent: 'Atendente',
    supervisor: 'Supervisor',
    professional: 'Profissional',
};

export const MarketingOriginLabels: Record<string, string> = {
    google: 'Google',
    meta: 'Meta',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
    twitter: 'Twitter',
    email: 'E-mail',
    organic: 'Orgânico',
    referral: 'Indicação',
    other: 'Outro',
};

export const CampaignStatusLabels: Record<string, string> = {
    active: 'Ativa',
    paused: 'Pausada',
    finished: 'Finalizada',
};

// Helper functions for safe label lookup
export function getOriginLabel(origin: string): string {
    return MarketingOriginLabels[origin as keyof typeof MarketingOriginLabels] || origin || 'Outro';
}

export function getStatusLabel(status: string): string {
    return CampaignStatusLabels[status] || status || 'Desconhecido';
}

// Interfaces das tabelas
export interface RevenueCategory {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
}

export interface ExpenseCategory {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
}

export interface Revenue {
    id: string;
    user_id: string;
    category_id?: string;
    item: string;
    description?: string;
    amount: number;
    payment_method: PaymentMethod;
    due_date: string;
    paid_date?: string;
    status: FinancialStatus;
    team_member_id?: string;
    professional_id?: string;
    contact_id?: string; // NEW - CRM integration
    appointment_id?: string;
    is_recurring: boolean;
    recurrence_period?: RecurrencePeriod;
    parent_revenue_id?: string;
    created_at: string;
    updated_at: string;
    // Joined fields
    category?: RevenueCategory;
    team_member?: { id: string; name: string };
    professional?: { id: string; name: string };
}

export interface Expense {
    id: string;
    user_id: string;
    category_id?: string;
    item: string;
    description?: string;
    amount: number;
    payment_method: PaymentMethod;
    due_date: string;
    paid_date?: string;
    status: FinancialStatus;
    is_recurring: boolean;
    recurrence_period?: RecurrencePeriod;
    parent_expense_id?: string;
    created_at: string;
    updated_at: string;
    // Joined fields
    category?: ExpenseCategory;
}

export interface TeamCost {
    id: string;
    user_id: string;
    collaborator_type: CollaboratorType;
    team_member_id?: string;
    professional_id?: string;
    base_salary: number;
    commission: number;
    bonus: number;
    deductions: number;
    payment_method: PaymentMethod;
    due_date: string;
    paid_date?: string;
    status: FinancialStatus;
    notes?: string;
    reference_month: number;
    reference_year: number;
    created_at: string;
    updated_at: string;
    // Joined fields
    team_member?: { id: string; name: string; avatar_url?: string };
    professional?: { id: string; name: string; photo_url?: string };
}

export interface MarketingCampaign {
    id: string;
    user_id: string;
    name: string;
    origin: MarketingOrigin;
    investment: number;
    leads_count: number;
    conversions_count: number;
    start_date: string;
    end_date?: string;
    status: CampaignStatus;
    notes?: string;
    created_at: string;
    updated_at: string;
}

// Interfaces para resumo financeiro
export interface FinancialSummary {
    received: number;
    future_receivables: number;
    debited: number;
    future_debits: number;
    overdue_revenues: number;
    overdue_expenses: number;
}

export interface AnnualBalanceItem {
    month_num: number;
    month: string;
    revenue: number;
    expenses: number;
}

export interface AgentRevenue {
    id: string;
    name: string;
    photo?: string;
    revenue: number;
    transactions: number;
}

export interface ProfessionalRevenue {
    id: string;
    name: string;
    photo?: string;
    revenue: number;
    appointments: number;
    commissionRate: number; // Commission percentage (0-100)
    commissionTotal: number; // Total commission amount in currency
}

// Interfaces para formulários
export interface RevenueFormData {
    category_id?: string;
    item: string;
    product_service_id?: string; // NEW - For CRM integration
    description?: string;
    amount: number;
    payment_method: PaymentMethod;
    due_date: string;
    paid_date?: string;
    status: FinancialStatus;
    team_member_id?: string;
    professional_id?: string;
    contact_id?: string; // NEW - CRM integration
    is_recurring: boolean;
    recurrence_period?: RecurrencePeriod;
}

export interface ExpenseFormData {
    category_id?: string;
    item: string;
    description?: string;
    amount: number;
    payment_method: PaymentMethod;
    due_date: string;
    paid_date?: string;
    status: FinancialStatus;
    is_recurring: boolean;
    recurrence_period?: RecurrencePeriod;
}

export interface TeamCostFormData {
    collaborator_type: CollaboratorType;
    team_member_id?: string;
    professional_id?: string;
    base_salary: number;
    commission: number;
    bonus: number;
    deductions: number;
    payment_method: PaymentMethod;
    due_date: string;
    paid_date?: string;
    status: FinancialStatus;
    notes?: string;
    reference_month: number;
    reference_year: number;
}

export interface MarketingCampaignFormData {
    name: string;
    origin: MarketingOrigin;
    investment: number;
    leads_count: number;
    conversions_count: number;
    start_date: string;
    end_date?: string;
    status: CampaignStatus;
    notes?: string;
}
