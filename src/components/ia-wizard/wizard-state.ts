export type WizardStepId =
  | 'empresa-info'
  | 'empresa-sobre'
  | 'restricoes'
  | 'qualificacao'
  | 'faq-empresa'
  | 'faq-produtos'
  | 'convenios'
  | 'configuracoes'
  | 'resumo';

export type WizardStageId =
  | 'empresa'
  | 'restricoes'
  | 'qualificacao'
  | 'faq'
  | 'convenios'
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

export interface WizardRestriction {
  id: string;
  text: string;
}

export interface WizardQualifyItem {
  productId: string;
  productName: string;
  text: string;
}

export interface WizardFaqItem {
  productId: string;
  productName: string;
  text: string;
}

export interface WizardConvenioItem {
  id: string;
  nome: string;
  valorPrimeira: string;
  valorDemais: string;
  previsaoDias: number;
  descricao: string;
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

  // Etapa 2: Restrições
  restrictions: WizardRestriction[];

  // Etapa 3: Qualificação
  qualifyItems: WizardQualifyItem[];

  // Etapa 4: FAQ
  companyFaq: string;
  faqItems: WizardFaqItem[];

  // Etapa 5: Convênios
  convenioItems: WizardConvenioItem[];

  // Etapa 6: Configurações
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
  restrictions: string;
  qualify: string;
  frequent_questions: string;
  convenio: string;
  scheduling_on: boolean;
}
