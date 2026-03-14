import { Calendar, UserCheck } from 'lucide-react';
import { WizardState } from '../wizard-state';
import { cn } from '@/lib/utils';

interface StepProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(field: K, value: WizardState[K]) => void;
}

export function StepConfiguracoes({ state, updateField }: StepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/60 leading-relaxed">
        Defina se o seu agente terá acesso à agenda do sistema para realizar agendamentos automaticamente.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Opção: Com agendamento */}
        <button
          onClick={() => updateField('scheduling_on', true)}
          className={cn(
            'relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 text-left',
            'transition-all duration-200',
            state.scheduling_on
              ? 'border-violet-400 bg-violet-500/15 shadow-lg shadow-violet-500/20'
              : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/8',
          )}
        >
          {state.scheduling_on && (
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-violet-400" />
          )}
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              state.scheduling_on ? 'bg-violet-500/30' : 'bg-white/10',
            )}
          >
            <Calendar className={cn('w-5 h-5', state.scheduling_on ? 'text-violet-300' : 'text-white/50')} />
          </div>
          <div>
            <p className={cn('font-semibold text-sm', state.scheduling_on ? 'text-white' : 'text-white/70')}>
              Com Agendamento
            </p>
            <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
              A IA acessa a agenda, verifica disponibilidade e agenda automaticamente durante o atendimento.
            </p>
          </div>
        </button>

        {/* Opção: Sem agendamento */}
        <button
          onClick={() => updateField('scheduling_on', false)}
          className={cn(
            'relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 text-left',
            'transition-all duration-200',
            !state.scheduling_on
              ? 'border-blue-400 bg-blue-500/15 shadow-lg shadow-blue-500/20'
              : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/8',
          )}
        >
          {!state.scheduling_on && (
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-400" />
          )}
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              !state.scheduling_on ? 'bg-blue-500/30' : 'bg-white/10',
            )}
          >
            <UserCheck className={cn('w-5 h-5', !state.scheduling_on ? 'text-blue-300' : 'text-white/50')} />
          </div>
          <div>
            <p className={cn('font-semibold text-sm', !state.scheduling_on ? 'text-white' : 'text-white/70')}>
              Sem Agendamento
            </p>
            <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
              A IA informa preços e serviços, mas encaminha solicitações de agendamento para um atendente humano.
            </p>
          </div>
        </button>
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <p className="text-xs font-semibold text-white/60 mb-2">Você selecionou:</p>
        {state.scheduling_on ? (
          <p className="text-sm text-violet-300">
            ✅ <strong>Agendamento ativo</strong> — O agente poderá verificar e marcar horários automaticamente.
          </p>
        ) : (
          <p className="text-sm text-blue-300">
            ℹ️ <strong>Sem agendamento</strong> — Solicitações de horário serão encaminhadas para sua equipe.
          </p>
        )}
      </div>
    </div>
  );
}
