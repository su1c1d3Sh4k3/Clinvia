import { StageStatusCards } from "./StageStatusCards";

const QUEUE_STAGES = [
    "Em Atendimento Humano",
    "Em Atendimento IA",
    "Suporte",
    "Financeiro",
    "Pós-Venda",
];

export function FilasAtendimentoSection() {
    return <StageStatusCards title="Filas de Atendimento" stages={QUEUE_STAGES} />;
}
