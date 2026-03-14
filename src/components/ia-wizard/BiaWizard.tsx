import { createPortal } from 'react-dom';
import { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

import { useWizardState } from './useWizardState';
import { BiaTimeline, MobileProgressBar } from './BiaTimeline';
import { BiaStepContainer } from './BiaStepContainer';
import { BiaAvatar } from './BiaAvatar';
import { ChatMessage, WizardState, WizardStepId, ProductServiceOption } from './wizard-state';
import { STEP_ORDER, STEP_LABELS } from './bia-messages';

import { StepEmpresaInfo } from './steps/StepEmpresaInfo';
import { StepEmpresaSobre } from './steps/StepEmpresaSobre';
import { StepRestricoes } from './steps/StepRestricoes';
import { StepQualificacao } from './steps/StepQualificacao';
import { StepFaqEmpresa } from './steps/StepFaqEmpresa';
import { StepFaqProdutos } from './steps/StepFaqProdutos';
import { StepConvenios } from './steps/StepConvenios';
import { StepConfiguracoes } from './steps/StepConfiguracoes';
import { StepResumo } from './steps/StepResumo';

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

interface BiaWizardProps {
  open: boolean;
  onClose: () => void;
  existingConfig: ExistingConfig | null;
  ownerId: string;
  productsServices: ProductServiceOption[];
  onSaveSuccess: () => void;
}

interface StepRendererProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(field: K, value: WizardState[K]) => void;
  productsServices: ProductServiceOption[];
  onGoToStep: (stepId: WizardStepId) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

function renderStep(stepId: WizardStepId, props: StepRendererProps) {
  const { state, updateField, productsServices, onGoToStep, onSave, isSaving } = props;
  switch (stepId) {
    case 'empresa-info':
      return <StepEmpresaInfo state={state} updateField={updateField} />;
    case 'empresa-sobre':
      return <StepEmpresaSobre state={state} updateField={updateField} />;
    case 'restricoes':
      return <StepRestricoes state={state} updateField={updateField} />;
    case 'qualificacao':
      return <StepQualificacao state={state} updateField={updateField} productsServices={productsServices} />;
    case 'faq-empresa':
      return <StepFaqEmpresa state={state} updateField={updateField} />;
    case 'faq-produtos':
      return <StepFaqProdutos state={state} updateField={updateField} productsServices={productsServices} />;
    case 'convenios':
      return <StepConvenios state={state} updateField={updateField} />;
    case 'configuracoes':
      return <StepConfiguracoes state={state} updateField={updateField} />;
    case 'resumo':
      return (
        <StepResumo
          state={state}
          onGoToStep={onGoToStep}
          onSave={onSave}
          isSaving={isSaving}
        />
      );
    default:
      return null;
  }
}

export function BiaWizard({ open, onClose, existingConfig, ownerId, productsServices, onSaveSuccess }: BiaWizardProps) {
  const [isSaving, setIsSaving] = useState(false);

  const {
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
  } = useWizardState(existingConfig);

  const handleSendMessage = (msg: ChatMessage) => {
    addChatMessage(state.currentStepId, msg);
  };

  const handleBiaResponse = (msg: ChatMessage) => {
    addChatMessage(state.currentStepId, msg);
  };

  const handleFillField = (field: string, value: string) => {
    const fillableFields: (keyof WizardState)[] = [
      'agent_name', 'name', 'address', 'link_google', 'site', 'instagram', 'facebook',
      'description', 'opening_hours', 'payment', 'companyFaq',
    ];
    if (fillableFields.includes(field as keyof WizardState)) {
      updateField(field as keyof WizardState, value as never);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = toConfigPayload();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ia_config')
        .upsert(
          { ...payload, user_id: ownerId },
          { onConflict: 'user_id' },
        )
        .select()
        .single();

      if (error) {
        console.error('[BiaWizard] Supabase upsert error:', error);
        throw error;
      }
      onSaveSuccess();
    } catch (err) {
      console.error('[BiaWizard] handleSave error:', err);
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Erro ao salvar: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  const stepRendererProps: StepRendererProps = {
    state,
    updateField,
    productsServices,
    onGoToStep: goToStep,
    onSave: handleSave,
    isSaving,
  };

  const isResumoStep = state.currentStepId === 'resumo';

  const content = (
    <div className="fixed inset-0 z-[100] flex">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a0533] via-[#0d1b4b] to-[#0a2545]" />

      {/* Subtle noise overlay */}
      <div className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)',
        }}
      />

      {/* Main layout */}
      <div className="relative z-10 flex w-full h-full overflow-hidden">

        {/* Left sidebar: Timeline */}
        <aside className="hidden md:flex flex-col w-72 flex-shrink-0 border-r border-white/10 bg-white/5 backdrop-blur-sm">
          {/* Sidebar header */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
            <BiaAvatar size="md" />
            <div>
              <p className="text-sm font-semibold text-white">Assistente Bia</p>
              <p className="text-xs text-white/50">Configuração de IA</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <BiaTimeline
              currentStepId={state.currentStepId}
              visitedSteps={state.visitedSteps}
              onStepClick={goToStep}
            />
          </div>

          {/* Progress */}
          <div className="px-5 py-4 border-t border-white/10">
            <div className="flex items-center justify-between text-xs text-white/50 mb-2">
              <span>Progresso</span>
              <span className="font-semibold text-white/80">{progress}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-400 to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Mobile progress */}
          <div className="md:hidden">
            <MobileProgressBar
              stepIndex={stepIndex}
              totalSteps={STEP_ORDER.length}
              currentStepId={state.currentStepId}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 md:px-8 py-4 border-b border-white/10">
            <div>
              <h2 className="text-base md:text-lg font-bold text-white">
                {STEP_LABELS[state.currentStepId]}
              </h2>
              <p className="text-xs text-white/50">
                Passo {stepIndex + 1} de {STEP_ORDER.length}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5">
            <div
              key={state.currentStepId}
              className="animate-in slide-in-from-right-4 fade-in duration-300 max-w-2xl"
            >
              <BiaStepContainer
                stepId={state.currentStepId}
                chatHistory={state.chatHistory[state.currentStepId] ?? []}
                state={state}
                ownerId={ownerId}
                onSendMessage={handleSendMessage}
                onBiaResponse={handleBiaResponse}
                onFillField={handleFillField}
              >
                {renderStep(state.currentStepId, stepRendererProps)}
              </BiaStepContainer>
            </div>
          </div>

          {/* Footer navigation */}
          {!isResumoStep && (
            <div className="flex items-center justify-between px-5 md:px-8 py-4 border-t border-white/10 bg-white/3">
              <button
                onClick={goBack}
                disabled={isFirstStep}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium',
                  'transition-all duration-200',
                  isFirstStep
                    ? 'opacity-0 pointer-events-none'
                    : 'text-white/70 hover:text-white hover:bg-white/10',
                )}
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>

              <div className="flex gap-1.5">
                {STEP_ORDER.map((id, i) => (
                  <span
                    key={id}
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all duration-300',
                      i === stepIndex
                        ? 'bg-violet-400 scale-125'
                        : i < stepIndex
                          ? 'bg-white/40'
                          : 'bg-white/15',
                    )}
                  />
                ))}
              </div>

              <button
                onClick={goNext}
                disabled={isLastStep}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold',
                  'transition-all duration-200',
                  isLastStep
                    ? 'opacity-0 pointer-events-none'
                    : 'bg-violet-500 hover:bg-violet-400 text-white shadow-lg shadow-violet-500/20',
                )}
              >
                Próximo
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Resumo step: just a back button */}
          {isResumoStep && (
            <div className="flex items-center px-5 md:px-8 py-4 border-t border-white/10">
              <button
                onClick={goBack}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar para Configurações
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
