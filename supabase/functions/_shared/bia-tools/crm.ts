// CRM functions for Bia AI
// Deal queries and creation

import { UserContext, FunctionResult, ToolFunction } from './types.ts';
import { hasPermission, canViewAll } from './permissions.ts';
import { formatCurrency, formatDateBR, lookupContact, lookupFunnel, getAllFunnels } from './helpers.ts';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const crmTools: ToolFunction[] = [
    {
        type: 'function',
        function: {
            name: 'crm_create_deal',
            description: 'Cria uma nova negociação/deal no CRM. Use quando o usuário pedir para criar um negócio ou deal.',
            parameters: {
                type: 'object',
                properties: {
                    contact_name: {
                        type: 'string',
                        description: 'Nome do contato/cliente'
                    },
                    funnel_name: {
                        type: 'string',
                        description: 'Nome do funil (opcional, usa o primeiro se não informado)'
                    },
                    stage_name: {
                        type: 'string',
                        description: 'Nome da etapa inicial (opcional, usa a primeira se não informado)'
                    },
                    value: {
                        type: 'number',
                        description: 'Valor da negociação'
                    },
                    title: {
                        type: 'string',
                        description: 'Título da negociação (opcional)'
                    }
                },
                required: ['contact_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'crm_get_deals_by_funnel',
            description: 'Busca negociações de um funil específico ou de uma etapa',
            parameters: {
                type: 'object',
                properties: {
                    funnel_name: {
                        type: 'string',
                        description: 'Nome do funil'
                    },
                    stage_name: {
                        type: 'string',
                        description: 'Nome da etapa (opcional)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'crm_get_stagnated_deals',
            description: 'Busca negociações estagnadas (paradas há muito tempo em uma etapa)',
            parameters: {
                type: 'object',
                properties: {
                    funnel_name: {
                        type: 'string',
                        description: 'Nome do funil (opcional)'
                    },
                    days_stagnated: {
                        type: 'number',
                        description: 'Mínimo de dias parado (opcional, padrão usa configuração de cada etapa)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'crm_get_deals_count_by_stage',
            description: 'Conta quantas negociações existem em cada etapa de um funil',
            parameters: {
                type: 'object',
                properties: {
                    funnel_name: {
                        type: 'string',
                        description: 'Nome do funil'
                    }
                },
                required: ['funnel_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'crm_get_total_pipeline_value',
            description: 'Calcula o valor total do pipeline (soma de todas as negociações abertas)',
            parameters: {
                type: 'object',
                properties: {
                    funnel_name: {
                        type: 'string',
                        description: 'Nome do funil (opcional, todos se não informado)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'crm_get_funnels_list',
            description: 'Lista todos os funis de vendas disponíveis',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    }
    ,{
        type: 'function',
        function: {
            name: 'crm_update_deal',
            description: 'Atualiza o título, valor ou descrição de uma negociação/deal existente.',
            parameters: {
                type: 'object',
                properties: {
                    deal_title: {
                        type: 'string',
                        description: 'Título atual ou parte do título da negociação'
                    },
                    new_title: {
                        type: 'string',
                        description: 'Novo título (opcional)'
                    },
                    new_value: {
                        type: 'number',
                        description: 'Novo valor em R$ (opcional)'
                    },
                    new_description: {
                        type: 'string',
                        description: 'Nova descrição (opcional)'
                    }
                },
                required: ['deal_title']
            }
        }
    }
    ,{
        type: 'function',
        function: {
            name: 'crm_move_deal_stage',
            description: 'Move uma negociação para outra etapa do funil. Use quando o usuário pedir para mover, avançar ou recuar um deal.',
            parameters: {
                type: 'object',
                properties: {
                    deal_title: {
                        type: 'string',
                        description: 'Título ou parte do título da negociação'
                    },
                    target_stage: {
                        type: 'string',
                        description: 'Nome da etapa de destino'
                    },
                    funnel_name: {
                        type: 'string',
                        description: 'Nome do funil (opcional, para desambiguação)'
                    }
                },
                required: ['deal_title', 'target_stage']
            }
        }
    }
];

// ============================================
// FUNCTION HANDLERS
// ============================================

export async function handleCrmFunction(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    switch (functionName) {
        case 'crm_create_deal':
            return await crmCreateDeal(supabase, context, args);
        case 'crm_get_deals_by_funnel':
            return await crmGetDealsByFunnel(supabase, context, args);
        case 'crm_get_stagnated_deals':
            return await crmGetStagnatedDeals(supabase, context, args);
        case 'crm_get_deals_count_by_stage':
            return await crmGetDealsCountByStage(supabase, context, args);
        case 'crm_get_total_pipeline_value':
            return await crmGetTotalPipelineValue(supabase, context, args);
        case 'crm_get_funnels_list':
            return await crmGetFunnelsList(supabase, context);
        case 'crm_update_deal':
            return await crmUpdateDeal(supabase, context, args);
        case 'crm_move_deal_stage':
            return await crmMoveDealStage(supabase, context, args);
        default:
            return { success: false, error: `Função desconhecida: ${functionName}` };
    }
}

// ============================================
// FUNCTION IMPLEMENTATIONS
// ============================================

async function crmCreateDeal(
    supabase: any,
    context: UserContext,
    args: { contact_name: string; funnel_name?: string; stage_name?: string; value?: number; title?: string }
): Promise<FunctionResult> {

    // Check permission
    if (!hasPermission(context.role, 'crm:create')) {
        return { success: false, error: 'Você não tem permissão para criar negociações' };
    }

    // Lookup contact
    const contactLookup = await lookupContact(supabase, args.contact_name, context.owner_id);
    if (!contactLookup.found) {
        return { success: true, data: { needs_info: true, message: `Contato "${args.contact_name}" não encontrado` } };
    }
    if (!contactLookup.single && !contactLookup.exact_match) {
        return { success: true, data: { needs_info: true, message: contactLookup.message } };
    }
    const contact = contactLookup.items[0];

    // Get funnels
    const funnels = await getAllFunnels(supabase, context.owner_id);
    if (funnels.length === 0) {
        return { success: false, error: 'Não há funis cadastrados. Crie um funil primeiro.' };
    }

    // Find funnel
    let funnel = funnels[0]; // Default to first
    if (args.funnel_name) {
        const found = funnels.find((f: any) => f.name.toLowerCase().includes(args.funnel_name!.toLowerCase()));
        if (found) funnel = found;
    }

    // Find stage (first stage of funnel)
    const stages = funnel.stages?.sort((a: any, b: any) => a.order_index - b.order_index) || [];
    if (stages.length === 0) {
        return { success: false, error: 'O funil não tem etapas configuradas' };
    }

    let stage = stages[0];
    if (args.stage_name) {
        const found = stages.find((s: any) => s.name.toLowerCase().includes(args.stage_name!.toLowerCase()));
        if (found) stage = found;
    }

    const dealTitle = args.title || `Negociação - ${contact.name}`;
    const value = args.value || 0;

    // Build confirmation
    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: `Confirma a criação da negociação?\n\n💼 **Título**: ${dealTitle}\n👤 **Cliente**: ${contact.name}\n📊 **Funil**: ${funnel.name}\n📍 **Etapa**: ${stage.name}\n💰 **Valor**: ${formatCurrency(value)}`,
        data: {
            action: 'create_deal',
            params: {
                user_id: context.owner_id,
                contact_id: contact.id,
                funnel_id: funnel.id,
                stage_id: stage.id,
                title: dealTitle,
                value: value,
                assigned_to: context.team_member_id
            },
            summary: {
                title: dealTitle,
                contact: contact.name,
                funnel: funnel.name,
                stage: stage.name,
                value: formatCurrency(value)
            }
        }
    };
}

async function crmGetDealsByFunnel(
    supabase: any,
    context: UserContext,
    args: { funnel_name?: string; stage_name?: string }
): Promise<FunctionResult> {

    let query = supabase
        .from('crm_deals')
        .select(`
            id, title, value, stage_changed_at,
            contacts (push_name),
            crm_stages (name, order_index),
            crm_funnels (name)
        `)
        .eq('user_id', context.owner_id)
        .is('closed_at', null)
        .order('stage_changed_at', { ascending: false });

    // Permission filter for agents
    if (!canViewAll(context.role, 'crm')) {
        query = query.eq('assigned_to', context.team_member_id);
    }

    const { data, error } = await query.limit(20);

    if (error) {
        return { success: false, error: `Erro ao buscar negociações: ${error.message}` };
    }

    // Filter by funnel/stage name if provided
    let filteredData = data || [];
    if (args.funnel_name) {
        filteredData = filteredData.filter((d: any) =>
            d.crm_funnels?.name?.toLowerCase().includes(args.funnel_name!.toLowerCase())
        );
    }
    if (args.stage_name) {
        filteredData = filteredData.filter((d: any) =>
            d.crm_stages?.name?.toLowerCase().includes(args.stage_name!.toLowerCase())
        );
    }

    if (filteredData.length === 0) {
        return { success: true, data: { found: false, message: 'Nenhuma negociação encontrada' } };
    }

    const totalValue = filteredData.reduce((sum: number, d: any) => sum + Number(d.value || 0), 0);

    return {
        success: true,
        data: {
            found: true,
            count: filteredData.length,
            total_value: formatCurrency(totalValue),
            deals: filteredData.map((d: any) => ({
                title: d.title || `Negociação #${d.id.slice(0, 8)}`,
                contact: d.contacts?.push_name || 'Sem contato',
                funnel: d.crm_funnels?.name || 'Sem funil',
                stage: d.crm_stages?.name || 'Sem etapa',
                value: formatCurrency(d.value || 0),
                days_in_stage: Math.floor((Date.now() - new Date(d.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24))
            }))
        }
    };
}

async function crmGetStagnatedDeals(
    supabase: any,
    context: UserContext,
    args: { funnel_name?: string; days_stagnated?: number }
): Promise<FunctionResult> {

    // Get all open deals with stage info
    let query = supabase
        .from('crm_deals')
        .select(`
            id, title, value, stage_changed_at,
            contacts (push_name),
            crm_stages (name, stagnation_limit_days),
            crm_funnels (name)
        `)
        .eq('user_id', context.owner_id)
        .is('closed_at', null);

    if (!canViewAll(context.role, 'crm')) {
        query = query.eq('assigned_to', context.team_member_id);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao buscar negociações: ${error.message}` };
    }

    // Filter stagnated deals
    const now = Date.now();
    const stagnatedDeals = (data || []).filter((d: any) => {
        const daysInStage = Math.floor((now - new Date(d.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24));
        const limit = args.days_stagnated || d.crm_stages?.stagnation_limit_days || 7;

        if (args.funnel_name && !d.crm_funnels?.name?.toLowerCase().includes(args.funnel_name.toLowerCase())) {
            return false;
        }

        return daysInStage >= limit;
    });

    if (stagnatedDeals.length === 0) {
        return { success: true, data: { found: false, message: 'Não há negociações estagnadas no momento 🎉' } };
    }

    return {
        success: true,
        data: {
            found: true,
            count: stagnatedDeals.length,
            deals: stagnatedDeals.map((d: any) => {
                const daysInStage = Math.floor((now - new Date(d.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24));
                return {
                    title: d.title || `Negociação #${d.id.slice(0, 8)}`,
                    contact: d.contacts?.push_name || 'Sem contato',
                    stage: d.crm_stages?.name || 'Sem etapa',
                    days_stagnated: daysInStage,
                    value: formatCurrency(d.value || 0)
                };
            })
        }
    };
}

async function crmGetDealsCountByStage(
    supabase: any,
    context: UserContext,
    args: { funnel_name: string }
): Promise<FunctionResult> {

    // Find funnel
    const funnelLookup = await lookupFunnel(supabase, args.funnel_name, context.owner_id);
    if (!funnelLookup.found) {
        return { success: true, data: { found: false, message: `Funil "${args.funnel_name}" não encontrado` } };
    }
    if (!funnelLookup.single && !funnelLookup.exact_match) {
        return { success: true, data: { found: false, message: funnelLookup.message } };
    }

    const funnel = funnelLookup.items[0];

    // Get stages with deal counts
    const { data: stages, error: stagesError } = await supabase
        .from('crm_stages')
        .select('id, name, order_index')
        .eq('funnel_id', funnel.id)
        .order('order_index');

    if (stagesError || !stages) {
        return { success: false, error: 'Erro ao buscar etapas' };
    }

    // Get deals for this funnel
    let dealsQuery = supabase
        .from('crm_deals')
        .select('stage_id, value')
        .eq('user_id', context.owner_id)
        .eq('funnel_id', funnel.id)
        .is('closed_at', null);

    if (!canViewAll(context.role, 'crm')) {
        dealsQuery = dealsQuery.eq('assigned_to', context.team_member_id);
    }

    const { data: deals, error: dealsError } = await dealsQuery;

    if (dealsError) {
        return { success: false, error: 'Erro ao buscar negociações' };
    }

    // Count by stage
    const stageCounts = stages.map((stage: any) => {
        const stageDeals = (deals || []).filter((d: any) => d.stage_id === stage.id);
        const totalValue = stageDeals.reduce((sum: number, d: any) => sum + Number(d.value || 0), 0);
        return {
            name: stage.name,
            count: stageDeals.length,
            value: formatCurrency(totalValue)
        };
    });

    const totalDeals = (deals || []).length;
    const totalValue = (deals || []).reduce((sum: number, d: any) => sum + Number(d.value || 0), 0);

    return {
        success: true,
        data: {
            funnel: funnel.name,
            total_deals: totalDeals,
            total_value: formatCurrency(totalValue),
            stages: stageCounts
        }
    };
}

async function crmGetTotalPipelineValue(
    supabase: any,
    context: UserContext,
    args: { funnel_name?: string }
): Promise<FunctionResult> {

    let query = supabase
        .from('crm_deals')
        .select('value, crm_funnels (name)')
        .eq('user_id', context.owner_id)
        .is('closed_at', null);

    if (!canViewAll(context.role, 'crm')) {
        query = query.eq('assigned_to', context.team_member_id);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: 'Erro ao calcular pipeline' };
    }

    let filteredDeals = data || [];
    if (args.funnel_name) {
        filteredDeals = filteredDeals.filter((d: any) =>
            d.crm_funnels?.name?.toLowerCase().includes(args.funnel_name!.toLowerCase())
        );
    }

    const totalValue = filteredDeals.reduce((sum: number, d: any) => sum + Number(d.value || 0), 0);

    return {
        success: true,
        data: {
            funnel: args.funnel_name || 'Todos os funis',
            deals_count: filteredDeals.length,
            total_pipeline_value: formatCurrency(totalValue)
        }
    };
}

async function crmGetFunnelsList(
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    const funnels = await getAllFunnels(supabase, context.owner_id);

    if (funnels.length === 0) {
        return { success: true, data: { found: false, message: 'Você ainda não tem funis cadastrados' } };
    }

    return {
        success: true,
        data: {
            found: true,
            count: funnels.length,
            funnels: funnels.map((f: any) => ({
                name: f.name,
                stages_count: f.stages?.length || 0,
                stages: (f.stages || []).sort((a: any, b: any) => a.order_index - b.order_index).map((s: any) => s.name)
            }))
        }
    };
}

async function crmUpdateDeal(
    supabase: any,
    context: UserContext,
    args: { deal_title: string; new_title?: string; new_value?: number; new_description?: string }
): Promise<FunctionResult> {

    if (!hasPermission(context.role, 'crm:update')) {
        return { success: false, error: 'Você não tem permissão para editar negociações' };
    }

    if (!args.new_title && args.new_value === undefined && !args.new_description) {
        return { success: false, error: 'Informe pelo menos um campo para atualizar (título, valor ou descrição)' };
    }

    let query = supabase
        .from('crm_deals')
        .select('id, title, value, description, assigned_to')
        .eq('user_id', context.owner_id)
        .is('closed_at', null)
        .ilike('title', `%${args.deal_title}%`);

    if (!canViewAll(context.role, 'crm')) {
        query = query.eq('assigned_to', context.team_member_id);
    }

    const { data, error } = await query.limit(5);

    if (error) return { success: false, error: `Erro ao buscar negociação: ${error.message}` };
    if (!data || data.length === 0) {
        return { success: true, data: { found: false, message: `Nenhuma negociação encontrada com o título "${args.deal_title}"` } };
    }

    if (data.length > 1) {
        const list = data.map((d: any, i: number) => `${i + 1}. **${d.title}** (${formatCurrency(d.value || 0)})`).join('\n');
        return {
            success: true,
            data: { needs_info: true, message: `Encontrei ${data.length} negociações. Qual você quer editar?\n\n${list}` }
        };
    }

    const deal = data[0];
    const updates: Record<string, any> = {};
    const changes: string[] = [];

    if (args.new_title) { updates.title = args.new_title; changes.push(`Título: "${deal.title}" → "${args.new_title}"`); }
    if (args.new_value !== undefined) { updates.value = args.new_value; changes.push(`Valor: ${formatCurrency(deal.value || 0)} → ${formatCurrency(args.new_value)}`); }
    if (args.new_description) { updates.description = args.new_description; changes.push(`Descrição atualizada`); }

    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: `Confirma as alterações na negociação **"${deal.title}"**?\n\n${changes.map(c => `• ${c}`).join('\n')}`,
        data: {
            action: 'update_deal',
            params: { deal_id: deal.id, updates },
            summary: { title: deal.title, changes }
        }
    };
}

async function crmMoveDealStage(
    supabase: any,
    context: UserContext,
    args: { deal_title: string; target_stage: string; funnel_name?: string }
): Promise<FunctionResult> {

    if (!hasPermission(context.role, 'crm:update')) {
        return { success: false, error: 'Você não tem permissão para mover negociações' };
    }

    // Find deal
    let dealQuery = supabase
        .from('crm_deals')
        .select('id, title, stage_id, funnel_id, assigned_to, crm_stages(name), crm_funnels(name, id)')
        .eq('user_id', context.owner_id)
        .is('closed_at', null)
        .ilike('title', `%${args.deal_title}%`);

    if (!canViewAll(context.role, 'crm')) {
        dealQuery = dealQuery.eq('assigned_to', context.team_member_id);
    }

    const { data: deals, error: dealError } = await dealQuery.limit(5);

    if (dealError) return { success: false, error: `Erro ao buscar negociação: ${dealError.message}` };
    if (!deals || deals.length === 0) {
        return { success: true, data: { found: false, message: `Negociação "${args.deal_title}" não encontrada` } };
    }

    if (deals.length > 1) {
        const list = deals.map((d: any, i: number) => `${i + 1}. **${d.title}** (${d.crm_stages?.name || '?'} em ${d.crm_funnels?.name || '?'})`).join('\n');
        return { success: true, data: { needs_info: true, message: `Encontrei ${deals.length} negociações:\n\n${list}\n\nQual você quer mover?` } };
    }

    const deal = deals[0];

    // Find target stage in the deal's funnel
    const { data: stages } = await supabase
        .from('crm_stages')
        .select('id, name')
        .eq('funnel_id', deal.funnel_id)
        .ilike('name', `%${args.target_stage}%`);

    if (!stages || stages.length === 0) {
        return { success: true, data: { found: false, message: `Etapa "${args.target_stage}" não encontrada no funil **${deal.crm_funnels?.name}**` } };
    }

    if (stages.length > 1) {
        const stageList = stages.map((s: any) => `• ${s.name}`).join('\n');
        return { success: true, data: { needs_info: true, message: `Encontrei ${stages.length} etapas com esse nome:\n${stageList}\n\nQual é a etapa de destino?` } };
    }

    const targetStage = stages[0];

    if (targetStage.id === deal.stage_id) {
        return { success: true, data: { needs_info: true, message: `A negociação já está na etapa **${targetStage.name}**` } };
    }

    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: `Mover **"${deal.title}"** de **${deal.crm_stages?.name}** para **${targetStage.name}**?`,
        data: {
            action: 'move_deal_stage',
            params: { deal_id: deal.id, stage_id: targetStage.id },
            summary: { title: deal.title, from_stage: deal.crm_stages?.name, to_stage: targetStage.name }
        }
    };
}
