// Diagnostics functions for Bia AI
// Read-only access to system tables for troubleshooting

import { UserContext, FunctionResult, ToolFunction } from './types.ts';
import { formatDateBR } from './helpers.ts';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const diagnosticsTools: ToolFunction[] = [
    {
        type: 'function',
        function: {
            name: 'diagnostics_check_connections',
            description: 'Verifica o status das conexões WhatsApp/Instagram do cliente. Use quando o usuário relatar problemas com envio/recebimento de mensagens.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'diagnostics_check_conversations',
            description: 'Verifica as últimas conversas e seus status. Use para diagnosticar problemas com atendimento ou mensagens.',
            parameters: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'number',
                        description: 'Quantidade de conversas para buscar (máx 10)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'diagnostics_check_team',
            description: 'Verifica membros da equipe, seus cargos e status. Use para diagnosticar problemas de permissão ou acesso.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'diagnostics_get_financial',
            description: 'Busca resumo financeiro recente (receitas, despesas do mês). Use quando o usuário perguntar sobre faturamento ou dados financeiros.',
            parameters: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        description: 'Período: today, week, month',
                        enum: ['today', 'week', 'month']
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'diagnostics_check_queues',
            description: 'Verifica as filas de atendimento configuradas e quantas conversas cada fila tem. Use para diagnosticar problemas de distribuição.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'diagnostics_check_ai_config',
            description: 'Verifica as configurações de IA do cliente (se está ativa, delay, follow-up). Use para diagnosticar problemas com a IA do atendimento.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    }
];

// ============================================
// FUNCTION HANDLERS
// ============================================

export async function handleDiagnosticsFunction(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {
    switch (functionName) {
        case 'diagnostics_check_connections':
            return await checkConnections(supabase, context);
        case 'diagnostics_check_conversations':
            return await checkConversations(supabase, context, args);
        case 'diagnostics_check_team':
            return await checkTeam(supabase, context);
        case 'diagnostics_get_financial':
            return await getFinancial(supabase, context, args);
        case 'diagnostics_check_queues':
            return await checkQueues(supabase, context);
        case 'diagnostics_check_ai_config':
            return await checkAiConfig(supabase, context);
        default:
            return { success: false, error: `Função desconhecida: ${functionName}` };
    }
}

// ============================================
// IMPLEMENTATIONS
// ============================================

async function checkConnections(
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {
    const { data, error } = await supabase
        .from('instances')
        .select('id, instance_name, status, client_number, default_queue_id, created_at')
        .eq('user_id', context.owner_id);

    if (error) {
        return { success: false, error: `Erro ao verificar conexões: ${error.message}` };
    }

    if (!data || data.length === 0) {
        return {
            success: true,
            data: {
                found: false,
                message: 'Nenhuma instância WhatsApp/Instagram configurada'
            }
        };
    }

    return {
        success: true,
        data: {
            found: true,
            count: data.length,
            instances: data.map((i: any) => ({
                name: i.instance_name,
                status: i.status || 'unknown',
                phone: i.client_number || 'Não informado',
                has_default_queue: !!i.default_queue_id,
                created_at: formatDateBR(i.created_at)
            }))
        }
    };
}

async function checkConversations(
    supabase: any,
    context: UserContext,
    args: { limit?: number }
): Promise<FunctionResult> {
    const limit = Math.min(args.limit || 5, 10);

    const { data, error } = await supabase
        .from('conversations')
        .select('id, status, channel, unread_count, last_message_at, queue_id, assigned_agent_id')
        .eq('user_id', context.owner_id)
        .order('last_message_at', { ascending: false })
        .limit(limit);

    if (error) {
        return { success: false, error: `Erro ao verificar conversas: ${error.message}` };
    }

    // Count by status
    const { data: statusCounts } = await supabase
        .from('conversations')
        .select('status')
        .eq('user_id', context.owner_id);

    const counts: Record<string, number> = {};
    statusCounts?.forEach((c: any) => {
        counts[c.status] = (counts[c.status] || 0) + 1;
    });

    return {
        success: true,
        data: {
            total_conversations: statusCounts?.length || 0,
            status_breakdown: counts,
            recent: (data || []).map((c: any) => ({
                status: c.status,
                channel: c.channel,
                unread: c.unread_count || 0,
                has_agent: !!c.assigned_agent_id,
                has_queue: !!c.queue_id,
                last_message: c.last_message_at ? formatDateBR(c.last_message_at) : 'Sem mensagens'
            }))
        }
    };
}

async function checkTeam(
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {
    const { data, error } = await supabase
        .from('team_members')
        .select('id, full_name, name, role, email, created_at')
        .eq('user_id', context.owner_id);

    if (error) {
        return { success: false, error: `Erro ao verificar equipe: ${error.message}` };
    }

    const roleCounts: Record<string, number> = {};
    data?.forEach((m: any) => {
        const role = m.role || 'agent';
        roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    return {
        success: true,
        data: {
            total: data?.length || 0,
            role_breakdown: roleCounts,
            members: (data || []).map((m: any) => ({
                name: m.full_name || m.name,
                role: m.role,
                email: m.email || 'N/A'
            }))
        }
    };
}

async function getFinancial(
    supabase: any,
    context: UserContext,
    args: { period?: string }
): Promise<FunctionResult> {
    const now = new Date();
    let startDate: Date;

    switch (args.period) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 7);
            break;
        default: // month
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
    }

    const endDate = new Date(now);
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    // Revenues (receitas pagas ou futuras no período)
    const { data: revenueData } = await supabase
        .from('revenues')
        .select('amount, status')
        .eq('user_id', context.owner_id)
        .gte('due_date', startISO)
        .lte('due_date', endISO);

    const totalRevenue = revenueData?.reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0) || 0;
    const paidRevenue = revenueData?.filter((r: any) => r.status === 'paid')
        .reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0) || 0;
    const salesCount = revenueData?.length || 0;

    // Expenses (despesas no período)
    let expenses = 0;
    try {
        const { data: expenseData } = await supabase
            .from('expenses')
            .select('amount, status')
            .eq('user_id', context.owner_id)
            .gte('due_date', startISO)
            .lte('due_date', endISO);

        expenses = expenseData?.reduce((sum: number, e: any) => sum + (parseFloat(e.amount) || 0), 0) || 0;
    } catch (_) { /* table might not exist */ }

    const periodLabel = args.period === 'today' ? 'hoje' :
        args.period === 'week' ? 'última semana' : 'este mês';

    return {
        success: true,
        data: {
            period: periodLabel,
            revenue_total: totalRevenue,
            revenue_total_formatted: `R$ ${totalRevenue.toFixed(2)}`,
            revenue_paid: paidRevenue,
            revenue_paid_formatted: `R$ ${paidRevenue.toFixed(2)}`,
            revenue_entries: salesCount,
            expenses: expenses,
            expenses_formatted: `R$ ${expenses.toFixed(2)}`,
            profit: paidRevenue - expenses,
            profit_formatted: `R$ ${(paidRevenue - expenses).toFixed(2)}`
        }
    };
}

async function checkQueues(
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {
    const { data: queues, error } = await supabase
        .from('queues')
        .select('id, name, is_default')
        .eq('user_id', context.owner_id);

    if (error) {
        return { success: false, error: `Erro ao verificar filas: ${error.message}` };
    }

    // Count conversations per queue
    const queueData = [];
    for (const q of (queues || [])) {
        const { count } = await supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', context.owner_id)
            .eq('queue_id', q.id);

        queueData.push({
            name: q.name,
            is_default: q.is_default || false,
            conversation_count: count || 0
        });
    }

    return {
        success: true,
        data: {
            total_queues: queues?.length || 0,
            queues: queueData
        }
    };
}

async function checkAiConfig(
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {
    const { data, error } = await supabase
        .from('ia_config')
        .select('*')
        .eq('user_id', context.owner_id)
        .single();

    if (error || !data) {
        return {
            success: true,
            data: {
                configured: false,
                message: 'IA não configurada para este usuário'
            }
        };
    }

    return {
        success: true,
        data: {
            configured: true,
            ia_ativa: data.ia_on || false,
            nome_agente: data.agent_name || data.name || 'Não configurado',
            delay_segundos: data.delay || 0,
            followup_ativo: data.followup || false,
            crm_automatico: data.crm_auto || false,
            agendamento_automatico: data.scheduling_on || false,
            responde_audio: data.voice || false,
            followup_horario_comercial: data.followup_business_hours || false
        }
    };
}
