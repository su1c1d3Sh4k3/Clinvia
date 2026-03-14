import { useState, useCallback } from 'react';
import {
  WizardState,
  WizardStepId,
  WizardRestriction,
  WizardQualifyItem,
  WizardFaqItem,
  WizardConvenioItem,
  ChatMessage,
  WizardConfigPayload,
} from './wizard-state';
import { STEP_ORDER } from './bia-messages';

function createEmptyChatHistory(): Record<WizardStepId, ChatMessage[]> {
  const history: Partial<Record<WizardStepId, ChatMessage[]>> = {};
  for (const stepId of STEP_ORDER) {
    history[stepId] = [];
  }
  return history as Record<WizardStepId, ChatMessage[]>;
}

const initialState: WizardState = {
  currentStepId: 'empresa-info',
  visitedSteps: new Set<WizardStepId>(['empresa-info']),
  agent_name: '',
  name: '',
  address: '',
  link_google: '',
  site: '',
  instagram: '',
  facebook: '',
  description: '',
  opening_hours: '',
  payment: '',
  restrictions: [],
  qualifyItems: [],
  companyFaq: '',
  faqItems: [],
  convenioItems: [],
  scheduling_on: false,
  chatHistory: createEmptyChatHistory(),
};

function parseFaqFromText(text: string): { companyFaq: string; faqItems: WizardFaqItem[] } {
  if (!text) return { companyFaq: '', faqItems: [] };

  const sections = text.split(/\n(?=\d+\.\s*-)/).filter(Boolean);
  let companyFaq = '';
  const faqItems: WizardFaqItem[] = [];

  for (const section of sections) {
    const headerMatch = section.match(/^\d+\.\s*-\s*(.+?):\s*\n([\s\S]*)$/);
    if (!headerMatch) continue;

    const title = headerMatch[1].trim();
    const content = headerMatch[2].trim();

    if (title.toLowerCase().includes('empresa')) {
      companyFaq = content;
    } else {
      faqItems.push({
        productId: '',
        productName: title,
        text: content,
      });
    }
  }

  return { companyFaq, faqItems };
}

function parseQualifyFromText(text: string): WizardQualifyItem[] {
  if (!text) return [];

  const sections = text.split(/\n(?=\d+\.\s*-)/).filter(Boolean);
  return sections.map(section => {
    const headerMatch = section.match(/^\d+\.\s*-\s*(.+?):\s*\n([\s\S]*)$/);
    if (!headerMatch) return null;
    return {
      productId: '',
      productName: headerMatch[1].trim(),
      text: headerMatch[2].trim(),
    } as WizardQualifyItem;
  }).filter(Boolean) as WizardQualifyItem[];
}

function parseRestrictionsFromText(text: string): WizardRestriction[] {
  if (!text) return [];
  return text
    .split('\n')
    .filter(line => line.trim().startsWith('-'))
    .map(line => ({
      id: Math.random().toString(36).slice(2),
      text: line.replace(/^-\s*/, '').trim(),
    }))
    .filter(r => r.text);
}

function parseConvenioFromText(text: string): WizardConvenioItem[] {
  if (!text) return [];
  const blocks = text.split(/\n(?=\d+\.\s)/).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const nomeMatch = lines[0]?.match(/^\d+\.\s+(.+)$/);
    const nome = nomeMatch ? nomeMatch[1] : '';

    const get = (prefix: string) => {
      const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
      return line ? line.replace(/^[^:]+:\s*/, '').trim() : '';
    };

    const previsaoLine = lines.find(l => l.toLowerCase().includes('previsão') || l.toLowerCase().includes('previsao'));
    let previsaoDias = 0;
    if (previsaoLine) {
      const match = previsaoLine.match(/(\d+)\s*dias?/);
      if (match) previsaoDias = parseInt(match[1], 10);
    }

    return {
      id: Math.random().toString(36).slice(2),
      nome,
      valorPrimeira: get('- Valor da Primeira'),
      valorDemais: get('- Valor das Demais'),
      previsaoDias,
      descricao: get('- Descrição'),
    };
  }).filter(c => c.nome);
}

interface ExistingConfig {
  agent_name?: string;
  name?: string;
  address?: string;
  link_google?: string;
  site?: string;
  instagram?: string;
  facebook?: string;
  description?: string;
  opening_hours?: string;
  payment?: string;
  restrictions?: string;
  qualify?: string;
  frequent_questions?: string;
  convenio?: string;
  scheduling_on?: boolean;
}

