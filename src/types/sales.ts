// =============================================
// TIPOS DO MÓDULO DE VENDAS
// =============================================

// Enums
export type SaleCategory = 'product' | 'service';
export type PaymentType = 'cash' | 'installment' | 'pending';
export type InstallmentStatus = 'pending' | 'paid' | 'overdue';

// Labels para display
export const SaleCategoryLabels: Record<SaleCategory, string> = {
    product: 'Produto',
    service: 'Serviço',
};

export const PaymentTypeLabels: Record<PaymentType, string> = {
    cash: 'À Vista',
    installment: 'Parcelado',
    pending: 'Pendente',
};

export const InstallmentStatusLabels: Record<InstallmentStatus, string> = {
    pending: 'Pendente',
    paid: 'Pago',
    overdue: 'Atrasado',
};

// Interface principal de Venda
export interface Sale {
    id: string;
    user_id: string;
    category: SaleCategory;
    product_service_id?: string | null;  // Made nullable
    product_name: string;            // Added
    quantity: number;
    unit_price: number;
    total_amount: number;
    payment_type: PaymentType;
    installments: number;
    interest_rate: number;
    sale_date: string;
    team_member_id?: string;
    professional_id?: string;
    notes?: string;
    contact_id?: string;
    created_at: string;
    updated_at: string;
    // Joined fields
    contact?: {
        id: string;
        push_name: string;
        number?: string;
    };
    // Joined fields
    product_service?: {
        id: string;
        name: string;
        type: 'product' | 'service';
        price: number;
    };
    team_member?: {
        id: string;
        name: string;
        avatar_url?: string;
    };
    professional?: {
        id: string;
        name: string;
        photo_url?: string;
    };
    installments_data?: SaleInstallment[];
}

// Interface de Parcela
export interface SaleInstallment {
    id: string;
    sale_id: string;
    installment_number: number;
    due_date: string;
    amount: number;
    status: InstallmentStatus;
    paid_date?: string;
    created_at: string;
    updated_at: string;
}

// Interface para formulário
export interface SaleFormData {
    category: SaleCategory;
    product_service_id?: string; // Optional/Nullable locally
    product_name: string;       // Added
    quantity: number;
    unit_price: number;
    total_amount: number;
    payment_type: PaymentType;
    installments: number;
    interest_rate: number;
    sale_date: string;
    team_member_id?: string;
    professional_id?: string;
    notes?: string;
    contact_id?: string;
}

// Interfaces para métricas
export interface SalesSummary {
    monthly_revenue: number;
    monthly_pending: number;
    total_sales_count: number;
    total_items_sold: number;
}

export interface AnnualSalesItem {
    month_num: number;
    month: string;
    revenue: number;
}

export interface TopProductService {
    id: string;
    name: string;
    type: 'product' | 'service';
    total_revenue: number;
    quantity_sold: number;
}

export interface SalesProjection {
    projected_revenue: number;
    pending_installments: number;
}

export interface SalesByPerson {
    id: string;
    name: string;
    photo?: string;
    total_revenue: number;
    quantity_sold: number;
    top_product?: string;
}

// Interface para relatório
export interface SalesReport {
    id: string;
    user_id: string;
    name: string;
    start_date: string;
    end_date: string;
    content: string;
    status: string;
    created_at: string;
    updated_at: string;
}
