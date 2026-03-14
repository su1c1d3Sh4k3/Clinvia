import { Plus, Trash2 } from 'lucide-react';
import { WizardState, WizardConvenioItem } from '../wizard-state';
import { cn } from '@/lib/utils';

interface StepProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(field: K, value: WizardState[K]) => void;
}

const fieldClass = "w-full px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-400/60 focus:border-violet-400/60 transition-all duration-200";
const labelClass = "block text-xs font-medium text-white/60 mb-1";

function formatCurrency(value: string): string {
  const nums = value.replace(/\D/g, '');
  if (!nums) return '';
  const cents = parseInt(nums, 10);
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseCurrencyInput(value: string): string {
  const nums = value.replace(/\D/g, '');
  if (!nums) return '';
  const cents = parseInt(nums, 10);
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function StepConvenios({ state, updateField }: StepProps) {
  const items = state.convenioItems;

  const addItem = () => {
    const newItem: WizardConvenioItem = {
      id: Math.random().toString(36).slice(2),
      nome: '',
      valorPrimeira: '',
      valorDemais: '',
      previsaoDias: 15,
      descricao: '',
    };
    updateField('convenioItems', [...items, newItem]);
  };

  const updateItem = (id: string, changes: Partial<WizardConvenioItem>) => {
    updateField(
      'convenioItems',
      items.map(item => item.id === id ? { ...item, ...changes } : item),
    );
  };

  const removeItem = (id: string) => {
    updateField('convenioItems', items.filter(item => item.id !== id));
  };

  const handleCurrencyChange = (id: string, field: 'valorPrimeira' | 'valorDemais', raw: string) => {
    const formatted = parseCurrencyInput(raw);
    updateItem(id, { [field]: formatted });
  };

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <div className="text-center py-6 text-white/40 text-sm">
          <p>Nenhum convênio cadastrado.</p>
          <p className="text-xs mt-1">
            Se não trabalha com convênios, clique em <strong className="text-white/60">Próximo</strong> para pular.
          </p>
        </div>
      )}

      {items.map((item, index) => (
        <div
          key={item.id}
          className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3 animate-in slide-in-from-bottom-1 fade-in duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white/70">
              Convênio {index + 1}
            </span>
            <button
              onClick={() => removeItem(item.id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <label className={labelClass}>Nome do Convênio</label>
            <input
              className={fieldClass}
              placeholder="Ex: Unimed, Bradesco Saúde, SulAmérica..."
              value={item.nome}
              onChange={e => updateItem(item.id, { nome: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Valor da 1ª Consulta</label>
              <input
                className={fieldClass}
                placeholder="R$ 0,00"
                value={item.valorPrimeira}
                onChange={e => handleCurrencyChange(item.id, 'valorPrimeira', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Valor das Demais</label>
              <input
                className={fieldClass}
                placeholder="R$ 0,00"
                value={item.valorDemais}
                onChange={e => handleCurrencyChange(item.id, 'valorDemais', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Previsão de Vaga (dias)</label>
            <input
              type="number"
              min={1}
              max={365}
              className={fieldClass}
              placeholder="15"
              value={item.previsaoDias || ''}
              onChange={e => updateItem(item.id, { previsaoDias: parseInt(e.target.value, 10) || 0 })}
            />
          </div>

          <div>
            <label className={labelClass}>Descrição (opcional)</label>
            <textarea
              className={cn(fieldClass, 'resize-none')}
              rows={2}
              placeholder="Informações adicionais sobre este convênio..."
              value={item.descricao}
              onChange={e => updateItem(item.id, { descricao: e.target.value })}
            />
          </div>
        </div>
      ))}

      <button
        onClick={addItem}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm',
          'border border-dashed border-white/20 text-white/50',
          'hover:border-violet-400/60 hover:text-violet-300 hover:bg-violet-500/5',
          'transition-all duration-200',
        )}
      >
        <Plus className="w-4 h-4" />
        Adicionar Convênio
      </button>
    </div>
  );
}
