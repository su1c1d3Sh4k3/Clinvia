import { Briefcase } from "lucide-react";

export const NegociacoesTab = () => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <Briefcase className="w-10 h-10 text-muted-foreground mb-3" />
    <h4 className="font-medium mb-1">Negociações</h4>
    <p className="text-sm text-muted-foreground max-w-sm">
      A jornada do cliente no CRM será exibida aqui após a reformulação do módulo.
    </p>
  </div>
);
