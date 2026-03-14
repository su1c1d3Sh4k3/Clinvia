import { Pencil, Loader2, CheckCircle2, Building2, Ban, Target, HelpCircle, Heart, Settings, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WizardState, WizardStepId } from '../wizard-state';

interface StepProps {
  state: WizardState;
  onGoToStep: (stepId: WizardStepId) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  stepId: WizardStepId;
  onEdit: (stepId: WizardStepId) => void;
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyLabel?: string;
}

function ResumoSection({ title, icon, stepId, onEdit, children, isEmpty, emptyLabel }: SectionProps) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2">
          <span className="text-violet-400">{icon}</span>
          <span className="text-sm font-semibold text-white/90">{title}</span>
        </div>
        <button
          onClick={() => onEdit(stepId)}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-violet-300 transition-colors duration-200"
        >
          <Pencil className="w-3.5 h-3.5" />
          Editar
        </button>
      </div>
      <div className="px-4 py-3">
        {isEmpty ? (
          <p className="text-xs text-white/30 italic">{emptyLabel ?? 'Não preenchido'}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-white/40 flex-shrink-0 w-28">{label}:</span>
      <span className="text-white/80 break-all">{value}</span>
    </div>
  );
}

export function StepResumo({ state, onGoToStep, onSave, isSaving }: StepProps) {
  const hasEmpresa = state.name || state.agent_name;
  const hasSobre = state.description || state.opening_hours || state.payment;
  const hasRestricoes = state.restrictions.filter(r => r.text).length > 0;
  const hasQualify = state.qualifyItems.filter(q => q.productName && q.text).length > 0;
  const hasFaqEmpresa = !!state.companyFaq.trim();
  const hasFaqProdutos = state.faqItems.filter(f => f.productName && f.text).length > 0;
  const hasConvenios = state.convenioItems.filter(c => c.nome).length > 0;

  return (
    <div className="space-y-3">
      {/* Empresa - Info */}
      <ResumoSection
        title="Informações Básicas"
        icon={<Building2 className="w-4 h-4" />}
        stepId="empresa-info"
        onEdit={onGoToStep}
        isEmpty={!hasEmpresa}
        emptyLabel="Informações básicas não preenchidas"
      >
        <div className="space-y-1.5">
          <Row label="Nome do agente" value={state.agent_name} />
          <Row label="Empresa" value={state.name} />
          <Row label="Endereço" value={state.address} />
          <Row label="Google Maps" value={state.link_google} />
          <Row label="Site" value={state.site} />
          <Row label="Instagram" value={state.instagram} />
          <Row label="Facebook" value={state.facebook} />
        </div>
      </ResumoSection>

      {/* Empresa - Sobre */}
      <ResumoSection
        title="Sobre a Empresa"
        icon={<Building2 className="w-4 h-4" />}
        stepId="empresa-sobre"
        onEdit={onGoToStep}
        isEmpty={!hasSobre}
        emptyLabel="Descrição e horários não preenchidos"
      >
        <div className="space-y-1.5">
          {state.description && (
            <div className="text-xs">
              <span className="text-white/40">Descrição:</span>
              <p className="text-white/80 mt-0.5 line-clamp-3">{state.description}</p>
            </div>
          )}
          <Row label="Horário" value={state.opening_hours} />
          <Row label="Pagamento" value={state.payment} />
        </div>
      </ResumoSection>

      {/* Restrições */}
      <ResumoSection
        title="Restrições"
        icon={<Ban className="w-4 h-4" />}
        stepId="restricoes"
        onEdit={onGoToStep}
        isEmpty={!hasRestricoes}
        emptyLabel="Nenhuma restrição cadastrada"
      >
        <ul className="space-y-1">
          {state.restrictions.filter(r => r.text).map(r => (
            <li key={r.id} className="flex items-start gap-2 text-xs text-white/80">
              <span className="text-violet-400 mt-0.5">•</span>
              {r.text}
            </li>
          ))}
        </ul>
      </ResumoSection>

      {/* Qualificação */}
      <ResumoSection
        title="Qualificação"
        icon={<Target className="w-4 h-4" />}
        stepId="qualificacao"
        onEdit={onGoToStep}
        isEmpty={!hasQualify}
        emptyLabel="Nenhum fluxo de qualificação cadastrado"
      >
        <div className="space-y-2">
          {state.qualifyItems.filter(q => q.productName && q.text).map((q, i) => (
            <div key={i} className="text-xs">
              <span className="text-violet-300 font-medium">{q.productName}</span>
              <p className="text-white/60 mt-0.5 line-clamp-2">{q.text}</p>
            </div>
          ))}
        </div>
      </ResumoSection>

      {/* FAQ Empresa */}
      <ResumoSection
        title="FAQ da Empresa"
        icon={<HelpCircle className="w-4 h-4" />}
        stepId="faq-empresa"
        onEdit={onGoToStep}
        isEmpty={!hasFaqEmpresa}
        emptyLabel="FAQ da empresa não preenchido"
      >
        <p className="text-xs text-white/60 line-clamp-3">{state.companyFaq}</p>
      </ResumoSection>

      {/* FAQ Produtos */}
      <ResumoSection
        title="FAQ de Produtos/Serviços"
        icon={<HelpCircle className="w-4 h-4" />}
        stepId="faq-produtos"
        onEdit={onGoToStep}
        isEmpty={!hasFaqProdutos}
        emptyLabel="FAQ de produtos não preenchido"
      >
        <div className="space-y-2">
          {state.faqItems.filter(f => f.productName && f.text).map((f, i) => (
            <div key={i} className="text-xs">
              <span className="text-violet-300 font-medium">{f.productName}</span>
              <p className="text-white/60 mt-0.5 line-clamp-2">{f.text}</p>
            </div>
          ))}
        </div>
      </ResumoSection>

      {/* Convênios */}
      <ResumoSection
        title="Convênios"
        icon={<Heart className="w-4 h-4" />}
        stepId="convenios"
        onEdit={onGoToStep}
        isEmpty={!hasConvenios}
        emptyLabel="Nenhum convênio cadastrado"
      >
        <div className="space-y-2">
          {state.convenioItems.filter(c => c.nome).map((c, i) => (
            <div key={i} className="text-xs space-y-0.5">
              <p className="font-medium text-violet-300">{c.nome}</p>
              {c.valorPrimeira && <p className="text-white/60">1ª Consulta: {c.valorPrimeira}</p>}
              {c.valorDemais && <p className="text-white/60">Demais: {c.valorDemais}</p>}
              <p className="text-white/60">Previsão: {c.previsaoDias} dias</p>
            </div>
          ))}
        </div>
      </ResumoSection>

      {/* Configurações */}
      <ResumoSection
        title="Configurações"
        icon={<Settings className="w-4 h-4" />}
        stepId="configuracoes"
        onEdit={onGoToStep}
      >
        <div className="flex items-center gap-2 text-xs">
          <Calendar className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-white/80">
            Agendamento automático:{' '}
            <span className={state.scheduling_on ? 'text-green-400 font-semibold' : 'text-white/50'}>
              {state.scheduling_on ? 'Ativado' : 'Desativado'}
            </span>
          </span>
        </div>
      </ResumoSection>

      {/* Save button */}
      <button
        onClick={onSave}
        disabled={isSaving || !state.agent_name || !state.name || !state.address}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold',
          'transition-all duration-200',
          isSaving || !state.agent_name || !state.name || !state.address
            ? 'bg-white/10 text-white/30 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 shadow-lg shadow-green-500/20',
        )}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Confirmar e Salvar
          </>
        )}
      </button>

      {(!state.agent_name || !state.name || !state.address) && (
        <p className="text-xs text-amber-400/80 text-center">
          ⚠️ Preencha os campos obrigatórios (Nome do agente, Nome da empresa e Endereço) para salvar.
        </p>
      )}
    </div>
  );
}
