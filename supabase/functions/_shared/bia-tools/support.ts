// Support ticket functions for Bia AI
// Auto-create support tickets when Bia can't resolve issues

import { UserContext, FunctionResult, ToolFunction } from './types.ts';
import { reportIncident } from '../report-incident.ts';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const supportTools: ToolFunction[] = [
    {
        type: 'function',
        function: {
            name: 'support_create_ticket',
            description: 'Cria um ticket de suporte técnico. Use APENAS quando após 3 tentativas de ajudar o usuário você não conseguiu resolver o problema. Nunca crie ticket sem antes tentar ajudar.',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Título curto e descritivo do problema (ex: "Mensagens não chegam pelo WhatsApp")'
                    },
                    description: {
                        type: 'string',
                        description: 'Descrição técnica detalhada do problema, incluindo o que foi tentado e resultados de diagnóstico'
                    },
                    client_summary: {
                        type: 'string',
                        description: 'Resumo do relato do cliente sobre o problema, na perspectiva dele'
                    },
                    priority: {
                        type: 'string',
                        description: 'Nível de prioridade. Use "urgent" APENAS se o problema impede o acesso ao sistema',
                        enum: ['low', 'medium', 'high', 'urgent']
                    }
                },
                required: ['title', 'description', 'client_summary', 'priority']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'support_list_tickets',
            description: 'Lista os tickets de suporte do usuário. Use quando o usuário perguntar sobre seus chamados ou tickets abertos.',
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        description: 'Filtrar por status',
                        enum: ['open', 'viewed', 'in_progress', 'resolved']
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

export async function handleSupportFunction(
    functionName: string,
    args: Record<string, any>,
    supabase: any,
    context: UserContext
): Promise<FunctionResult> {
    switch (functionName) {
        case 'support_create_ticket':
            return await supportCreateTicket(supabase, context, args);
        case 'support_list_tickets':
            return await supportListTickets(supabase, context, args);
        default:
            return { success: false, error: `Função desconhecida: ${functionName}` };
    }
}

// ============================================
// IMPLEMENTATIONS
// ============================================

async function supportCreateTicket(
    supabase: any,
    context: UserContext,
    args: { title: string; description: string; client_summary: string; priority: string }
): Promise<FunctionResult> {

    // Fetch creator name
    //
    // O `try/catch` daqui era código morto (supabase-js devolve `{data, error}`,
    // não lança) e o `error` ia para o lixo. `.single()` sem linha responde
    // PGRST116 — normal para o dono, que pode não ter linha em `team_members` —
    // então a leitura passa a `.maybeSingle()`, e o que sobra de erro não é
    // normal: o chamado nasceria com "Usuário" no lugar de quem abriu.
    let creatorName = 'Usuário';
    const { data: tm, error: tmError } = await supabase
        .from('team_members')
        .select('full_name, name')
        .eq('auth_user_id', context.auth_user_id)
        .maybeSingle();

    if (tmError) {
        console.error('[bia-tools/support] falha ao ler team_members:', tmError);
        reportIncident({
            route: 'support_create_ticket:team_members',
            error: tmError,
            ownerId: context.owner_id,
        });
    }
    if (tm) {
        creatorName = tm.full_name || tm.name || 'Usuário';
    }

    const { data, error } = await supabase
        .from('support_tickets')
        .insert({
            user_id: context.owner_id,
            auth_user_id: context.auth_user_id,
            creator_name: creatorName,
            title: args.title,
            description: args.description,
            client_summary: args.client_summary,
            priority: args.priority,
            status: 'open'
        })
        .select('id, title, priority, created_at')
        .single();

    if (error) {
        console.error('[support] Error creating ticket:', error);
        return { success: false, error: `Erro ao criar ticket: ${error.message}` };
    }

    const priorityLabels: Record<string, string> = {
        low: '🟢 Baixa',
        medium: '🟡 Média',
        high: '🟠 Alta',
        urgent: '🔴 Urgente'
    };

    return {
        success: true,
        data: {
            message: `Ticket de suporte criado com sucesso! 🎫`,
            ticket: {
                id: data.id,
                title: data.title,
                priority: priorityLabels[args.priority] || args.priority,
                created_at: data.created_at
            },
            next_steps: 'Nossa equipe vai analisar e responder o mais rápido possível. Você pode acompanhar o status na página de Suporte.'
        }
    };
}

async function supportListTickets(
    supabase: any,
    context: UserContext,
    args: { status?: string }
): Promise<FunctionResult> {

    let query = supabase
        .from('support_tickets')
        .select('id, title, priority, status, support_response, created_at')
        .eq('user_id', context.owner_id)
        .order('created_at', { ascending: false })
        .limit(10);

    if (args.status) {
        query = query.eq('status', args.status);
    }

    const { data, error } = await query;

    if (error) {
        return { success: false, error: `Erro ao buscar tickets: ${error.message}` };
    }

    if (!data || data.length === 0) {
        return {
            success: true,
            data: {
                found: false,
                message: 'Nenhum ticket de suporte encontrado'
            }
        };
    }

    const priorityLabels: Record<string, string> = {
        low: '🟢 Baixa', medium: '🟡 Média', high: '🟠 Alta', urgent: '🔴 Urgente'
    };
    const statusLabels: Record<string, string> = {
        open: '📬 Aberto', viewed: '👁️ Visto', in_progress: '🔧 Em Atendimento', resolved: '✅ Concluído'
    };

    return {
        success: true,
        data: {
            found: true,
            count: data.length,
            tickets: data.map((t: any) => ({
                title: t.title,
                priority: priorityLabels[t.priority] || t.priority,
                status: statusLabels[t.status] || t.status,
                has_response: !!t.support_response,
                response_preview: t.support_response ? t.support_response.substring(0, 100) + '...' : null,
                created_at: t.created_at
            }))
        }
    };
}
