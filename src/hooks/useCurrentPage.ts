import { useLocation } from 'react-router-dom';

interface PageInfo {
    route: string;
    name: string;
    slug: string;
}

const PAGE_MAP: Record<string, PageInfo> = {
    '/': { route: '/', name: 'Inbox - Chat de Atendimento', slug: 'inbox' },
    '/dashboard': { route: '/dashboard', name: 'Dashboard', slug: 'dashboard' },
    '/connections': { route: '/connections', name: 'Conexões WhatsApp/Instagram', slug: 'connections' },
    '/queues': { route: '/queues', name: 'Filas de Atendimento', slug: 'queues' },
    '/tags': { route: '/tags', name: 'Tags', slug: 'tags' },
    '/contacts': { route: '/contacts', name: 'Contatos', slug: 'contacts' },
    '/team': { route: '/team', name: 'Equipe', slug: 'team' },
    '/crm': { route: '/crm', name: 'CRM - Funis de Vendas', slug: 'crm' },
    '/tasks': { route: '/tasks', name: 'Tarefas', slug: 'tasks' },
    '/products-services': { route: '/products-services', name: 'Produtos e Serviços', slug: 'products-services' },
    '/scheduling': { route: '/scheduling', name: 'Agendamentos', slug: 'scheduling' },
    '/ia-config': { route: '/ia-config', name: 'Configuração de IA', slug: 'ia-config' },
    '/financial': { route: '/financial', name: 'Financeiro', slug: 'financial' },
    '/sales': { route: '/sales', name: 'Vendas', slug: 'sales' },
    '/follow-up': { route: '/follow-up', name: 'Follow-Up', slug: 'follow-up' },
    '/settings': { route: '/settings', name: 'Configurações', slug: 'settings' },
};

export const useCurrentPage = (): PageInfo => {
    const location = useLocation();

    return PAGE_MAP[location.pathname] || {
        route: location.pathname,
        name: 'Página',
        slug: 'unknown'
    };
};
