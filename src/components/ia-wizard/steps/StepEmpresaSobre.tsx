import { WizardState } from '../wizard-state';

interface StepProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(field: K, value: WizardState[K]) => void;
}

const fieldClass = "w-full px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-400/60 focus:border-violet-400/60 transition-all duration-200 resize-none";
const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-400/60 focus:border-violet-400/60 transition-all duration-200";
const labelClass = "block text-xs font-medium text-white/70 mb-1.5";

export function StepEmpresaSobre({ state, updateField }: StepProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Descrição da Empresa</label>
        <textarea
          className={fieldClass}
          rows={4}
          placeholder="Descreva o que sua empresa faz, seus diferenciais, área de atuação, tempo de mercado..."
          value={state.description}
          onChange={e => updateField('description', e.target.value)}
        />
        <p className="text-xs text-white/40 mt-1">
          Escreva com suas palavras. Quanto mais detalhado, melhor o agente vai se apresentar aos clientes.
        </p>
      </div>

      <div>
        <label className={labelClass}>Horário de Funcionamento</label>
        <input
          className={inputClass}
          placeholder="Ex: Seg a Sex: 8h às 18h | Sáb: 9h às 13h | Dom: Fechado"
          value={state.opening_hours}
          onChange={e => updateField('opening_hours', e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass}>Formas de Pagamento</label>
        <input
          className={inputClass}
          placeholder="Ex: PIX, Cartão de Crédito (até 12x), Cartão de Débito, Dinheiro"
          value={state.payment}
          onChange={e => updateField('payment', e.target.value)}
        />
      </div>
    </div>
  );
}
