// Products functions for Bia AI
// Query, create, and edit products/services

import { UserContext, FunctionResult, ToolFunction } from './types.ts';
import { hasPermission } from './permissions.ts';
import { formatCurrency, lookupProduct } from './helpers.ts';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const productsTools: ToolFunction[] = [
    {
        type: 'function',
        function: {
            name: 'products_search',
            description: 'Busca produtos ou serviços por nome',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome ou parte do nome para buscar'
                    },
                    type: {
                        type: 'string',
                        description: 'Tipo (produto ou serviço)',
                        enum: ['product', 'service']
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'products_list_all',
            description: 'Lista todos os produtos e serviços cadastrados',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        description: 'Filtrar por tipo',
                        enum: ['product', 'service']
                    },
                    limit: {
                        type: 'number',
                        description: 'Quantidade máxima de itens (padrão: 20)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'products_get_details',
            description: 'Busca detalhes de um produto ou serviço específico',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome do produto/serviço'
                    }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'products_create',
            description: 'Cria um novo produto ou serviço. Use quando o usuário pedir para cadastrar um item.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome do produto/serviço'
                    },
                    type: {
                        type: 'string',
                        description: 'Tipo: produto ou serviço',
                        enum: ['product', 'service']
                    },
                    price: {
                        type: 'number',
                        description: 'Preço em reais'
                    },
                    description: {
                        type: 'string',
                        description: 'Descrição (opcional)'
                    },
                    stock_quantity: {
                        type: 'number',
                        description: 'Quantidade em estoque (apenas para produtos)'
                    },
                    duration_minutes: {
                        type: 'number',
                        description: 'Duração em minutos (apenas para serviços)'
                    },
                    opportunity_alert_days: {
                        type: 'number',
                        description: 'Dias para gerar oportunidade de recontato (opcional)'
                    }
                },
                required: ['name', 'type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'products_update',
            description: 'Atualiza um produto ou serviço existente',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Nome atual do produto/serviço'
                    },
                    new_name: {
                        type: 'string',
                        description: 'Novo nome (opcional)'
                    },
                    price: {
                        type: 'number',
                        description: 'Novo preço (opcional)'
                    },
                    description: {
                        type: 'string',
                        description: 'Nova descrição (opcional)'
                    },
                    stock_quantity: {
                        type: 'number',
                        description: 'Nova quantidade em estoque (opcional)'
                    },
                    duration_minutes: {
                        type: 'number',
                        description: 'Nova duração (opcional)'
                    }
                },
                required: ['name']
            }
        }
    }
];

// ============================================
// FUNCTION HANDLERS
// ============================================

export async function handleProductsFunction(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    switch (functionName) {
        case 'products_search':
            return await productsSearch(supabase, context, args);
        case 'products_list_all':
            return await productsListAll(supabase, context, args);
        case 'products_get_details':
            return await productsGetDetails(supabase, context, args);
        case 'products_create':
            return await productsCreate(supabase, context, args);
        case 'products_update':
            return await productsUpdate(supabase, context, args);
        default:
            return { success: false, error: `Função desconhecida: ${functionName}` };
    }
}

// ============================================
// FUNCTION IMPLEMENTATIONS
// ============================================

async function productsSearch(
    supabase: any,
    context: UserContext,
    args: { name?: string; type?: string }
): Promise<FunctionResult> {

    let query = supabase
        .from('products_services')
        .select('id, type, name, description, price, stock_quantity, duration_minutes')
        .eq('user_id', context.owner_id);

    if (args.name) {
        query = query.ilike('name', `%${args.name}%`);
    }
    if (args.type) {
        query = query.eq('type', args.type);
    }

    const { data, error } = await query.order('name').limit(10);

    if (error) {
        return { success: false, error: `Erro ao buscar: ${error.message}` };
    }

    if (!data || data.length === 0) {
        return { success: true, data: { found: false, message: 'Nenhum item encontrado' } };
    }

    return {
        success: true,
        data: {
            found: true,
            count: data.length,
            items: data.map((p: any) => ({
                name: p.name,
                type: p.type === 'product' ? 'Produto' : 'Serviço',
                price: formatCurrency(p.price || 0),
                stock: p.type === 'product' ? (p.stock_quantity || 0) : null,
                duration: p.type === 'service' ? `${p.duration_minutes || 0} min` : null,
                description: p.description || null
            }))
        }
    };
}

async function productsListAll(
    supabase: any,
    context: UserContext,
    args: { type?: string; limit?: number }
): Promise<FunctionResult> {

    let query = supabase
        .from('products_services')
        .select('id, type, name, price, stock_quantity, duration_minutes')
        .eq('user_id', context.owner_id);

    if (args.type) {
        query = query.eq('type', args.type);
    }

    const { data, error } = await query.order('name').limit(args.limit || 20);

    if (error) {
        return { success: false, error: `Erro ao listar: ${error.message}` };
    }

    if (!data || data.length === 0) {
        const typeLabel = args.type === 'product' ? 'produtos' : args.type === 'service' ? 'serviços' : 'itens';
        return { success: true, data: { found: false, message: `Você não tem ${typeLabel} cadastrados` } };
    }

    // Group by type
    const products = data.filter((p: any) => p.type === 'product');
    const services = data.filter((p: any) => p.type === 'service');

    return {
        success: true,
        data: {
            found: true,
            total: data.length,
            products_count: products.length,
            services_count: services.length,
            products: products.map((p: any) => ({
                name: p.name,
                price: formatCurrency(p.price || 0),
                stock: p.stock_quantity || 0
            })),
            services: services.map((s: any) => ({
                name: s.name,
                price: formatCurrency(s.price || 0),
                duration: `${s.duration_minutes || 0} min`
            }))
        }
    };
}