function mapConfigToWizardState(config: ExistingConfig, base: WizardState): WizardState {
  const { companyFaq, faqItems } = parseFaqFromText(config.frequent_questions ?? '');
  return {
    ...base,
    agent_name: config.agent_name ?? '',
    name: config.name ?? '',
    address: config.address ?? '',
    link_google: config.link_google ?? '',
    site: config.site ?? '',
    instagram: config.instagram ?? '',
    facebook: config.facebook ?? '',
    description: config.description ?? '',
    opening_hours: config.opening_hours ?? '',
    payment: config.payment ?? '',
    restrictions: parseRestrictionsFromText(config.restrictions ?? ''),
    qualifyItems: parseQualifyFromText(config.qualify ?? ''),
    companyFaq,
    faqItems,
    convenioItems: parseConvenioFromText(config.convenio ?? ''),
    scheduling_on: config.scheduling_on ?? false,
  };
}

function formatRestrictions(items: WizardRestriction[]): string {
  return items
    .filter(r => r.text.trim())
    .map(r => `- ${r.text.trim()}`)
    .join('\n');
}

function formatQualify(items: WizardQualifyItem[]): string {
  return items
    .filter(q => q.productName && q.text.trim())
    .map((q, i) => `${i + 1}. - ${q.productName}:\n${q.text.trim()}`)
    .join('\n\n');
}

function formatFrequentQuestions(companyFaq: string, faqItems: WizardFaqItem[]): string {
  const parts: string[] = [];
  let idx = 1;
  if (companyFaq.trim()) {
    parts.push(`${idx}. - Dúvidas frequentes sobre a empresa:\n${companyFaq.trim()}`);
    idx++;
  }
  for (const item of faqItems.filter(f => f.productName && f.text.trim())) {
    parts.push(`${idx}. - ${item.productName}:\n${item.text.trim()}`);
    idx++;
  }
  return parts.join('\n\n');
}

function formatConvenio(items: WizardConvenioItem[]): string {
  return items
    .filter(c => c.nome.trim())
    .map((c, i) => {
      const lines = [
        `${i + 1}. ${c.nome}`,
        `- Valor da Primeira Consulta: ${c.valorPrimeira || 'Não informado'}`,
        `- Valor das Demais Consultas: ${c.valorDemais || 'Não informado'}`,
        `- Previsão de agendamento para ${c.previsaoDias || 0} dias`,
      ];
      if (c.descricao.trim()) lines.push(`- Descrição: ${c.descricao.trim()}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function useWizardState(existingConfig?: ExistingConfig | null) {
  const [state, setState] = useState<WizardState>(() => {
    if (existingConfig) {
      return mapConfigToWizardState(existingConfig, initialState);
    }
    return initialState;
  });

  const goToStep = useCallback((stepId: WizardStepId) => {
    setState(prev => ({
      ...prev,
      currentStepId: stepId,
      visitedSteps: new Set([...prev.visitedSteps, stepId]),
    }));
  }, []);

  const goNext = useCallback(() => {
    setState(prev => {
      const idx = STEP_ORDER.indexOf(prev.currentStepId);
      if (idx < STEP_ORDER.length - 1) {
        const nextStep = STEP_ORDER[idx + 1];
        return {
          ...prev,
          currentStepId: nextStep,
          visitedSteps: new Set([...prev.visitedSteps, nextStep]),
        };
      }
      return prev;
    });
  }, []);

  const goBack = useCallback(() => {
    setState(prev => {
      const idx = STEP_ORDER.indexOf(prev.currentStepId);
      if (idx > 0) {
        return { ...prev, currentStepId: STEP_ORDER[idx - 1] };
      }
      return prev;
    });
  }, []);

  const updateField = useCallback(<K extends keyof WizardState>(field: K, value: WizardState[K]) => {
    setState(prev => ({ ...prev, [field]: value }));
  }, []);

  const addChatMessage = useCallback((stepId: WizardStepId, message: ChatMessage) => {
    setState(prev => ({
      ...prev,
      chatHistory: {
        ...prev.chatHistory,
        [stepId]: [...(prev.chatHistory[stepId] ?? []), message],
      },
    }));
  }, []);

  const stepIndex = STEP_ORDER.indexOf(state.currentStepId);
  const progress = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100);

  const toConfigPayload = useCallback((): WizardConfigPayload => {
    return {
      agent_name: state.agent_name,
      name: state.name,
      address: state.address,
      link_google: state.link_google,
      site: state.site,
      instagram: state.instagram,
      facebook: state.facebook,
      description: state.description,
      opening_hours: state.opening_hours,
      payment: state.payment,
      restrictions: formatRestrictions(state.restrictions),
      qualify: formatQualify(state.qualifyItems),
      frequent_questions: formatFrequentQuestions(state.companyFaq, state.faqItems),
      convenio: formatConvenio(state.convenioItems),
      scheduling_on: state.scheduling_on,
    };
  }, [state]);

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEP_ORDER.length - 1;

  return {
    state,
    goToStep,
    goNext,
    goBack,
    updateField,
    addChatMessage,
    progress,
    stepIndex,
    isFirstStep,
    isLastStep,
    toConfigPayload,
  };
}
