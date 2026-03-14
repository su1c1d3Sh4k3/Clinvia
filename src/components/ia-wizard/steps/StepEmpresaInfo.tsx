import { WizardState } from '../wizard-state';

interface StepProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(field: K, value: WizardState[K]) => void;
}

const fieldClass = "w-full px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-400/60 focus:border-violet-400/60 transition-all duration-200";
const labelClass = "block text-xs font-medium text-white/70 mb-1.5";

export function StepEmpresaInfo({ state, updateField }: StepProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            Nome do Agente IA <span className="text-violet-400">*</span>
          </label>
          <input
            className={fieldClass}
            placeholder="Ex: Luna, Sofia, Bia..."
            value={state.agent_name}
            onChange={e => updateField('agent_name', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>
            Nome da Empresa <span className="text-violet-400">*</span>
          </label>
          <input
            className={fieldClass}
            placeholder="Ex: Clínica Estética Silva"
            value={state.name}
            onChange={e => updateField('name', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Endereço Completo <span className="text-violet-400">*</span>
        </label>
        <input
          className={fieldClass}
          placeholder="Ex: Rua das Flores, 123 - Centro, São Paulo - SP"
          value={state.address}
          onChange={e => updateField('address', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Link do Google Maps</label>
          <input
            className={fieldClass}
            placeholder="https://maps.app.goo.gl/..."
            value={state.link_google}
            onChange={e => updateField('link_google', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Site</label>
          <input
            className={fieldClass}
            placeholder="https://minhaempresa.com.br"
            value={state.site}
            onChange={e => updateField('site', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Instagram</label>
          <input
            className={fieldClass}
            placeholder="@minhaempresa"
            value={state.instagram}
            onChange={e => updateField('instagram', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Facebook</label>
          <input
            className={fieldClass}
            placeholder="/MinhaEmpresaOficial"
            value={state.facebook}
            onChange={e => updateField('facebook', e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-white/40">
        <span className="text-violet-400">*</span> Campos obrigatórios
      </p>
    </div>
  );
}
