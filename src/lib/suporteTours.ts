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
    "inbox-filtros": [
        {
            element: '[data-tour="inbox-filtros"]',
            title: "Filtros Avançados",
            description:
                "Clique no funil para filtrar a lista por Filas, Tags, Conexões e Usuários (inclui 'sem atribuição'). Você pode marcar várias opções: dentro da mesma categoria vale OU; entre categorias vale E. Os balões de não lidas se adaptam ao filtro ativo.",
        },
        {
            element: '[data-tour="inbox-list"]',
            title: "A lista obedece ao filtro",
            description:
                "Com filtros ativos, só as conversas que combinam aparecem — a busca roda no banco inteiro e uma barra acima da lista mostra o total encontrado. A exibição continua de 100 em 100: use Carregar mais no fim para trazer as próximas. Limpe os filtros para voltar a ver tudo.",
        },
    ],
    "inbox-notas": [
        {
            element: '[data-tour="inbox-list"]',
            title: "1. Abra uma conversa",
            description:
                "As Notas de Conversa ficam dentro do chat. Clique em qualquer conversa da lista para abri-la.",
        },
        {
            element: '[data-tour="chat-note"]',
            title: "2. Nota de Conversa",
            description:
                "O botão roxo cria uma nota interna: ela aparece como um balão roxo na linha do tempo, visível SÓ para a equipe — o cliente nunca vê. Notas nunca são apagadas e ficam guardadas também no perfil do cliente (aba Histórico).",
        },
    ],
    "inbox-transferir": [
        {
            element: '[data-tour="inbox-list"]',
            title: "1. Abra uma conversa",
            description:
                "O botão de transferência fica dentro do chat. Clique em qualquer conversa da lista para abri-la.",
        },
        {
            element: '[data-tour="chat-transfer"]',
            title: "2. Transferir Atendimento",
            description:
                "Este é o botão (ele expande ao passar o mouse). Clique nele para abrir o modal de duas etapas: primeiro a fila de destino, depois o responsável — ou 'Não atribuir usuário'. Só aparecem colegas com acesso àquela fila e àquela conexão.",
        },
    ],
    "crm-board": [
        {
            element: '[data-tour="crm-title"]',
            title: "CRM — o funil da clínica",
            description: "Cada coluna é uma etapa da jornada; cada card é um cliente com sua negociação.",
        },
        {
            element: '[data-tour="crm-tabs"]',
            title: "Um funil por conexão",
            description:
                "Cada número (e cada conta do Instagram) tem o seu próprio funil. Em 'Todos' os cards de todas as conexões aparecem juntos, com uma etiqueta do número — por isso o mesmo cliente pode aparecer duas vezes.",
        },
        {
            element: '[data-tour="crm-new-deal"]',
            title: "Nova negociação",
            description: "Crie um card manualmente — escolha o cliente, a conexão do funil, os serviços de interesse e o valor.",
        },
        {
            element: '[data-tour="crm-board"]',
            title: "O quadro",
            description:
                "Arraste os cards entre colunas conforme a conversa evolui. Lembre: mover o card também muda a fila da conversa no inbox (e vice-versa).",
        },
    ],
    "config-tour": [
        {
            element: '[data-tour="config-tabs"]',
            title: "As abas de Configurações",
            description:
                "Perfil (seus dados e foto), Empresa (dados da clínica), Segurança (e-mail e senha), Sistema (notificações, sons e instalação do app), Tags e Automações (só admin: instância primária dos disparos automáticos).",
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
    "conexoes-templates": [
        {
            element: '[data-tour="conexoes-tabs"]',
            title: "Aba Templates",
            description:
                "Disponível quando há um número oficial Meta conectado. É aqui que vivem os modelos de mensagem aprovados pela Meta.",
        },
        {
            element: '[data-tour="templates-kinds"]',
            title: "Três tipos de template",
            description:
                "Templates Personalizados (criados por você, para campanhas), Automáticos (sys_*: confirmação, lembrete e pesquisa — editáveis, mas não excluíveis) e Recorrência (rec_*: gerados sozinhos a partir das mensagens de recompra em Serviços).",
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
    "monitoramento-tour": [
        {
            element: '[data-tour="monitor-filtros"]',
            title: "Filtros do Monitoramento",
            description:
                "Canal (WhatsApp/Instagram), período (Hoje por padrão — tudo na aba obedece a ele), atendente, resposta, conexão e busca por nome ou telefone.",
        },
        {
            element: '[data-tour="monitor-boards"]',
            title: "Quadros por etapa",
            description:
                "As conversas abertas e pendentes do período, agrupadas pela etapa do CRM. Cada card mostra quem falou por último e a janela de 24h do número oficial.",
        },
        {
            element: '[data-tour="monitor-finalizados"]',
            title: "Quadro Finalizados",
            description:
                "Atendimentos que chegaram a uma etapa final (Ganho, Perdido, Sem Contato, Sem Interesse ou Finalizado) no período e foram encerrados por alguém da equipe — cada card traz o selo colorido da etapa.",
        },
        {
            element: '[data-tour="monitor-atendentes"]',
            title: "Atendentes",
            description:
                "Quem está online agora e, para o período filtrado, quantos atendimentos cada um tem abertos, pendentes e resolvidos.",
        },
    ],
    "dashboard-abas": [
        {
            element: '[data-tour="dash-tabs"]',
            title: "As abas do Dashboard",
            description:
                "Minha Conta (visão geral da conta, só admin), Monitoramento (ao vivo), CRM (funil), Vendas (financeiro), Agendamentos (ocupação + mensagens automáticas), Campanhas, Recorrência (recompra) e Satisfação (NPS). O que você vê depende do seu papel.",
        },
        {
            element: '[data-tour="dash-minha-conta"]',
            title: "Minha Conta",
            description:
                "Exclusiva do administrador: Relatório do Consumo (custo total da conta em reais — tokens da IA + envios Meta), instâncias conectadas com qualidade, status da IA e um resumo dos colaboradores (atendentes e profissionais) com filtro de período.",
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
    "recorrencia-config": [
        {
            element: '[data-tour="recurrence-title"]',
            title: "Página Recorrência",
            description:
                "Todos os clientes no ciclo de recompra, mês a mês, com o status das 3 abordagens de cada um.",
        },
        {
            element: '[data-tour="recurrence-filtros"]',
            title: "Filtros",
            description: "Busque por cliente, filtre por serviço e escolha o período das datas de recorrência.",
        },
        {
            element: '[data-tour="recurrence-config"]',
            title: "Configurações (engrenagem)",
            description:
                "Aqui você define a hora base do disparo diário (janela de 1h), a duração das campanhas (padrão 3 dias) e qual conexão envia a recorrência.",
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
