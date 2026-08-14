import { driver } from "driver.js";
import "driver.js/dist/driver.css";

// ---------------------------------------------------------------------------
// Tours guiados (driver.js) da página Suporte — destacam a UI REAL.
// Uso: /campanhas?tour=nova-campanha → startSuporteTour("nova-campanha")
// ---------------------------------------------------------------------------

const TOURS: Record<string, { element?: string; title: string; description: string }[]> = {
    "nova-campanha": [
        {
            element: '[data-tour="campaigns-title"]',
            title: "Página de Campanhas",
            description: "Aqui ficam todas as suas campanhas — agendadas, em disparo e encerradas.",
        },
        {
            element: '[data-tour="meta-quality"]',
            title: "Qualidade Meta",
            description:
                "Antes de disparar, confira aqui o limite diário do seu número oficial e quanto já foi usado nas últimas 24h.",
        },
        {
            element: '[data-tour="new-campaign"]',
            title: "Nova campanha",
            description:
                "Clique aqui para abrir o assistente de 6 etapas: Dados, Audiência, Tipo, Mensagem, Objetivo e Revisão.",
        },
        {
            element: '[data-tour="campaign-list"]',
            title: "Acompanhe os resultados",
            description:
                "Cada campanha vira um card. Expanda para ver os 8 cards de resumo e a tabela contato a contato.",
        },
    ],
};

export function startSuporteTour(tourId: string) {
    const steps = TOURS[tourId];
    if (!steps) return;
    const d = driver({
        showProgress: true,
        nextBtnText: "Próximo",
        prevBtnText: "Anterior",
        doneBtnText: "Concluir",
        progressText: "{{current}} de {{total}}",
        steps: steps.map((s) => ({
            element: s.element,
            popover: { title: s.title, description: s.description },
        })),
    });
    d.drive();
}
