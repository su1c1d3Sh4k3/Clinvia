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
                "Passe o mouse para expandir: dados do cliente, etapa do CRM, negociação rápida, resumo da IA, orçamentos e atalhos de agendamento.",
        },
        {
            element: '[data-tour="inbox-sidebar"]',
            title: "Tickets anteriores",
            description:
                "Na seção Tickets anteriores ficam, em cartões, todos os atendimentos já encerrados deste cliente NESTA conexão — com número do ticket, quem encerrou e as datas. Clique num cartão para ver aquele trecho isolado (somente leitura) e use Retornar para a conversa geral para voltar.",
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
    "orcamento-criar": [
        {
            element: '[data-tour="inbox-list"]',
            title: "1. Abra a conversa do cliente",
            description:
                "O orçamento nasce dentro do atendimento. Clique na conversa da pessoa para quem você vai montar a proposta.",
        },
        {
            element: '[data-tour="inbox-sidebar"]',
            title: "2. Menu Orçamento",
            description:
                "Na barra lateral direita, abra o menu Orçamento. Sem proposta aberta aparece o botão 'Realizar orçamento'; com proposta aberta aparecem os cards, cada um com seus serviços, o profissional e o botão 'Lançar venda'.",
        },
        {
            element: '[data-tour="inbox-sidebar"]',
            title: "3. Do orçamento à venda",
            description:
                "No card, o relógio marca o que o cliente ainda não comprou. Em 'Lançar venda' você percorre 4 passos (o que foi levado, como foi vendido, agendamentos e revisão) — nada é gravado até o último clique.",
        },
    ],
    "financeiro-visao-geral": [
        {
            element: '[data-tour="financeiro-tabs"]',
            title: "1. Duas abas",
            description:
                "Orçamentos mostra o que foi PROPOSTO aos clientes; Vendas mostra o que foi FECHADO. A aba escolhida fica salva no endereço da página.",
        },
        {
            element: '[data-tour="financeiro-filtro"]',
            title: "2. Filtro de período",
            description:
                "Todo o período, hoje, 7 dias, 30 dias ou datas personalizadas. Ele manda apenas nos 4 cards de valores logo abaixo.",
        },
        {
            element: '[data-tour="financeiro-criar-orcamento"]',
            title: "3. Criar orçamento",
            description:
                "Mesmo formulário da lateral do Inbox, com um campo a mais para buscar o cliente por nome ou número — dá para orçar sem abrir a conversa.",
        },
        {
            element: '[data-tour="financeiro-cards"]',
            title: "4. Os 4 cards",
            description:
                "Em reais: totais, aprovados (valor final vendido, já com desconto), rejeitados (recusados + expirados) e pendentes — o dinheiro que ainda está na mesa.",
        },
        {
            element: '[data-tour="financeiro-grafico"]',
            title: "5. Últimos 12 meses",
            description:
                "Aqui a conta é em QUANTIDADE de itens (um orçamento com 3 serviços conta 3). O botão do canto alterna entre linhas e barras.",
        },
        {
            element: '[data-tour="financeiro-tabela"]',
            title: "6. Orçamentos realizados",
            description:
                "Uma linha por orçamento, o mais novo no topo. Clique no nome do cliente para abrir a ficha dele já na aba Orçamentos.",
        },
        {
            element: '[data-tour="financeiro-rankings"]',
            title: "7. Profissional e serviços",
            description:
                "Quem mais orçou e quais serviços são mais propostos (top 10). Cada quadro tem o seu próprio filtro de período.",
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
            title: "As quatro abas da Equipe",
            description:
                "Equipe Comercial: membros do sistema e seus papéis (Admin, Supervisor ou Agente). Profissionais: quem atende na clínica — cada um ganha uma sala automaticamente. Salas: as agendas (as de profissional e as avulsas). Permissões: ajuste fino do que cada nível pode criar, editar e apagar.",
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
            element: '[data-tour="servicos-templates"]',
            title: "Utilizar templates",
            description:
                "O jeito mais rápido de começar: abre um catálogo pronto de categorias, serviços e aplicações. Vem tudo marcado e editável — desmarque o que não usa, ajuste preços e importe.",
        },
        {
            element: '[data-tour="servicos-acoes"]',
            title: "Os outros botões",
            description:
                "Importar (planilha em massa), Adicionar Categoria (categoria própria) e Adicionar Serviço por Categoria — o caminho manual para montar o catálogo.",
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
            description: "A agenda mostra um dia por vez. Use as setas ou o botão Hoje para trocar o dia. O botão de calendário logo ao lado troca para a visão mês (um profissional por vez, com os agendamentos dentro do quadrado de cada dia); o modo escolhido fica salvo no seu usuário.",
        },
        {
            element: '[data-tour="agenda-modo"]',
            title: "Profissionais ou Salas",
            description:
                "Alterna o que a grade exibe: as agendas dos profissionais cadastrados, ou só as salas avulsas (laser, consultório, equipamento) que não têm profissional vinculado. A lista de botões da barra lateral acompanha o modo escolhido.",
        },
        {
            element: '[data-tour="agenda-sidebar"]',
            title: "Barra lateral",
            description:
                "Passe o mouse para expandir: mini-calendário, lista do modo atual (Profissionais ou Salas — clique num deles para ver só aquela agenda), Adicionar Sala, Importar Agendamentos, Relatório Diário e filtro por serviço.",
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
    "ia-horarios": [
        {
            element: '[data-tour="ia-slots"]',
            title: "Horários de agendamento",
            description:
                "Aqui você define de quanto em quanto tempo a IA e o link público oferecem horários, e quanta folga exigir antes e depois de cada agendamento já marcado. Depois de escolher, clique em Salvar. O encaixe manual pela agenda continua livre.",
        },
    ],
    "suporte-chat": [
        {
            element: '[data-tour="support-widget"]',
            title: "Falar com o suporte",
            description:
                "Este botão azul abre o chat com o time da Clinvia. Ele fica colado na borda do menu lateral e acompanha o menu quando ele expande. A bolinha vermelha avisa que chegou resposta nova ou um aviso que você ainda não leu.",
        },
        {
            title: "Aba Suporte",
            description:
                "É onde você conversa. Quem atende primeiro é o assistente virtual: ele conhece o manual inteiro e responde na hora. Se não resolver, encaminha para a equipe sem você precisar repetir nada — e a conversa continua no mesmo chat. O ícone de relógio no topo abre os chamados antigos.",
        },
        {
            title: "Aba Avisos",
            description:
                "Aqui aparecem as novidades e atualizações publicadas pela Clinvia. Os itens que você ainda não leu ficam destacados; abrir a aba marca todos como lidos.",
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
