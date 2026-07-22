import { ResultadosSection } from "./ResultadosSection";
import { MonitoramentoSection } from "./MonitoramentoSection";
import { FilasAtendimentoSection } from "./FilasAtendimentoSection";
import { NegociacoesSection } from "./NegociacoesSection";

export function CrmDashboard() {
    return (
        <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <ResultadosSection />
            <MonitoramentoSection />
            <FilasAtendimentoSection />
            <NegociacoesSection />
        </div>
    );
}
