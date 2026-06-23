import { useState, useCallback } from 'react';
import {
  WizardState,
  WizardStepId,
  WizardFaqItem,
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
  companyFaq: '',
  faqItems: [],
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
  frequent_questions?: string;
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
    companyFaq,
    faqItems,
    scheduling_on: config.scheduling_on ?? false,
  };
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
      frequent_questions: formatFrequentQuestions(state.companyFaq, state.faqItems),
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
