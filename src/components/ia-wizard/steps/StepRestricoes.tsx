import { Plus, Trash2 } from 'lucide-react';
import { WizardState, WizardRestriction } from '../wizard-state';
import { cn } from '@/lib/utils';

interface StepProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(field: K, value: WizardState[K]) => void;
}

export function StepRestricoes({ state, updateField }: StepProps) {
  const restrictions = state.restrictions;

  const addRestriction = () => {
    const newItem: WizardRestriction = {
      id: Math.random().toString(36).slice(2),
      text: '',
    };
    updateField('restrictions', [...restrictions, newItem]);
  };

  const updateRestriction = (id: string, text: string) => {
    updateField(
      'restrictions',
      restrictions.map(r => r.id === id ? { ...r, text } : r),
    );
  };

  const removeRestriction = (id: string) => {
    updateField('restrictions', restrictions.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-3">
      {restrictions.length === 0 && (
        <div className="text-center py-6 text-white/40 text-sm">
          <p>Nenhuma restrição adicionada ainda.</p>
          <p className="text-xs mt-1">Clique em "+ Adicionar" para começar</p>
        </div>
      )}

      {restrictions.map((item, index) => (
        <div
          key={item.id}
          className="flex items-center gap-2 animate-in slide-in-from-bottom-1 fade-in duration-200"
        >
          <span className="text-white/40 text-xs w-5 text-right flex-shrink-0">{index + 1}.</span>
          <input
            className="flex-1 px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-400/60 focus:border-violet-400/60 transition-all duration-200"
            placeholder="Ex: Casos de convênio transferir para atendente humano"
            value={item.text}
            onChange={e => updateRestriction(item.id, e.target.value)}
            autoFocus={index === restrictions.length - 1 && item.text === ''}
          />
          <button
            onClick={() => removeRestriction(item.id)}
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
              'text-white/40 hover:text-red-400 hover:bg-red-400/10',
              'transition-all duration-200',
            )}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        onClick={addRestriction}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm',
          'border border-dashed border-white/20 text-white/50',
          'hover:border-violet-400/60 hover:text-violet-300 hover:bg-violet-500/5',
          'transition-all duration-200',
        )}
      >
        <Plus className="w-4 h-4" />
        Adicionar Restrição
      </button>

      <p className="text-xs text-white/40 pt-1">
        Adicione apenas restrições específicas da sua empresa. O agente já possui regras gerais de comportamento.
      </p>
    </div>
  );
}
