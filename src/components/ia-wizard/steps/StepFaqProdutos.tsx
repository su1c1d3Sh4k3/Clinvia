import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { WizardState, WizardFaqItem, ProductServiceOption } from '../wizard-state';
import { cn } from '@/lib/utils';

interface StepProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(field: K, value: WizardState[K]) => void;
  productsServices?: ProductServiceOption[];
}

export function StepFaqProdutos({ state, updateField, productsServices = [] }: StepProps) {
  const items = state.faqItems;

  const addItem = () => {
    const newItem: WizardFaqItem = {
      productId: '',
      productName: '',
      text: '',
    };
    updateField('faqItems', [...items, newItem]);
  };

  const updateItem = (index: number, changes: Partial<WizardFaqItem>) => {
    updateField(
      'faqItems',
      items.map((item, i) => i === index ? { ...item, ...changes } : item),
    );
  };

  const removeItem = (index: number) => {
    updateField('faqItems', items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <div className="text-center py-6 text-white/40 text-sm">
          <p>Nenhum FAQ de produto/serviço adicionado.</p>
          <p className="text-xs mt-1">
            Adicione as dúvidas mais frequentes sobre cada produto ou serviço.
          </p>
        </div>
      )}

      {items.map((item, index) => (
        <div
          key={index}
          className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3 animate-in slide-in-from-bottom-1 fade-in duration-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/60">FAQ {index + 1}</span>
            <button
              onClick={() => removeItem(index)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <FaqProductSelect
            value={item.productId}
            productName={item.productName}
            options={productsServices}
            onChange={(id, name) => updateItem(index, { productId: id, productName: name })}
          />

          <textarea
            className="w-full px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-400/60 transition-all duration-200 resize-none"
            rows={5}
            placeholder={`P: Quanto tempo dura o resultado?
R: O resultado dura em média 6 meses.

P: Tem contraindicações?
R: Não recomendado para grávidas e pessoas com alergia ao produto.`}
            value={item.text}
            onChange={e => updateItem(index, { text: e.target.value })}
          />
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
        Adicionar FAQ de Produto/Serviço
      </button>
    </div>
  );
}

interface FaqProductSelectProps {
  value: string;
  productName: string;
  options: ProductServiceOption[];
  onChange: (id: string, name: string) => void;
}

function FaqProductSelect({ value, productName, options, onChange }: FaqProductSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);
  const displayName = selected?.name ?? productName;

  if (options.length === 0) {
    return (
      <input
        className="w-full px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-400/60 transition-all duration-200"
        placeholder="Nome do produto/serviço"
        value={productName}
        onChange={e => onChange('', e.target.value)}
      />
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white hover:border-violet-400/60 transition-all duration-200"
      >
        <span className={displayName ? 'text-white' : 'text-white/40'}>
          {displayName || 'Selecionar produto/serviço...'}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-white/40 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-xl bg-[#1a0533] border border-white/20 overflow-hidden shadow-2xl">
          <div className="max-h-48 overflow-y-auto">
            {options.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id, opt.name);
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 transition-colors duration-150',
                  opt.id === value ? 'text-violet-300 bg-violet-500/10' : 'text-white/80',
                )}
              >
                <span className="text-white/40 text-xs mr-2">
                  {opt.type === 'product' ? 'Produto' : 'Serviço'}
                </span>
                {opt.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
