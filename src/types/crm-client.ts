export const CRM_STAGES = [
  'Em Atendimento Humano',
  'Em Atendimento IA',
  'Qualificado',
  'Agendado',
  'Suporte',
  'Financeiro',
  'Pós-Venda',
  'Recorrencia',
  'Follow Up',
  'Sem Contato',
  'Sem Interesse',
  'Ganho',
  'Perdido',
  'Finalizado',
] as const;

export type CrmStage = typeof CRM_STAGES[number];

export const TERMINAL_STAGES: CrmStage[] = ['Ganho', 'Perdido', 'Finalizado'];

/** Stages that auto-route to a specific queue */
export const STAGE_QUEUE_MAP: Partial<Record<CrmStage, string>> = {
  'Em Atendimento Humano': 'Atendimento Humano',
  'Em Atendimento IA': 'Atendimento IA',
  'Suporte': 'Suporte',
  'Financeiro': 'Financeiro',
  'Pós-Venda': 'Pós-Venda',
};

export const STAGE_COLORS: Record<CrmStage, string> = {
  'Em Atendimento Humano': '#3b82f6',
  'Em Atendimento IA': '#8b5cf6',
  'Qualificado': '#06b6d4',
  'Agendado': '#f59e0b',
  'Suporte': '#ec4899',
  'Financeiro': '#10b981',
  'Pós-Venda': '#14b8a6',
  'Recorrencia': '#6366f1',
  'Follow Up': '#f97316',
  'Sem Contato': '#94a3b8',
  'Sem Interesse': '#ef4444',
  'Ganho': '#22c55e',
  'Perdido': '#dc2626',
  'Finalizado': '#6b7280',
};

export interface CrmClient {
  id: string;
  user_id: string;
  contact_id: string;
  stage: CrmStage;
  stage_changed_at: string;
  value: number;
  responsible_id: string | null;
  professional_id: string | null;
  loss_reason: string | null;
  loss_reason_other: string | null;
  priority: 'low' | 'medium' | 'high' | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  contact?: {
    id: string;
    push_name: string;
    phone: string | null;
    number: string | null;
    profile_pic_url: string | null;
  };
}

export interface CrmClientHistory {
  id: string;
  crm_client_id: string;
  user_id: string;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  metadata: any;
  created_at: string;
}

export interface CrmClientService {
  id: string;
  crm_client_id: string;
  service_client_id: string | null;
  service_name: string;
  quantity: number;
  unit_price: number;
  min_price: number;
  created_at: string;
}
