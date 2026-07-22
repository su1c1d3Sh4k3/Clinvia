import { IndicadoresSection } from "./IndicadoresSection";
import { OcupacaoSection } from "./OcupacaoSection";
import { DesempenhoMensalSection } from "./DesempenhoMensalSection";
import { RankingsSection } from "./RankingsSection";

export function AgendamentosDashboard() {
    return (
        <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <IndicadoresSection />
            <OcupacaoSection />
            <DesempenhoMensalSection />
            <RankingsSection />
        </div>
    );
}
