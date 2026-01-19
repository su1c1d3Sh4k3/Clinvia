// Contacts functions for Bia AI
// Read-only contact lookups

import { UserContext, FunctionResult, Contact, ToolFunction } from './types.ts';
import { hasPermission, canViewAll } from './permissions.ts';
import { lookupContact, formatDateBR } from './helpers.ts';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const contactsTools: ToolFunction[] = [
    {
        type: 'function',
        function: {
            name: 'contacts_search',
            description: 'Busca contatos por nome ou telefone. Use quando o usuário perguntar sobre um cliente ou lead específico.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome ou parte do nome do contato'
                    },
                    phone: {
                        type: 'string',
                        description: 'Telefone do contato'
                    },
                    channel: {
                        type: 'string',
                        description: 'Canal de comunicação',
                        enum: ['whatsapp', 'instagram']
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'contacts_get_details',
            description: 'Busca detalhes completos de um contato específico',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome do contato'
                    },
                    contact_id: {
                        type: 'string',
                        description: 'ID do contato (se conhecido)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'contacts_count',
            description: 'Conta quantos contatos existem, opcionalmente filtrado por canal',
            parameters: {
                type: 'object',
                properties: {
                    channel: {
                        type: 'string',
                        description: 'Canal de comunicação',
                        enum: ['whatsapp', 'instagram']
                    }
                },
                required: []
            }
        }
    }
];

// ============================================
// FUNCTION HANDLERS
// ============================================

export async function handleContactsFunction(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    switch (functionName) {
        case 'contacts_search':
            return await contactsSearch(supabase, context, args);
        case 'contacts_get_details':
            return await contactsGetDetails(supabase, context, args);
        case 'contacts_count':
            return await contactsCount(supabase, context, args);
        default:
            return { success: false, error: `Função desconhecida: ${functionName}` };
    }
}

// ============================================
// FUNCTION IMPLEMENTATIONS
// ============================================

async function contactsSearch(
    supabase: any,
    context: UserContext,
    args: { name?: string; phone?: string; channel?: string }
): Promise<FunctionResult> {

    let query = supabase
        .from('contacts')
        .select('id, push_name, phone, email, channel, created_at')
        .eq('user_id', context.owner_id);

    // Apply filters
    if (args.name) {
        query = query.ilike('push_name', `%${args.name}%`);
    }
    if (args.phone) {
        query = query.ilike('phone', `%${args.phone}%`);
    }
    if (args.channel) {
        query = query.eq('channel', args.channel);
    }

    // Ownership filter for agents
    if (!canViewAll(context.role, 'contacts')) {
        // For agents, we might need additional filtering based on conversations
        // For now, allow basic search but limit results
    }

    const { data, error } = await query.limit(10).order('push_name');

    if (error) {
        return { success: false, error: `Erro ao buscar contatos: ${error.message}` };
    }

    if (!data || data.length === 0) {
        return {
            success: true,
            data: {
                found: false,
                message: 'Não encontrei nenhum contato com esses critérios'
            }
        };
    }

    return {
        success: true,
        data: {
            found: true,
            count: data.length,
            contacts: data.map((c: any) => ({
                name: c.push_name,
                phone: c.phone || 'Não informado',
                email: c.email || 'Não informado',
                channel: c.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram',
                created_at: formatDateBR(c.created_at)
            }))
        }
    };
}

async function contactsGetDetails(
    supabase: any,
    context: UserContext,
    args: { name?: string; contact_id?: string }
): Promise<FunctionResult> {

    let query = supabase
        .from('contacts')
        .select(`
            id, push_name, phone, email, channel, created_at,
            contact_tags (
                tags (name, color)
            )
        `)
        .eq('user_id', context.owner_id);

    if (args.contact_id) {
        query = query.eq('id', args.contact_id);
    } else if (args.name) {
        const lookup = await lookupContact(supabase, args.name, context.owner_id);
        if (!lookup.found) {
            return { success: true, data: { found: false, message: 'Contato não encontrado' } };
        }
        if (!lookup.single && !lookup.exact_match) {
            return { success: true, data: { found: false, message: lookup.message } };
        }
        query = query.eq('id', lookup.items[0].id);
    } else {
        return { success: false, error: 'Preciso do nome ou ID do contato' };
    }

    const { data, error } = await query.single();

    if (error || !data) {
        return { success: true, data: { found: false, message: 'Contato não encontrado' } };
    }

    const tags = (data.contact_tags || []).map((ct: any) => ct.tags?.name).filter(Boolean);

    return {
        success: true,
        data: {
            found: true,
            contact: {
                name: data.push_name,
                phone: data.phone || 'Não informado',
                email: data.email || 'Não informado',
                channel: data.channel === 'whatsapp' ? 'WhatsApp' : 'Instagram',
                tags: tags.length > 0 ? tags.join(', ') : 'Nenhuma',
                created_at: formatDateBR(data.created_at)
            }
        }
    };
}

async function contactsCount(
    supabase: any,
    context: UserContext,
    args: { channel?: string }
): Promise<FunctionResult> {

    let query = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', context.owner_id);

    if (args.channel) {
        query = query.eq('channel', args.channel);
    }

    const { count, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao contar contatos: ${error.message}` };
    }

    const channelLabel = args.channel ?
        (args.channel === 'whatsapp' ? ' do WhatsApp' : ' do Instagram') :
        '';

    return {
        success: true,
        data: {
            count: count || 0,
            message: `Você tem ${count || 0} contatos${channelLabel} cadastrados`
        }
    };
}
