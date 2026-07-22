import { StageStatusCards } from "./StageStatusCards";

const NEGOTIATION_STAGES = [
    "Qualificado",
    "Agendado",
    "Follow Up",
    "Sem Contato",
    "Sem Interesse",
];

export function NegociacoesSection() {
    return <StageStatusCards title="Negociações" stages={NEGOTIATION_STAGES} />;
}
