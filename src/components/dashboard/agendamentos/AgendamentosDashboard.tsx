import { IndicadoresSection } from "./IndicadoresSection";
import { OcupacaoSection } from "./OcupacaoSection";
import { DesempenhoMensalSection } from "./DesempenhoMensalSection";
import { RankingsSection } from "./RankingsSection";
import { VendasAgendamentosSection } from "./VendasAgendamentosSection";
import { MensagensAutomaticasSection } from "./MensagensAutomaticasSection";
import { AgendamentosColaboradorSection } from "./AgendamentosColaboradorSection";

export function AgendamentosDashboard() {
    return (
        <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <IndicadoresSection />
            <MensagensAutomaticasSection />
            <AgendamentosColaboradorSection />
            <VendasAgendamentosSection />
            <OcupacaoSection />
            <DesempenhoMensalSection />
            <RankingsSection />
        </div>
    );
}
