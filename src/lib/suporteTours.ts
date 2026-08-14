import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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
    "inbox-atender": [
        {
            element: '[data-tour="inbox-list"]',
            title: "Lista de conversas",
            description:
                "Todas as conversas da clínica, com filtros por canal, fila e status. Clique numa conversa para abrir o chat.",
        },
        {
            element: '[data-tour="inbox-chat"]',
            title: "Área do chat",
            description:
                "Aqui você conversa com o cliente. No topo, os botões Atender (assumir a conversa — a IA para) e Resolver (encerrar e arquivar).",
        },
        {
            element: '[data-tour="inbox-sidebar"]',
            title: "Painel de inteligência",
            description:
                "Passe o mouse para expandir: dados do cliente, etapa do CRM, negociação rápida, resumo da IA e atalhos de venda/agendamento.",
        },
    ],
    "crm-board": [
        {
            element: '[data-tour="crm-title"]',
            title: "CRM — o funil da clínica",
            description: "Cada coluna é uma etapa da jornada; cada card é um cliente com sua negociação.",
        },
        {
            element: '[data-tour="crm-new-deal"]',
            title: "Nova negociação",
            description: "Crie um card manualmente — escolha o cliente, os serviços de interesse e o valor.",
        },
        {
            element: '[data-tour="crm-board"]',
            title: "O quadro",
            description:
                "Arraste os cards entre colunas conforme a conversa evolui. Lembre: mover o card também muda a fila da conversa no inbox (e vice-versa).",
        },
    ],
    "equipe-tour": [
        {
            element: '[data-tour="equipe-tabs"]',
            title: "As duas abas da Equipe",
            description:
                "Equipes: adicione membros e escolha o papel (Admin, Supervisor ou Agente). Permissões: ajuste fino do que cada nível pode criar, editar e apagar em cada módulo.",
        },
    ],
    "conexoes-tour": [
        {
            element: '[data-tour="conexoes-tabs"]',
            title: "Abas da página",
            description:
                "Conexões (seus canais), Templates (só com número oficial Meta) e Mensagens API não oficial (só com conexão por QR code).",
        },
        {
            element: '[data-tour="conexoes-canais"]',
            title: "Os 3 canais",
            description:
                "WhatsApp (não oficial, QR code), WA Oficial (API Meta) e Instagram. Cada card mostra status, qualidade e ações de reconexão.",
        },
    ],
    "servicos-tour": [
        {
            element: '[data-tour="servicos-title"]',
            title: "Catálogo de Serviços",
            description: "A fonte de verdade de preços e procedimentos — a IA, a Agenda e as vendas leem daqui.",
        },
        {
            element: '[data-tour="servicos-acoes"]',
            title: "Os 3 botões",
            description:
                "Importar (planilha em massa), Adicionar Categoria (categoria própria) e Adicionar Serviço por Categoria — o caminho principal para montar o catálogo.",
        },
    ],
    "clientes-tour": [
        {
            element: '[data-tour="clientes-title"]',
            title: "Página de Clientes",
            description: "Todo mundo que já falou com a clínica está aqui — quem chega pelo WhatsApp/Instagram entra sozinho.",
        },
        {
            element: '[data-tour="clientes-filtros"]',
            title: "Filtros por canal e categoria",
            description: "Filtre por WhatsApp/Instagram ou pelo selo automático: Contatos, Leads e Clientes.",
        },
        {
            element: '[data-tour="clientes-tabela"]',
            title: "A tabela",
            description:
                "Clique no NOME para abrir o perfil completo (9 abas). Na coluna IA, o interruptor liga/desliga a assistente só para aquele contato.",
        },
    ],
    "dashboard-abas": [
        {
            element: '[data-tour="dash-notifications"]',
            title: "Quadro de avisos",
            description: "Notificações do sistema para toda a equipe aparecem aqui, no topo do Dashboard.",
        },
        {
            element: '[data-tour="dash-tabs"]',
            title: "As abas do Dashboard",
            description:
                "Monitoramento (ao vivo), CRM (funil), Vendas (financeiro), Agendamentos (ocupação + mensagens automáticas), Campanhas e Satisfação (NPS). O que você vê depende do seu papel.",
        },
    ],
    "agenda-tour": [
        {
            element: '[data-tour="agenda-nav"]',
            title: "Navegação de dias",
            description: "A agenda mostra um dia por vez. Use as setas ou o botão Hoje para trocar o dia.",
        },
        {
            element: '[data-tour="agenda-sidebar"]',
            title: "Barra lateral",
            description:
                "Passe o mouse para expandir: mini-calendário, Adicionar Profissional, Importar Agendamentos, Relatório Diário e filtro por serviço.",
        },
        {
            element: '[data-tour="agenda-criar"]',
            title: "Criar Agendamento",
            description:
                "Abre o modal completo. Dica: clicar direto num horário vago da grade já preenche profissional, data e hora.",
        },
        {
            element: '[data-tour="agenda-grade"]',
            title: "A grade",
            description:
                "Uma coluna por profissional. Passe o mouse num evento para ver detalhes e mudar o status; clique no nome do profissional para a visão solo.",
        },
    ],
    "ia-config": [
        {
            element: '[data-tour="ia-tabs"]',
            title: "Definições de IA",
            description:
                "Três abas: Empresa (o que a IA sabe da clínica), F.A.Q (respostas prontas) e Config (ligar/desligar, delay, voz).",
        },
        {
            element: '[data-tour="ia-toggle"]',
            title: "Ligar IA",
            description:
                "O interruptor geral. Com ele ligado, aparecem abaixo os botões de cada conexão — você escolhe quais números têm IA.",
        },
    ],
};

/**
 * Wiring padrão do `?tour=<id>` nas páginas reais: aguarda a renderização,
 * inicia o tour e limpa o parâmetro preservando os demais (ex.: ?tab=).
 */
export function useSuporteTour(ready = true) {
    const [searchParams, setSearchParams] = useSearchParams();
    const tourId = searchParams.get("tour");
    useEffect(() => {
        if (!tourId || !ready) return;
        const t = setTimeout(() => {
            startSuporteTour(tourId);
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete("tour");
                return next;
            }, { replace: true });
        }, 400);
        return () => clearTimeout(t);
    }, [tourId, ready, setSearchParams]);
}

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
