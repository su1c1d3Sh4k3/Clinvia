import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect } from "vitest";
import {
    RecurrenceTab,
    RecurrenceData,
    defaultRecurrenceData,
    hasInvalidRecurrenceVariables,
} from "@/components/services/RecurrenceTab";

function Harness({ initial }: { initial?: Partial<RecurrenceData> }) {
    const [data, setData] = useState<RecurrenceData>({ ...defaultRecurrenceData, ...initial });
    return <RecurrenceTab data={data} onChange={setData} />;
}

describe("Fase 1 — RecurrenceTab", () => {
    it("renderiza os 3 blocos com Mensagem, Tempo (dias) e Desconto (%)", () => {
        render(<Harness />);
        expect(screen.getByText("Recorrência 1")).toBeInTheDocument();
        expect(screen.getByText("Recorrência 2")).toBeInTheDocument();
        expect(screen.getByText("Recorrência 3")).toBeInTheDocument();
        expect(screen.getAllByText("Tempo (dias)")).toHaveLength(3);
        expect(screen.getAllByText("Desconto (%)")).toHaveLength(3);
    });

    it("exibe os chips das 6 variáveis em cada bloco", () => {
        render(<Harness />);
        for (const label of [
            "Nome do Cliente",
            "Nome da Clínica",
            "Serviço",
            "Aplicação",
            "Preço",
            "Profissional",
        ]) {
            expect(screen.getAllByText(label)).toHaveLength(3);
        }
    });

    it("clicar no chip insere a variável na mensagem", () => {
        render(<Harness />);
        const chip = screen.getAllByText("Nome do Cliente")[0];
        fireEvent.click(chip);
        const textareas = screen.getAllByRole("textbox");
        expect((textareas[0] as HTMLTextAreaElement).value).toBe("{{nome_cliente}}");
    });

    it("variável desconhecida mostra erro de validação", () => {
        render(<Harness initial={{ msg_recurrence_1: "Use {{cupom}}" }} />);
        const error = screen.getByText(/Variável desconhecida/);
        expect(error).toBeInTheDocument();
        expect(error.textContent).toContain("{{cupom}}");
    });

    it("mensagem válida mostra prévia com exemplos", () => {
        render(<Harness initial={{ msg_recurrence_1: "Oi {{nome_cliente}}!" }} />);
        expect(screen.getByText(/Oi Maria!/)).toBeInTheDocument();
    });
});

describe("Fase 1 — hasInvalidRecurrenceVariables", () => {
    it("false para mensagens vazias ou só com variáveis do catálogo", () => {
        expect(hasInvalidRecurrenceVariables(defaultRecurrenceData)).toBe(false);
        expect(
            hasInvalidRecurrenceVariables({
                ...defaultRecurrenceData,
                msg_recurrence_2: "{{servico}} com {{profissional}}",
            }),
        ).toBe(false);
    });

    it("true se qualquer uma das 3 mensagens tem variável desconhecida", () => {
        expect(
            hasInvalidRecurrenceVariables({
                ...defaultRecurrenceData,
                msg_recurrence_3: "aproveite {{oferta_relampago}}",
            }),
        ).toBe(true);
    });
});
