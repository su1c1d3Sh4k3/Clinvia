export interface CRMFunnel {
    id: string;
    user_id: string;
    name: string;
    description?: string;
    is_active: boolean;
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

export interface CRMDeal {
    id: string;
    user_id: string;
    contact_id?: string;
    funnel_id: string;
    stage_id: string;
    title: string;
    description?: string;
    value: number;
    product_service_id?: string; // NEW - replaces old product text field
    quantity?: number; // NEW - default 1
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
}
