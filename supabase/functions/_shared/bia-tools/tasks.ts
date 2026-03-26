// Tasks functions for Bia AI
// Query and create tasks

import { UserContext, FunctionResult, ToolFunction } from './types.ts';
import { hasPermission, canViewAll } from './permissions.ts';
import { resolveDate, resolveTime, formatDateBR, lookupTeamMember, lookupTaskBoard, getAllTaskBoards } from './helpers.ts';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const tasksTools: ToolFunction[] = [
    {
        type: 'function',
        function: {
            name: 'tasks_get_today',
            description: 'Busca as tarefas de hoje. Use quando o usuário perguntar "quais tarefas de hoje" ou similar.',
            parameters: {
                type: 'object',
                properties: {
                    board_name: {
                        type: 'string',
                        description: 'Nome do quadro para filtrar (opcional)'
                    },
                    assignee_name: {
                        type: 'string',
                        description: 'Nome do responsável para filtrar (opcional)'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'tasks_get_by_date',
            description: 'Busca tarefas de uma data específica',
            parameters: {
                type: 'object',
                properties: {
                    date: {
                        type: 'string',
                        description: 'Data (hoje, amanhã, DD/MM, ou YYYY-MM-DD)'
                    },
                    board_name: {
                        type: 'string',
                        description: 'Nome do quadro para filtrar (opcional)'
                    },
                    assignee_name: {
                        type: 'string',
                        description: 'Nome do responsável para filtrar (opcional)'
                    },
                    status: {
                        type: 'string',
                        description: 'Status da tarefa',
                        enum: ['pending', 'open', 'finished']
                    }
                },
                required: ['date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'tasks_create',
            description: 'Cria uma nova tarefa. Use quando o usuário pedir para criar uma tarefa ou atividade.',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Título da tarefa'
                    },
                    assignee_name: {
                        type: 'string',
                        description: 'Nome do responsável pela tarefa (opcional)'
                    },
                    board_name: {
                        type: 'string',
                        description: 'Nome do quadro de tarefas'
                    },
                    date: {
                        type: 'string',
                        description: 'Data da tarefa'
                    },
                    time: {
                        type: 'string',
                        description: 'Horário da tarefa (ex: 14h, 14:30)'
                    },
                    urgency: {
                        type: 'string',
                        description: 'Urgência da tarefa',
                        enum: ['low', 'medium', 'high']
                    },
                    type: {
                        type: 'string',
                        description: 'Tipo da tarefa',
                        enum: ['activity', 'schedule', 'reminder']
                    },
                    description: {
                        type: 'string',
                        description: 'Descrição da tarefa (opcional)'
                    },
                    contact_name: {
                        type: 'string',
                        description: 'Nome do contato relacionado (opcional)'
                    }
                },
                required: ['title', 'date', 'time']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'tasks_get_boards',
            description: 'Lista todos os quadros de tarefas disponíveis',
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
            name: 'tasks_update_status',
            description: 'Altera o status de uma tarefa (pendente, em andamento, concluída). Use quando o usuário pedir para atualizar, mover ou concluir uma tarefa.',
            parameters: {
                type: 'object',
                properties: {
                    task_title: {
                        type: 'string',
                        description: 'Título ou parte do título da tarefa'
                    },
                    new_status: {
                        type: 'string',
                        description: 'Novo status da tarefa',
                        enum: ['pending', 'open', 'finished']
                    },
                    board_name: {
                        type: 'string',
                        description: 'Nome do quadro para filtrar (opcional)'
                    }
                },
                required: ['task_title', 'new_status']
            }
        }
    }
];

// ============================================
// FUNCTION HANDLERS
// ============================================

export async function handleTasksFunction(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    switch (functionName) {
        case 'tasks_get_today':
            return await tasksGetByDate(supabase, context, { date: 'hoje', ...args });
        case 'tasks_get_by_date':
            return await tasksGetByDate(supabase, context, args);
        case 'tasks_create':
            return await tasksCreate(supabase, context, args);
        case 'tasks_get_boards':
            return await tasksGetBoards(supabase, context);
        case 'tasks_update_status':
            return await tasksUpdateStatus(supabase, context, args);
        default:
            return { success: false, error: `Função desconhecida: ${functionName}` };
    }
}

// ============================================
// FUNCTION IMPLEMENTATIONS
// ============================================

async function tasksGetByDate(
    supabase: any,
    context: UserContext,
    args: { date: string; board_name?: string; assignee_name?: string; status?: string }
): Promise<FunctionResult> {

    const dateStr = resolveDate(args.date);
    const startOfDay = `${dateStr}T00:00:00`;
    const endOfDay = `${dateStr}T23:59:59`;

    let query = supabase
        .from('tasks')
        .select(`
            id, title, urgency, type, status, start_time, end_time, description,
            task_boards (name),
            contacts (push_name)
        `)
        .eq('user_id', context.owner_id)
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .order('start_time');

    // Filter by board if specified
    if (args.board_name) {
        const boardLookup = await lookupTaskBoard(supabase, args.board_name, context.owner_id);
        if (boardLookup.found && (boardLookup.single || boardLookup.exact_match)) {
            query = query.eq('board_id', boardLookup.items[0].id);
        }
    }

    // Filter by status if specified
    if (args.status) {
        query = query.eq('status', args.status);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao buscar tarefas: ${error.message}` };
    }

    if (!data || data.length === 0) {
        return {
            success: true,
            data: {
                found: false,
                count: 0,
                date: formatDateBR(dateStr),
                message: `Não há tarefas para ${formatDateBR(dateStr)}`
            }
        };
    }

    const urgencyLabels: Record<string, string> = { low: '🟢 Baixa', medium: '🟡 Média', high: '🔴 Alta' };
    const statusLabels: Record<string, string> = { pending: 'Pendente', open: 'Em andamento', finished: 'Concluída' };

    return {
        success: true,
        data: {
            found: true,
            count: data.length,
            date: formatDateBR(dateStr),
            tasks: data.map((t: any) => ({
                title: t.title,
                time: new Date(t.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                board: t.task_boards?.name || 'Sem quadro',
                urgency: urgencyLabels[t.urgency] || t.urgency,
                status: statusLabels[t.status] || t.status,
                type: t.type,
                contact: t.contacts?.push_name || null,
                description: t.description || null
            }))
        }
    };
}

async function tasksCreate(
    supabase: any,
    context: UserContext,
    args: {
        title: string;
        assignee_name?: string;
        board_name?: string;
        date: string;
        time: string;
        urgency?: string;
        type?: string;
        description?: string;
        contact_name?: string;
    }
): Promise<FunctionResult> {

    // Check permission
    if (!hasPermission(context.role, 'tasks:create')) {
        return { success: false, error: 'Você não tem permissão para criar tarefas' };
    }

    // Get boards to find or ask for one
    let boards = await getAllTaskBoards(supabase, context.owner_id);
    if (boards.length === 0) {
        return { success: false, error: 'Não há quadros de tarefas cadastrados. Crie um quadro primeiro.' };
    }

    // Agents can only create tasks on boards they are in allowed_agents
    if (context.role === 'agent' && context.team_member_id) {
        boards = boards.filter((b: any) =>
            !b.allowed_agents || b.allowed_agents.length === 0 ||
            b.allowed_agents.includes(context.team_member_id)
        );
        if (boards.length === 0) {
            return { success: false, error: 'Você não tem acesso a nenhum quadro de tarefas. Solicite ao administrador.' };
        }
    }

    // Find board
    let board = null;
    if (args.board_name) {
        const boardLookup = await lookupTaskBoard(supabase, args.board_name, context.owner_id);
        if (boardLookup.found && (boardLookup.single || boardLookup.exact_match)) {
            board = boardLookup.items[0];
        } else if (boardLookup.found) {
            return { success: true, data: { needs_info: true, message: boardLookup.message } };
        }
    }

    // If no board specified and there's only one, use it
    if (!board && boards.length === 1) {
        board = boards[0];
    }

    // If still no board, ask
    if (!board) {
        const boardNames = boards.map((b: any) => b.name).join(', ');
        return {
            success: true,
            missing_fields: [{
                field: 'board_name',
                required: true,
                prompt: `Em qual quadro devo criar a tarefa? Opções: ${boardNames}`
            }]
        };
    }

    // Build datetime
    const dateStr = resolveDate(args.date);
    const timeStr = resolveTime(args.time);
    const startTime = new Date(`${dateStr}T${timeStr}:00`);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min default

    // Handle defaults
    const defaults: { field: string; default_value: string; description: string }[] = [];

    const urgency = args.urgency || 'medium';
    const type = args.type || 'activity';

    if (!args.urgency) {
        defaults.push({ field: 'urgency', default_value: 'média', description: 'Urgência' });
    }
    if (!args.type) {
        defaults.push({ field: 'type', default_value: 'atividade', description: 'Tipo' });
    }

    const urgencyLabels: Record<string, string> = { low: 'Baixa 🟢', medium: 'Média 🟡', high: 'Alta 🔴' };
    const typeLabels: Record<string, string> = { activity: 'Atividade', schedule: 'Agendamento', reminder: 'Lembrete' };

    // Build confirmation
    const confirmationData = {
        title: args.title,
        board: board.name,
        date: formatDateBR(dateStr),
        time: timeStr,
        urgency: urgencyLabels[urgency] || urgency,
        type: typeLabels[type] || type,
        assignee: args.assignee_name || 'Não atribuído',
        defaults_used: defaults.length > 0 ? defaults.map(d => `${d.description}: ${d.default_value}`).join(', ') : null
    };

    let confirmMessage = `Confirma a criação da tarefa?\n\n📌 **Título**: ${confirmationData.title}\n📋 **Quadro**: ${confirmationData.board}\n📅 **Data**: ${confirmationData.date}\n🕐 **Horário**: ${confirmationData.time}\n🎯 **Urgência**: ${confirmationData.urgency}\n📎 **Tipo**: ${confirmationData.type}`;

    if (args.assignee_name) {
        confirmMessage += `\n👤 **Responsável**: ${confirmationData.assignee}`;
    }

    if (defaults.length > 0) {
        confirmMessage += `\n\n💡 *Usei valores padrão para: ${confirmationData.defaults_used}*`;
    }

    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: confirmMessage,
        data: {
            action: 'create_task',
            params: {
                user_id: context.owner_id,
                board_id: board.id,
                title: args.title,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                urgency: urgency,
                type: type,
                status: 'pending',
                description: args.description || null
            },
            summary: confirmationData
        }
    };
}

async function tasksGetBoards(
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {

    let boards = await getAllTaskBoards(supabase, context.owner_id);

    // Agents only see boards they have access to
    if (context.role === 'agent' && context.team_member_id) {
        boards = boards.filter((b: any) =>
            !b.allowed_agents || b.allowed_agents.length === 0 ||
            b.allowed_agents.includes(context.team_member_id)
        );
    }

    if (boards.length === 0) {
        return {
            success: true,
            data: {
                found: false,
                message: 'Você ainda não tem quadros de tarefas cadastrados'
            }
        };
    }

    return {
        success: true,
        data: {
            found: true,
            count: boards.length,
            boards: boards.map((b: any) => ({
                name: b.name,
                hours: `${b.start_hour}h às ${b.end_hour}h`
            }))
        }
    };
}

async function tasksUpdateStatus(
    supabase: any,
    context: UserContext,
    args: { task_title: string; new_status: string; board_name?: string }
): Promise<FunctionResult> {

    if (!hasPermission(context.role, 'tasks:update')) {
        return { success: false, error: 'Você não tem permissão para alterar tarefas' };
    }

    // Search task by title
    let query = supabase
        .from('tasks')
        .select('id, title, status, task_boards(name)')
        .eq('user_id', context.owner_id)
        .ilike('title', `%${args.task_title}%`)
        .neq('status', 'finished');

    // Agents can only update their own tasks
    if (context.role === 'agent' && context.team_member_id) {
        query = query.eq('assigned_to', context.team_member_id);
    }

    const { data, error } = await query.limit(5);

    if (error) return { success: false, error: `Erro ao buscar tarefa: ${error.message}` };
    if (!data || data.length === 0) {
        return { success: true, data: { found: false, message: `Nenhuma tarefa encontrada com o título "${args.task_title}"` } };
    }

    if (data.length > 1) {
        const list = data.map((t: any, i: number) => `${i + 1}. **${t.title}** (${t.task_boards?.name || 'sem quadro'})`).join('\n');
        return {
            success: true,
            data: {
                needs_info: true,
                message: `Encontrei ${data.length} tarefas. Qual delas você quer atualizar?\n\n${list}`
            }
        };
    }

    const task = data[0];
    const statusLabels: Record<string, string> = { pending: 'Pendente', open: 'Em Andamento', finished: 'Concluída' };

    return {
        success: true,
        needs_confirmation: true,
        confirmation_message: `Quer alterar o status da tarefa **"${task.title}"** de **${statusLabels[task.status] || task.status}** para **${statusLabels[args.new_status] || args.new_status}**?`,
        data: {
            action: 'update_task_status',
            params: {
                task_id: task.id,
                status: args.new_status
            },
            summary: {
                title: task.title,
                old_status: statusLabels[task.status] || task.status,
                new_status: statusLabels[args.new_status] || args.new_status
            }
        }
    };
}