async function productsGetDetails(
    supabase: any,
    context: UserContext,
    args: { name: string }
): Promise<FunctionResult> {

    const lookup = await lookupProduct(supabase, args.name, context.owner_id);
    if (!lookup.found) {
        return { success: true, data: { found: false, message: `"${args.name}" não encontrado` } };
    }
    if (!lookup.single && !lookup.exact_match) {
        return { success: true, data: { found: false, message: lookup.message } };
    }

    const product = lookup.items[0];

    return {
        success: true,
        data: {
            found: true,
            item: {
                name: product.name,
                type: product.type === 'product' ? 'Produto' : 'Serviço',
                price: formatCurrency(product.price || 0),
                description: product.description || 'Sem descrição',
                stock: product.type === 'product' ? (product.stock_quantity || 0) : null,
                duration: product.type === 'service' ? `${product.duration_minutes || 0} minutos` : null
            }
        }
    };
}

async function productsCreate(
    supabase: any,
    context: UserContext,
    args: {
        name: string;
        type: 'product' | 'service';
        price?: number;
        description?: string;
        stock_quantity?: number;
        duration_minutes?: number;
        opportunity_alert_days?: number;
    }
): Promise<FunctionResult> {

    // Check permission
    if (!hasPermission(context.role, 'products:create')) {
        return { success: false, error: 'Você não tem permissão para criar produtos/serviços' };
    }

    // Handle defaults
    const defaults: { field: string; default_value: any; description: string }[] = [];

    const price = args.price ?? 0;
    if (args.price === undefined) {
        defaults.push({ field: 'price', default_value: 'R$ 0,00 (sob consulta)', description: 'Preço' });
    }

    let stock = null;
    let duration = null;

    if (args.type === 'product') {
        stock = args.stock_quantity ?? 0;
        if (args.stock_quantity === undefined) {
            defaults.push({ field: 'stock_quantity', default_value: '0', description: 'Estoque' });
        }
    } else {
        duration = args.duration_minutes ?? 60;
        if (args.duration_minutes === undefined) {
            defaults.push({ field: 'duration_minutes', default_value: '60 minutos', description: 'Duração' });
        }
    }

    const typeLabel = args.type === 'product' ? 'Produto' : 'Serviço';
    let confirmMessage = `Confirma a criação do ${typeLabel.toLowerCase()}?\n\n📦 **Nome**: ${args.name}\n📋 **Tipo**: ${typeLabel}\n💰 **Preço**: ${formatCurrency(price)}`;

    if (args.type === 'product') {
        confirmMessage += `\n📊 **Estoque**: ${stock} unidades`;
    } else {
        confirmMessage += `\n⏱️ **Duração**: ${duration} minutos`;
    }

    if (args.description) {
        confirmMessage += `\n📝 **Descrição**: ${args.description}`;
    }

    if (defaults.length > 0) {
        confirmMessage += `\n\n💡 *Valores padrão usados: ${defaults.map(d => `${d.description}: ${d.default_value}`).join(', ')}*`;
    }

    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: confirmMessage,
        data: {
            action: 'create_product',
            params: {
                user_id: context.owner_id,
                name: args.name,
                type: args.type,
                price: price,
                description: args.description || null,
                stock_quantity: stock,
                duration_minutes: duration,
                opportunity_alert_days: args.opportunity_alert_days || 0
            },
            summary: {
                name: args.name,
                type: typeLabel,
                price: formatCurrency(price)
            }
        }
    };
}

async function productsUpdate(
    supabase: any,
    context: UserContext,
    args: {
        name: string;
        new_name?: string;
        price?: number;
        description?: string;
        stock_quantity?: number;
        duration_minutes?: number;
    }
): Promise<FunctionResult> {

    // Check permission
    if (!hasPermission(context.role, 'products:update')) {
        return { success: false, error: 'Você não tem permissão para editar produtos/serviços' };
    }

    // Find product
    const lookup = await lookupProduct(supabase, args.name, context.owner_id);
    if (!lookup.found) {
        return { success: true, data: { found: false, message: `"${args.name}" não encontrado` } };
    }
    if (!lookup.single && !lookup.exact_match) {
        return { success: true, data: { found: false, message: lookup.message } };
    }

    const product = lookup.items[0];

    // Build update object
    const updates: Record<string, any> = {};
    const changes: string[] = [];

    if (args.new_name) {
        updates.name = args.new_name;
        changes.push(`Nome: ${product.name} → ${args.new_name}`);
    }
    if (args.price !== undefined) {
        updates.price = args.price;
        changes.push(`Preço: ${formatCurrency(product.price)} → ${formatCurrency(args.price)}`);
    }
    if (args.description !== undefined) {
        updates.description = args.description;
        changes.push(`Descrição: ${args.description}`);
    }
    if (args.stock_quantity !== undefined && product.type === 'product') {
        updates.stock_quantity = args.stock_quantity;
        changes.push(`Estoque: ${product.stock_quantity} → ${args.stock_quantity}`);
    }
    if (args.duration_minutes !== undefined && product.type === 'service') {
        updates.duration_minutes = args.duration_minutes;
        changes.push(`Duração: ${product.duration_minutes}min → ${args.duration_minutes}min`);
    }

    if (changes.length === 0) {
        return { success: true, data: { message: 'Nenhuma alteração informada' } };
    }

    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: `Confirma as alterações em **${product.name}**?\n\n${changes.map(c => `• ${c}`).join('\n')}`,
        data: {
            action: 'update_product',
            params: {
                product_id: product.id,
                updates: updates
            },
            summary: {
                product: product.name,
                changes: changes
            }
        }
    };
}
