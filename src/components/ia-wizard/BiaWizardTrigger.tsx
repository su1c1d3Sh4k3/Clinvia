import { useState } from 'react';
import { Sparkles, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExistingConfig {
  name?: string;
  agent_name?: string;
  description?: string;
}

interface BiaWizardTriggerProps {
  existingConfig: ExistingConfig | null;
  onOpenWizard: () => void;
}

function hasExistingData(config: ExistingConfig | null): boolean {
  if (!config) return false;
  return !!(config.name?.trim() || config.agent_name?.trim() || config.description?.trim());
}

export function BiaWizardTrigger({ existingConfig, onOpenWizard }: BiaWizardTriggerProps) {
  const [showDialog, setShowDialog] = useState(false);
  const hasData = hasExistingData(existingConfig);

  const handleButtonClick = () => {
    if (hasData) {
      setShowDialog(true);
    } else {
      onOpenWizard();
    }
  };

  const handleConfirm = () => {
    setShowDialog(false);
    onOpenWizard();
  };

  return (
    <>
      <button
        onClick={handleButtonClick}
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold',
          'bg-gradient-to-r from-violet-500 to-blue-500 text-white',
          'hover:from-violet-400 hover:to-blue-400',
          'shadow-lg shadow-violet-500/25',
          'transition-all duration-200',
          'animate-in fade-in slide-in-from-right-2 duration-300',
        )}
      >
        <Sparkles className="w-4 h-4" />
        <span className="hidden sm:inline">Assistente de Configuração de IA</span>
        <span className="sm:hidden">Assistente Bia</span>
      </button>

      {/* Reset confirmation dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDialog(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Configuração já existente
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Assistente de Configuração de IA
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDialog(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Message */}
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 mb-5">
                <p className="text-sm text-foreground leading-relaxed">
                  Sua IA já foi configurada. Caso deseje fazer alguma <strong>alteração específica</strong>, basta navegar até a aba correspondente e alterar.
                </p>
                <p className="text-sm text-foreground leading-relaxed mt-2">
                  Mas se deseja <strong>redefinir os dados</strong> e começar uma configuração do zero com ajuda da Bia, basta clicar em continuar.
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mt-3">
                  ⚠️ Atenção: caso clique em continuar, as alterações realizadas anteriormente serão zeradas!
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDialog(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold',
                    'bg-gradient-to-r from-violet-500 to-blue-500 text-white',
                    'hover:from-violet-400 hover:to-blue-400',
                    'shadow-lg shadow-violet-500/20',
                    'transition-all duration-200',
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  Continuar e Redefinir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
