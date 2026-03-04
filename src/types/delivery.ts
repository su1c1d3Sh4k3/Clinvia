export type DeliveryStage =
    | 'aguardando_agendamento'
    | 'procedimento_agendado'
    | 'procedimento_confirmado'
    | 'procedimento_concluido'
    | 'procedimento_cancelado';

export const DELIVERY_STAGES: { key: DeliveryStage; label: string; color: string }[] = [
    { key: 'aguardando_agendamento', label: 'Aguardando Agendamento', color: '#6B7280' },
    { key: 'procedimento_agendado',  label: 'Procedimento Agendado',  color: '#3B82F6' },
    { key: 'procedimento_confirmado',label: 'Procedimento Confirmado',color: '#8B5CF6' },
    { key: 'procedimento_concluido', label: 'Procedimento Concluído', color: '#10B981' },
    { key: 'procedimento_cancelado', label: 'Procedimento Cancelado', color: '#EF4444' },
];

export interface Delivery {
    id: string;
    user_id: string;
    patient_id?: string;
    service_id?: string;
    professional_id?: string;
    responsible_id?: string;
    stage: DeliveryStage;
    sale_date?: string;
    contact_date?: string;
    deadline_date?: string;
    notes?: string;
    appointment_id?: string;
    created_at: string;
    updated_at: string;
    // Joins:
    patient?: {
        id: string;
        nome: string;
        telefone: string;
        profile_pic_url?: string;
        contact_id?: string;
        contacts?: { profile_pic_url?: string };
    };
    service?: { id: string; name: string; price: number };
    professional?: { id: string; name: string };
    responsible?: { id: string; name: string };
}

export interface DeliveryFiltersState {
    professionalId?: string | null;
    patientId?: string | null;
    period?: { from: Date; to: Date } | null;
}
