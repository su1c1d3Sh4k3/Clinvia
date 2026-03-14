import {
  Building2, Ban, Target, HelpCircle, Heart, Settings,
  CheckCircle2, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardStepId, WizardStageId } from './wizard-state';
import { WIZARD_STAGES, STEP_ORDER, STEP_LABELS, STEP_DESCRIPTIONS } from './bia-messages';

const ICON_MAP: Record<string, LucideIcon> = {
  Building2,
  Ban,
  Target,
  HelpCircle,
  Heart,
  Settings,
};

interface BiaTimelineProps {
  currentStepId: WizardStepId;
  visitedSteps: Set<WizardStepId>;
  onStepClick?: (stepId: WizardStepId) => void;
}

function getStageStatus(
  stageSteps: WizardStepId[],
  currentStepId: WizardStepId,
  visitedSteps: Set<WizardStepId>,
): 'completed' | 'current' | 'pending' {
  const currentIdx = STEP_ORDER.indexOf(currentStepId);
  const lastStageStepIdx = Math.max(...stageSteps.map(s => STEP_ORDER.indexOf(s)));
  const firstStageStepIdx = Math.min(...stageSteps.map(s => STEP_ORDER.indexOf(s)));

  if (currentIdx > lastStageStepIdx) return 'completed';
  if (currentIdx >= firstStageStepIdx && currentIdx <= lastStageStepIdx) return 'current';
  return 'pending';
}

function getCurrentStageId(currentStepId: WizardStepId): WizardStageId | null {
  for (const stage of WIZARD_STAGES) {
    if ((stage.steps as WizardStepId[]).includes(currentStepId)) return stage.id;
  }
  return null;
}

export function BiaTimeline({ currentStepId, visitedSteps, onStepClick }: BiaTimelineProps) {
  const currentStageId = getCurrentStageId(currentStepId);

  return (
    <div className="flex flex-col gap-0 py-2">
      {WIZARD_STAGES.map((stage, stageIdx) => {
        const Icon = ICON_MAP[stage.iconName] ?? Settings;
        const status = getStageStatus(stage.steps as WizardStepId[], currentStepId, visitedSteps);
        const isLast = stageIdx === WIZARD_STAGES.length - 1;

        return (
          <div key={stage.id} className="relative">
            {/* Vertical connector line */}
            {!isLast && (
              <div
                className={cn(
                  'absolute left-5 top-10 w-0.5 h-full',
                  'transition-all duration-500',
                  status === 'completed'
                    ? 'bg-gradient-to-b from-green-400 to-violet-400'
                    : 'bg-white/15',
                )}
              />
            )}

            <div className="flex items-start gap-3 py-2 px-2">
              {/* Stage icon */}
              <div
                className={cn(
                  'relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  'transition-all duration-300',
                  status === 'completed' && 'bg-green-400/20 border-2 border-green-400',
                  status === 'current' && 'bg-violet-500/30 border-2 border-violet-400 shadow-lg shadow-violet-500/30',
                  status === 'pending' && 'bg-white/5 border-2 border-white/20',
                )}
              >
                {status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : (
                  <Icon
                    className={cn(
                      'w-5 h-5 transition-colors duration-300',
                      status === 'current' ? 'text-violet-300' : 'text-white/40',
                    )}
                  />
                )}
              </div>

              {/* Stage label and sub-steps */}
              <div className="flex-1 min-w-0 pt-1">
                <span
                  className={cn(
                    'text-sm font-semibold transition-colors duration-300 leading-none',
                    status === 'completed' && 'text-green-400',
                    status === 'current' && 'text-white',
                    status === 'pending' && 'text-white/40',
                  )}
                >
                  {stage.label}
                </span>

                {/* Sub-steps visible when stage is current */}
                {status === 'current' && (
                  <div className="mt-1.5 space-y-1">
                    {(stage.steps as WizardStepId[]).map(stepId => {
                      const isCurrentStep = stepId === currentStepId;
                      const isVisited = visitedSteps.has(stepId);

                      return (
                        <button
                          key={stepId}
                          onClick={() => isVisited && onStepClick?.(stepId)}
                          className={cn(
                            'flex items-center gap-2 w-full text-left',
                            'transition-all duration-200',
                            isVisited && !isCurrentStep && 'cursor-pointer hover:opacity-80',
                            !isVisited && 'cursor-default',
                          )}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-300',
                              isCurrentStep ? 'bg-violet-300 scale-125' : isVisited ? 'bg-white/50' : 'bg-white/20',
                            )}
                          />
                          <span
                            className={cn(
                              'text-xs transition-colors duration-300',
                              isCurrentStep ? 'text-white/80 font-medium' : 'text-white/40',
                            )}
                          >
                            {STEP_LABELS[stepId]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Completed stage description */}
                {status === 'completed' && (
                  <p className="text-xs text-white/40 mt-0.5">Concluído</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Mobile progress bar
interface MobileProgressBarProps {
  stepIndex: number;
  totalSteps: number;
  currentStepId: WizardStepId;
}

export function MobileProgressBar({ stepIndex, totalSteps, currentStepId }: MobileProgressBarProps) {
  const progress = Math.round((stepIndex / (totalSteps - 1)) * 100);

  return (
    <div className="px-4 py-3 border-b border-white/10">
      <div className="flex items-center justify-between text-xs text-white/60 mb-2">
        <span className="font-medium text-white/80">{STEP_LABELS[currentStepId]}</span>
        <span>{stepIndex + 1} de {totalSteps}</span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-400 to-blue-400 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-white/40 mt-1">{STEP_DESCRIPTIONS[currentStepId]}</p>
    </div>
  );
}
