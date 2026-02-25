export interface CRMFunnel {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    is_system?: boolean;
    created_at: string;
    updated_at: string;
}

export interface CRMStage {
    id: string;
    funnel_id: string;
    name: string;
    color: string;
    position: number;
    is_system: boolean;
    stagnation_limit_days?: number;
    history?: number;
    created_at: string;
    updated_at: string;
}

// Produto vinculado a uma negociação (tabela crm_deal_products)
export interface CRMDealProduct {
    id: string;
    deal_id: string;
    product_service_id: string;
    quantity: number;
    unit_price: number;
    created_at?: string;
    // Joined field
    product_service?: {
        id: string;
        name: string;
        type: 'product' | 'service';
        price: number;
    };
}

export interface CRMDeal {
    id: string;
    user_id: string;
    contact_id?: string;
    funnel_id: string;
    stage_id: string;
    title: string;
    description?: string;
    value: number;
    product_service_id?: string; // DEPRECATED - usar deal_products
    quantity?: number; // DEPRECATED - usar deal_products
    assigned_professional_id?: string; // NEW - only for services
    priority?: 'low' | 'medium' | 'high';
    loss_reason?: string; // Motivo da perda
    loss_reason_other?: string; // Descrição quando loss_reason = 'other'
    created_at: string;
    updated_at: string;
    stage_changed_at?: string;
    responsible_id?: string;
    // Joined fields
    contacts?: {
        push_name: string;
        remote_jid?: string;
        email?: string;
        profile_pic_url?: string;
        number?: string;
        instagram_id?: string;  // Para determinar origem do contato (Instagram vs WhatsApp)
        contact_tags?: {
            tags: {
                id: string;
                name: string;
                color: string;
            }
        }[];
    };
    responsible?: {
        name: string; // From profiles or team_members
    };
    product_service?: {
        id: string;
        name: string;
        type: 'product' | 'service';
        price: number;
    };
    assigned_professional?: {
        id: string;
        name: string;
        role?: string;
    };
    notes?: {
        data: string;
        usuario: string;
        nota: string;
    }[];
    // Multi-produto
    deal_products?: CRMDealProduct[];
}

