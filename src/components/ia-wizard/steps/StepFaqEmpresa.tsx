import { WizardState } from '../wizard-state';

interface StepProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(field: K, value: WizardState[K]) => void;
}

export function StepFaqEmpresa({ state, updateField }: StepProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-white/70 mb-1.5">
          Dúvidas Frequentes sobre a Empresa
        </label>
        <textarea
          className="w-full px-4 py-2.5 rounded-xl text-sm bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-violet-400/60 focus:border-violet-400/60 transition-all duration-200 resize-none"
          rows={10}
          placeholder={`P: Onde vocês ficam localizados?
R: Estamos na Rua das Flores, 123, Centro.

P: Quais são os horários de atendimento?
R: Atendemos de segunda a sexta das 8h às 18h, e sábado das 9h às 13h.

P: Como faço para cancelar uma consulta?
R: Para cancelamentos, entre em contato com 24h de antecedência.`}
          value={state.companyFaq}
          onChange={e => updateField('companyFaq', e.target.value)}
        />
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
        <p className="text-xs font-semibold text-white/60">Dicas de perguntas para cadastrar:</p>
        <ul className="text-xs text-white/40 space-y-1">
          <li>• Onde vocês ficam? Tem estacionamento?</li>
          <li>• Quais os horários de atendimento?</li>
          <li>• Como cancelo ou remarco uma consulta?</li>
          <li>• Vocês atendem convênio?</li>
          <li>• Como posso entrar em contato?</li>
          <li>• Qual o tempo médio de espera?</li>
        </ul>
      </div>

      <p className="text-xs text-white/40">
        Use o formato <strong className="text-white/60">P:</strong> para perguntas e <strong className="text-white/60">R:</strong> para respostas.
        Separe cada par com uma linha em branco.
      </p>
    </div>
  );
}
