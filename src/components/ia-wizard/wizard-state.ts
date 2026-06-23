export type WizardStepId =
  | 'empresa-info'
  | 'empresa-sobre'
  | 'faq-empresa'
  | 'faq-produtos'
  | 'configuracoes'
  | 'resumo';

export type WizardStageId =
  | 'empresa'
  | 'faq'
  | 'configuracoes';

export interface WizardStage {
  id: WizardStageId;
  label: string;
  iconName: string;
  steps: WizardStepId[];
}

export interface ChatMessage {
  id: string;
  role: 'bia' | 'user';
  content: string;
  timestamp: Date;
}

export interface WizardFaqItem {
  productId: string;
  productName: string;
  text: string;
}

export interface ProductServiceOption {
  id: string;
  name: string;
  type: string;
}

export interface WizardState {
  currentStepId: WizardStepId;
  visitedSteps: Set<WizardStepId>;

  // Etapa 1: Dados da empresa
  agent_name: string;
  name: string;
  address: string;
  link_google: string;
  site: string;
  instagram: string;
  facebook: string;
  description: string;
  opening_hours: string;
  payment: string;

  // FAQ
  companyFaq: string;
  faqItems: WizardFaqItem[];

  // Configurações
  scheduling_on: boolean;

  // Chat por step
  chatHistory: Record<WizardStepId, ChatMessage[]>;
}

// Payload para salvar no ia_config (apenas os campos cobertos pelo wizard)
export interface WizardConfigPayload {
  agent_name: string;
  name: string;
  address: string;
  link_google: string;
  site: string;
  instagram: string;
  facebook: string;
  description: string;
  opening_hours: string;
  payment: string;
  frequent_questions: string;
  scheduling_on: boolean;
}
