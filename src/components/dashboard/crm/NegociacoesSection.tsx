import { StageStatusCards } from "./StageStatusCards";

// Etapas de negociação em andamento. Os desfechos (Ganho, Perdido, Sem Contato,
// Sem Interesse, Finalizado) ficam todos na seção Resultados.
const NEGOTIATION_STAGES = [
    "Qualificado",
    "Aguardando Pagamento",
    "Agendado",
    "Follow Up",
];

export function NegociacoesSection() {
    return <StageStatusCards title="Negociações" stages={NEGOTIATION_STAGES} />;
}
