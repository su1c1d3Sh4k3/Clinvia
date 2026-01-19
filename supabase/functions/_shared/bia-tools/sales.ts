// Sales functions for Bia AI
// Read-only sales queries and reports

import { UserContext, FunctionResult, ToolFunction } from './types.ts';
import { hasPermission, canViewAll } from './permissions.ts';
import { resolveDate, formatDateBR, formatCurrency, getDateRange, lookupTeamMember, lookupProfessional, lookupProduct } from './helpers.ts';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const salesTools: ToolFunction[] = [
    {
        type: 'function',
        function: {
            name: 'sales_get_by_date',
            description: 'Busca vendas de uma data específica',
            parameters: {
                type: 'object',
                properties: {
                    date: {
                        type: 'string',
                        description: 'Data (hoje, ontem, DD/MM, ou YYYY-MM-DD)'
                    }
                },
                required: ['date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_by_period',
            description: 'Busca vendas de um período',
            parameters: {
                type: 'object',
                properties: {
                    start_date: {
                        type: 'string',
                        description: 'Data inicial'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final'
                    },
                    period: {
                        type: 'string',
                        description: 'Período predefinido (se não informar datas)',
                        enum: ['week', 'month', 'year']
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_by_professional',
            description: 'Busca vendas de um profissional específico',
            parameters: {
                type: 'object',
                properties: {
                    professional_name: {
                        type: 'string',
                        description: 'Nome do profissional'
                    },
                    start_date: {
                        type: 'string',
                        description: 'Data inicial (opcional)'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final (opcional)'
                    }
                },
                required: ['professional_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_by_attendant',
            description: 'Busca vendas de um atendente específico',
            parameters: {
                type: 'object',
                properties: {
                    attendant_name: {
                        type: 'string',
                        description: 'Nome do atendente'
                    },
                    start_date: {
                        type: 'string',
                        description: 'Data inicial (opcional)'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final (opcional)'
                    }
                },
                required: ['attendant_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_by_product',
            description: 'Busca vendas de um produto ou serviço específico',
            parameters: {
                type: 'object',
                properties: {
                    product_name: {
                        type: 'string',
                        description: 'Nome do produto ou serviço'
                    },
                    start_date: {
                        type: 'string',
                        description: 'Data inicial (opcional)'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final (opcional)'
                    }
                },
                required: ['product_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_top_selling',
            description: 'Busca o item mais vendido em um período',
            parameters: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        description: 'Período para análise',
                        enum: ['week', 'month', 'year']
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_revenue_by_period',
            description: 'Busca o faturamento total de um período',
            parameters: {
                type: 'object',
                properties: {
                    start_date: {
                        type: 'string',
                        description: 'Data inicial'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final'
                    },
                    period: {
                        type: 'string',
                        description: 'Período predefinido',
                        enum: ['week', 'month', 'year']
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_summary',
            description: 'Busca um resumo geral das vendas (faturamento, quantidade, ticket médio)',
            parameters: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        description: 'Período para análise',
                        enum: ['week', 'month', 'year']
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_count_by_period',
            description: 'Conta quantas vendas foram realizadas em um período',
            parameters: {
                type: 'object',
                properties: {
                    start_date: {
                        type: 'string',
                        description: 'Data inicial'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final'
                    }
                },
                required: ['start_date', 'end_date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sales_get_average_ticket',
            description: 'Calcula o ticket médio das vendas',
            parameters: {
                type: 'object',
                properties: {
                    start_date: {
                        type: 'string',
                        description: 'Data inicial (opcional)'
                    },
                    end_date: {
                        type: 'string',
                        description: 'Data final (opcional)'
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

export async function handleSalesFunction(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    switch (functionName) {
        case 'sales_get_by_date':
            return await salesGetByDate(supabase, context, args);
        case 'sales_get_by_period':
            return await salesGetByPeriod(supabase, context, args);
        case 'sales_get_by_professional':
            return await salesGetByProfessional(supabase, context, args);
        case 'sales_get_by_attendant':
            return await salesGetByAttendant(supabase, context, args);
        case 'sales_get_by_product':
            return await salesGetByProduct(supabase, context, args);
        case 'sales_get_top_selling':
            return await salesGetTopSelling(supabase, context, args);
        case 'sales_get_revenue_by_period':
            return await salesGetRevenue(supabase, context, args);
        case 'sales_get_summary':
            return await salesGetSummary(supabase, context, args);
        case 'sales_get_count_by_period':
            return await salesGetCount(supabase, context, args);
        case 'sales_get_average_ticket':
            return await salesGetAverageTicket(supabase, context, args);
        default:
            return { success: false, error: `Função desconhecida: ${functionName}` };
    }
}

// ============================================
// FUNCTION IMPLEMENTATIONS
// ============================================

async function salesGetByDate(
    supabase: any,
    context: UserContext,
    args: { date: string }
): Promise<FunctionResult> {

    const dateStr = resolveDate(args.date);

    let query = supabase
        .from('sales')
        .select(`
            id, category, quantity, unit_price, total_amount, payment_type, sale_date,
            products_services (name),
            team_members (name),
            professionals (name)
        `)
        .eq('user_id', context.owner_id)
        .eq('sale_date', dateStr)
        .order('created_at', { ascending: false });

    // Permission check for agents
    if (!canViewAll(context.role, 'sales')) {
        query = query.eq('team_member_id', context.team_member_id);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao buscar vendas: ${error.message}` };
    }

    if (!data || data.length === 0) {
        return {
            success: true,
            data: {
                found: false,
                date: formatDateBR(dateStr),
                message: `Não houve vendas em ${formatDateBR(dateStr)}`
            }
        };
    }

    const totalRevenue = data.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

    return {
        success: true,
        data: {
            found: true,
            date: formatDateBR(dateStr),
            count: data.length,
            total_revenue: formatCurrency(totalRevenue),
            sales: data.map((s: any) => ({
                product: s.products_services?.name || 'Produto não encontrado',
                category: s.category === 'product' ? 'Produto' : 'Serviço',
                quantity: s.quantity,
                unit_price: formatCurrency(s.unit_price),
                total: formatCurrency(s.total_amount),
                payment: s.payment_type === 'cash' ? 'À vista' : 'Parcelado',
                attendant: s.team_members?.name || null,
                professional: s.professionals?.name || null
            }))
        }
    };
}

async function salesGetByPeriod(
    supabase: any,
    context: UserContext,
    args: { start_date?: string; end_date?: string; period?: string }
): Promise<FunctionResult> {

    let startDate: string, endDate: string;

    if (args.period) {
        const range = getDateRange(args.period as 'week' | 'month' | 'year');
        startDate = range.start;
        endDate = range.end;
    } else if (args.start_date && args.end_date) {
        startDate = resolveDate(args.start_date);
        endDate = resolveDate(args.end_date);
    } else {
        // Default to this month
        const range = getDateRange('month');
        startDate = range.start;
        endDate = range.end;
    }

    let query = supabase
        .from('sales')
        .select(`
            id, category, quantity, total_amount, sale_date,
            products_services (name)
        `)
        .eq('user_id', context.owner_id)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
        .order('sale_date', { ascending: false });

    if (!canViewAll(context.role, 'sales')) {
        query = query.eq('team_member_id', context.team_member_id);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao buscar vendas: ${error.message}` };
    }

    const totalRevenue = (data || []).reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
    const totalQuantity = (data || []).reduce((sum: number, s: any) => sum + Number(s.quantity), 0);

    return {
        success: true,
        data: {
            found: (data?.length || 0) > 0,
            period: `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`,
            count: data?.length || 0,
            total_quantity: totalQuantity,
            total_revenue: formatCurrency(totalRevenue),
            average_ticket: data?.length ? formatCurrency(totalRevenue / data.length) : formatCurrency(0)
        }
    };
}

async function salesGetByProfessional(
    supabase: any,
    context: UserContext,
    args: { professional_name: string; start_date?: string; end_date?: string }
): Promise<FunctionResult> {

    const profLookup = await lookupProfessional(supabase, args.professional_name, context.owner_id);
    if (!profLookup.found) {
        return { success: true, data: { found: false, message: `Profissional "${args.professional_name}" não encontrado` } };
    }
    if (!profLookup.single && !profLookup.exact_match) {
        return { success: true, data: { found: false, message: profLookup.message } };
    }

    const professional = profLookup.items[0];
    const range = args.start_date && args.end_date ?
        { start: resolveDate(args.start_date), end: resolveDate(args.end_date) } :
        getDateRange('month');

    const { data, error } = await supabase
        .from('sales')
        .select('id, total_amount, quantity, sale_date, products_services (name)')
        .eq('user_id', context.owner_id)
        .eq('professional_id', professional.id)
        .gte('sale_date', range.start)
        .lte('sale_date', range.end);

    if (error) {
        return { success: false, error: `Erro ao buscar vendas: ${error.message}` };
    }

    const totalRevenue = (data || []).reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

    return {
        success: true,
        data: {
            found: (data?.length || 0) > 0,
            professional: professional.name,
            period: `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`,
            count: data?.length || 0,
            total_revenue: formatCurrency(totalRevenue)
        }
    };
}

async function salesGetByAttendant(
    supabase: any,
    context: UserContext,
    args: { attendant_name: string; start_date?: string; end_date?: string }
): Promise<FunctionResult> {

    // Check permission
    if (!canViewAll(context.role, 'sales')) {
        return { success: false, error: 'Você só pode ver suas próprias vendas' };
    }

    const memberLookup = await lookupTeamMember(supabase, args.attendant_name, context.owner_id);
    if (!memberLookup.found) {
        return { success: true, data: { found: false, message: `Atendente "${args.attendant_name}" não encontrado` } };
    }
    if (!memberLookup.single && !memberLookup.exact_match) {
        return { success: true, data: { found: false, message: memberLookup.message } };
    }

    const member = memberLookup.items[0];
    const range = args.start_date && args.end_date ?
        { start: resolveDate(args.start_date), end: resolveDate(args.end_date) } :
        getDateRange('month');

    const { data, error } = await supabase
        .from('sales')
        .select('id, total_amount, quantity, sale_date, products_services (name)')
        .eq('user_id', context.owner_id)
        .eq('team_member_id', member.id)
        .gte('sale_date', range.start)
        .lte('sale_date', range.end);

    if (error) {
        return { success: false, error: `Erro ao buscar vendas: ${error.message}` };
    }

    const totalRevenue = (data || []).reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

    return {
        success: true,
        data: {
            found: (data?.length || 0) > 0,
            attendant: member.name,
            period: `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`,
            count: data?.length || 0,
            total_revenue: formatCurrency(totalRevenue)
        }
    };
}

async function salesGetByProduct(
    supabase: any,
    context: UserContext,
    args: { product_name: string; start_date?: string; end_date?: string }
): Promise<FunctionResult> {

    const productLookup = await lookupProduct(supabase, args.product_name, context.owner_id);
    if (!productLookup.found) {
        return { success: true, data: { found: false, message: `Produto/Serviço "${args.product_name}" não encontrado` } };
    }
    if (!productLookup.single && !productLookup.exact_match) {
        return { success: true, data: { found: false, message: productLookup.message } };
    }

    const product = productLookup.items[0];
    const range = args.start_date && args.end_date ?
        { start: resolveDate(args.start_date), end: resolveDate(args.end_date) } :
        getDateRange('month');

    let query = supabase
        .from('sales')
        .select('id, total_amount, quantity, sale_date')
        .eq('user_id', context.owner_id)
        .eq('product_service_id', product.id)
        .gte('sale_date', range.start)
        .lte('sale_date', range.end);

    if (!canViewAll(context.role, 'sales')) {
        query = query.eq('team_member_id', context.team_member_id);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao buscar vendas: ${error.message}` };
    }

    const totalRevenue = (data || []).reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
    const totalQuantity = (data || []).reduce((sum: number, s: any) => sum + Number(s.quantity), 0);

    return {
        success: true,
        data: {
            found: (data?.length || 0) > 0,
            product: product.name,
            type: product.type === 'product' ? 'Produto' : 'Serviço',
            period: `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`,
            sales_count: data?.length || 0,
            total_quantity: totalQuantity,
            total_revenue: formatCurrency(totalRevenue)
        }
    };
}

async function salesGetTopSelling(
    supabase: any,
    context: UserContext,
    args: { period?: string }
): Promise<FunctionResult> {

    // Check permission
    if (!hasPermission(context.role, 'sales:reports')) {
        return { success: false, error: 'Você não tem permissão para ver relatórios de vendas' };
    }

    const range = getDateRange((args.period as 'week' | 'month' | 'year') || 'month');

    const { data, error } = await supabase
        .from('sales')
        .select('product_service_id, quantity, products_services (name)')
        .eq('user_id', context.owner_id)
        .gte('sale_date', range.start)
        .lte('sale_date', range.end);

    if (error) {
        return { success: false, error: `Erro ao buscar vendas: ${error.message}` };
    }

    if (!data || data.length === 0) {
        return { success: true, data: { found: false, message: 'Nenhuma venda no período' } };
    }

    // Aggregate by product
    const productCounts: Record<string, { name: string; quantity: number }> = {};
    for (const sale of data) {
        const id = sale.product_service_id;
        if (!productCounts[id]) {
            productCounts[id] = { name: sale.products_services?.name || 'Desconhecido', quantity: 0 };
        }
        productCounts[id].quantity += sale.quantity;
    }

    // Sort by quantity
    const sorted = Object.values(productCounts).sort((a, b) => b.quantity - a.quantity);
    const top = sorted[0];

    return {
        success: true,
        data: {
            found: true,
            period: `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`,
            top_product: top.name,
            quantity_sold: top.quantity,
            ranking: sorted.slice(0, 5).map((p, i) => ({
                position: i + 1,
                name: p.name,
                quantity: p.quantity
            }))
        }
    };
}

async function salesGetRevenue(
    supabase: any,
    context: UserContext,
    args: { start_date?: string; end_date?: string; period?: string }
): Promise<FunctionResult> {

    if (!hasPermission(context.role, 'sales:reports')) {
        return { success: false, error: 'Você não tem permissão para ver relatórios de vendas' };
    }

    let range;
    if (args.period) {
        range = getDateRange(args.period as 'week' | 'month' | 'year');
    } else if (args.start_date && args.end_date) {
        range = { start: resolveDate(args.start_date), end: resolveDate(args.end_date) };
    } else {
        range = getDateRange('month');
    }

    const { data, error } = await supabase
        .from('sales')
        .select('total_amount')
        .eq('user_id', context.owner_id)
        .gte('sale_date', range.start)
        .lte('sale_date', range.end);

    if (error) {
        return { success: false, error: `Erro ao buscar faturamento: ${error.message}` };
    }

    const totalRevenue = (data || []).reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);

    return {
        success: true,
        data: {
            period: `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`,
            total_revenue: formatCurrency(totalRevenue),
            sales_count: data?.length || 0
        }
    };
}

async function salesGetSummary(
    supabase: any,
    context: UserContext,
    args: { period?: string }
): Promise<FunctionResult> {

    if (!hasPermission(context.role, 'sales:reports')) {
        return { success: false, error: 'Você não tem permissão para ver relatórios de vendas' };
    }

    const range = getDateRange((args.period as 'week' | 'month' | 'year') || 'month');

    const { data, error } = await supabase
        .from('sales')
        .select('total_amount, quantity, product_service_id, products_services (name)')
        .eq('user_id', context.owner_id)
        .gte('sale_date', range.start)
        .lte('sale_date', range.end);

    if (error) {
        return { success: false, error: `Erro ao buscar resumo: ${error.message}` };
    }

    const salesData = data || [];
    const totalRevenue = salesData.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
    const totalQuantity = salesData.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
    const averageTicket = salesData.length > 0 ? totalRevenue / salesData.length : 0;

    // Find top product
    const productCounts: Record<string, { name: string; quantity: number }> = {};
    for (const sale of salesData) {
        const id = sale.product_service_id;
        if (!productCounts[id]) {
            productCounts[id] = { name: sale.products_services?.name || 'Desconhecido', quantity: 0 };
        }
        productCounts[id].quantity += sale.quantity;
    }
    const topProduct = Object.values(productCounts).sort((a, b) => b.quantity - a.quantity)[0];

    return {
        success: true,
        data: {
            period: `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`,
            total_revenue: formatCurrency(totalRevenue),
            sales_count: salesData.length,
            total_items_sold: totalQuantity,
            average_ticket: formatCurrency(averageTicket),
            top_product: topProduct ? `${topProduct.name} (${topProduct.quantity} vendas)` : 'Nenhum'
        }
    };
}

async function salesGetCount(
    supabase: any,
    context: UserContext,
    args: { start_date: string; end_date: string }
): Promise<FunctionResult> {

    const startDate = resolveDate(args.start_date);
    const endDate = resolveDate(args.end_date);

    let query = supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', context.owner_id)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate);

    if (!canViewAll(context.role, 'sales')) {
        query = query.eq('team_member_id', context.team_member_id);
    }

    const { count, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao contar vendas: ${error.message}` };
    }

    return {
        success: true,
        data: {
            period: `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`,
            count: count || 0
        }
    };
}

async function salesGetAverageTicket(
    supabase: any,
    context: UserContext,
    args: { start_date?: string; end_date?: string }
): Promise<FunctionResult> {

    const range = args.start_date && args.end_date ?
        { start: resolveDate(args.start_date), end: resolveDate(args.end_date) } :
        getDateRange('month');

    let query = supabase
        .from('sales')
        .select('total_amount')
        .eq('user_id', context.owner_id)
        .gte('sale_date', range.start)
        .lte('sale_date', range.end);

    if (!canViewAll(context.role, 'sales')) {
        query = query.eq('team_member_id', context.team_member_id);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao calcular ticket médio: ${error.message}` };
    }

    const salesData = data || [];
    const totalRevenue = salesData.reduce((sum: number, s: any) => sum + Number(s.total_amount), 0);
    const averageTicket = salesData.length > 0 ? totalRevenue / salesData.length : 0;

    return {
        success: true,
        data: {
            period: `${formatDateBR(range.start)} a ${formatDateBR(range.end)}`,
            sales_count: salesData.length,
            average_ticket: formatCurrency(averageTicket)
        }
    };
}
