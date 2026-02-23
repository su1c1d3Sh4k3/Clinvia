import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { makeOpenAIRequest, trackTokenUsage } from "../_shared/token-tracker.ts";
import { allTools, executeTool, executeConfirmedAction, UserContext, UserRole } from "../_shared/bia-tools/index.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fallback mínimo caso o Storage falhe
const FALLBACK_MANUAL = `
🏠 CLINBIA - Sistema de Atendimento

MENU PRINCIPAL:
- Dashboard 📊: métricas
- Inbox 💬: conversas WhatsApp/Instagram
- CRM 💼: funis de vendas

SUBMENU "AUTOMAÇÃO" 🔧:
- Definições da IA 🤖
- Conexões 📱
- Configurações ⚙️

SUBMENU "OPERAÇÕES" 📦:
- Produtos e Serviços 📦
- Contatos 📇
- Filas 📋
- Tags 🏷️
- Follow Up ⏰

SUBMENU "ADMINISTRATIVO" 📊:
- Agendamentos 📅
- Tarefas 📋
- Vendas 🛒
- Equipe 👥
`;

const SYSTEM_PROMPT = `Você é a **Bia**, assistente virtual de suporte da plataforma Clinbia. Você tem 25 anos, é descontraída, usa linguagem informal mas profissional. Use emojis com moderação pra dar aquele toque 😊

🧠 SOBRE VOCÊ:
- Você é simpática, paciente e adora ajudar
- Fala de forma natural, como uma amiga que manja muito do sistema
- Não é robótica — varia suas respostas e tem personalidade
- Você ENTENDE O CONTEXTO da conversa anterior
- Você tem acesso a FERRAMENTAS para consultar e manipular dados do sistema

🛠️ SUAS FERRAMENTAS:
Você pode executar ações reais no sistema! Exemplos:
- "Quais agendamentos de hoje?" → appointments_get_today
- "Agenda da Dra. Ana amanhã" → appointments_get_by_professional
- "Cria uma tarefa para..." → tasks_create
- "Quanto faturamos esse mês?" → sales_get_summary
- "Me mostra os deals parados" → crm_get_stagnated_deals
- "Meus tickets de suporte" → support_list_tickets
- "Google Calendar não está sincronizando" → diagnostics_check_connections

Quando usar ferramentas:
1. Execute a ferramenta apropriada
2. Apresente os resultados de forma amigável e humanizada
3. Se precisar de mais informações, pergunte de forma natural
4. Se a ferramenta retornar needs_confirmation, apresente os dados e peça confirmação

📚 VOCÊ TAMBÉM TEM ACESSO AO MANUAL:
Para dúvidas sobre como usar o sistema, consulte o manual fornecido no contexto.

🔍 FERRAMENTAS DE DIAGNÓSTICO:
Para PROBLEMAS TÉCNICOS, use diagnóstico ANTES de tentar ajudar:
- diagnostics_check_connections → Conexões WhatsApp/Instagram e Google Calendar
- diagnostics_check_conversations → Status das conversas
- diagnostics_check_team → Membros da equipe
- diagnostics_get_financial → Resumo financeiro (receitas e despesas)
- diagnostics_check_queues → Filas de atendimento
- diagnostics_check_ai_config → Configuração da IA

📅 AGENDAMENTO + GOOGLE CALENDAR:
- Para problemas de sincronização com Google Calendar → use diagnostics_check_connections primeiro
- Verifique se a conta está conectada antes de investigar outros problemas

💬 CHAT INTERNO:
- Dúvidas sobre o Chat Interno: consulte o manual e oriente o usuário
- Você NÃO envia mensagens internas — o Chat Interno é exclusivo para membros da equipe

🎫 REGRA DE ABERTURA DE TICKET:
Se depois de **3 tentativas** (incluindo diagnósticos e manual) você NÃO resolver:
1. Avise o usuário que vai escalar
2. Use support_create_ticket:
   - title: resumo curto
   - description: detalhes técnicos + resultados dos diagnósticos
   - client_summary: o que o usuário relatou
   - priority: urgent (sem acesso) | high (feature quebrada) | medium (tem workaround) | low (dúvida)
3. Informe o título do ticket criado e que pode acompanhar na página Suporte

⚠️ REGRAS IMPORTANTES:
1. **LEIA O HISTÓRICO** — não repita informações já dadas
2. **Use as ferramentas** — para consultas e ações, prefira as tools
3. **Seja natural** — apresente resultados de forma conversacional, não como lista robótica
4. **Peça confirmação** — antes de criar/editar qualquer dado
5. **Respeite permissões** — se a ferramenta negar, explique gentilmente
6. **NUNCA abra ticket sem 3 tentativas** — sempre tente resolver antes
7. **Diagnóstico primeiro** — para problemas técnicos, cheque o sistema antes de responder

💬 Se não souber: "Hmm, essa não sei te dizer com certeza 🤔 Vou criar um ticket para o suporte técnico verificar!"`;



// Mapeamento de slugs para nomes de arquivo
const SLUG_TO_FILE: Record<string, string> = {
    'inbox': 'inbox.md',
    'internal-inbox': 'internal-inbox.md',
    'dashboard': 'dashboard.md',
    'crm': 'crm.md',
    'tasks': 'tasks.md',
    'scheduling': 'scheduling.md',
    'sales': 'sales.md',
    'team': 'team.md',
    'ia-config': 'ia-config.md',
    'whatsapp-connection': 'whatsapp-connection.md',
    'connections': 'whatsapp-connection.md',
    'settings': 'settings.md',
    'products-services': 'products-services.md',
    'contacts': 'contacts.md',
    'queues': 'queues.md',
    'queues_manager': 'queues_manager.md',
    'tags': 'tags.md',
    'follow-up': 'follow-up.md',
    'financial': 'financial.md',
    'support': 'support.md',
    'default': 'default.md',
    'unknown': 'default.md',
};

// Detectar o tópico da mensagem com base em palavras-chave
function detectTopicFromMessage(message: string): string | null {
    const lowerMsg = message.toLowerCase();

    const keywords: [string, string[]][] = [
        ['scheduling', ['agendamento', 'agendar', 'horário', 'horario', 'ausência', 'ausencia', 'calendário de profissional', 'google calendar', 'gcal', 'sincronizar agenda', 'break time', 'intervalo do profissional']],
        ['products-services', ['produto', 'serviço', 'servico', 'catálogo', 'catalogo', 'estoque', 'preço', 'preco']],
        ['crm', ['crm', 'funil', 'deal', 'negociação', 'negociacao', 'kanban', 'etapa', 'pipeline']],
        ['tasks', ['tarefa', 'atividade', 'quadro de tarefa', 'nova tarefa']],
        ['contacts', ['contato', 'lead', 'telefone']],
        ['financial', ['financeiro', 'faturamento', 'faturou', 'receita', 'custo', 'despesa', 'lucro', 'balanço', 'caixa']],
        ['sales', ['venda', 'vendas', 'pagamento', 'parcelado']],
        ['team', ['membro da equipe', 'atendente', 'supervisor', 'comissão', 'comissao', 'membros']],
        ['ia-config', ['definições de ia', 'configurar ia', 'inteligência artificial', 'bot automático', 'automação da ia']],
        ['whatsapp-connection', ['whatsapp', 'conexão whatsapp', 'instância', 'instancia', 'qr code', 'pareamento', 'instagram connection']],
        ['settings', ['configuração geral', 'perfil', 'senha', 'notificação push', 'pwa']],
        ['queues_manager', ['gestão de fila', 'gestao de fila', 'board de fila', 'kanban de conversa', 'atendimentos na fila', 'arrastar conversa', 'mover conversa para fila']],
        ['queues', ['fila de atendimento', 'filas de atendimento', 'distribuição de conversa']],
        ['tags', ['tag', 'etiqueta', 'marcador']],
        ['follow-up', ['follow up', 'followup', 'follow-up', 'retomada', 'lembrete automático']],
        ['support', ['ticket', 'chamado', 'suporte técnico', 'meus tickets', 'abrir chamado']],
        ['internal-inbox', ['chat interno', 'mensagem interna', 'inbox interno', 'conversa interna', 'canal interno', 'grupo interno', 'equipe interna', 'dm interno', 'direct interno', 'inbox da equipe', 'mensagem para colega', 'mensagem para membro', 'comunicação interna']],
        ['inbox', ['inbox', 'conversa', 'chat', 'mensagem', 'atendimento', 'cliente']],
        ['dashboard', ['dashboard', 'métrica', 'gráfico', 'relatório', 'painel']],
    ];

    for (const [slug, words] of keywords) {
        for (const word of words) {
            if (lowerMsg.includes(word)) {
                return slug;
            }
        }
    }

    return null;
}

// Buscar manual do Storage via URL pública
async function getManualContent(pageSlug: string): Promise<string> {
    const fileName = SLUG_TO_FILE[pageSlug] || 'default.md';
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/manuals/${fileName}`;

    try {
        const response = await fetch(publicUrl);

        if (!response.ok) {
            if (fileName !== 'default.md') {
                const defaultUrl = `${SUPABASE_URL}/storage/v1/object/public/manuals/default.md`;
                const defaultResponse = await fetch(defaultUrl);

                if (defaultResponse.ok) {
                    const content = await defaultResponse.text();
                    return content;
                }
            }
            return FALLBACK_MANUAL;
        }

        const content = await response.text();

        if (!content || content.length < 50) {
            return FALLBACK_MANUAL;
        }

        // Limitar tamanho para economizar tokens
        if (content.length > 4000) {
            return content.substring(0, 4000) + "\n\n[... manual truncado ...]";
        }

        return content;
    } catch (err: any) {
        console.error(`[ai-support-chat] Exception ao buscar manual:`, err.message);
        return FALLBACK_MANUAL;
    }
}

// Process tool calls from OpenAI response
async function processToolCalls(
    toolCalls: any[],
    supabase: any,
    context: UserContext
): Promise<{ role: string; tool_call_id: string; content: string }[]> {
    const results: { role: string; tool_call_id: string; content: string }[] = [];

    for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');

        console.log(`[ai-support-chat] Tool call: ${functionName}`, args);

        const result = await executeTool(functionName, args, supabase, context);

        results.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
        });
    }

    return results;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const {
            message,
            pageSlug,
            pageName,
            userRole,
            conversationHistory,
            userId,        // auth.uid() do usuário
            ownerId,       // user_id da empresa (tenant)
            teamMemberId,  // ID do team_member
            confirmAction, // Se está confirmando uma ação
            actionData     // Dados da ação a ser confirmada
        } = body;

        console.log("[ai-support-chat] Request:", { pageSlug, userRole, userId: userId?.slice(0, 8) });

        if (!message) {
            return new Response(JSON.stringify({ error: "message é obrigatório" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        const supabaseAdmin = createClient(
            SUPABASE_URL ?? "",
            SUPABASE_SERVICE_ROLE_KEY ?? ""
        );

        // Build user context for tools - with server-side fallback
        let effectiveOwnerId = ownerId;
        let effectiveTeamMemberId = teamMemberId;

        // If owner_id is not provided, try to fetch from team_members
        if (!effectiveOwnerId && userId) {
            console.log("[ai-support-chat] ownerId not provided, fetching from team_members...");
            const { data: teamMember } = await supabaseAdmin
                .from('team_members')
                .select('id, user_id')
                .eq('auth_user_id', userId)
                .single();

            if (teamMember) {
                effectiveOwnerId = teamMember.user_id;
                effectiveTeamMemberId = teamMember.id;
                console.log("[ai-support-chat] Found team_member:", { ownerId: effectiveOwnerId?.slice(0, 8), teamMemberId: effectiveTeamMemberId?.slice(0, 8) });
            } else {
                // Fallback: user might be the owner themselves
                effectiveOwnerId = userId;
                console.log("[ai-support-chat] No team_member found, using userId as ownerId");
            }
        }

        console.log("[ai-support-chat] User context:", {
            userId: userId?.slice(0, 8),
            ownerId: effectiveOwnerId?.slice(0, 8),
            teamMemberId: effectiveTeamMemberId?.slice(0, 8),
            role: userRole
        });

        const userContext: UserContext = {
            auth_user_id: userId || '',
            owner_id: effectiveOwnerId || '',
            role: (userRole as UserRole) || 'agent',
            team_member_id: effectiveTeamMemberId || ''
        };

        // Handle confirmation of pending action
        if (confirmAction && actionData) {
            const confirmResult = await executeConfirmedAction(
                actionData.action,
                actionData.params,
                supabaseAdmin
            );

            return new Response(JSON.stringify({
                response: confirmResult.success
                    ? confirmResult.data?.message || 'Ação realizada com sucesso! ✅'
                    : `Ops, algo deu errado: ${confirmResult.error}`,
                usage: { total_tokens: 0 }
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Detectar o tópico da pergunta para buscar o manual correto
        const topicSlug = detectTopicFromMessage(message) || pageSlug || 'default';

        // Buscar manual completo do Storage
        const manualContent = await getManualContent(topicSlug);

        // Contexto com página atual e manual
        const context = `
═══════════════════════════════════════════════════════════════
📍 CONTEXTO
═══════════════════════════════════════════════════════════════
Página atual: ${pageName || pageSlug || 'Desconhecida'}
Cargo do usuário: ${userRole || 'agent'}

═══════════════════════════════════════════════════════════════
📚 MANUAL DO SISTEMA
═══════════════════════════════════════════════════════════════
${manualContent}
═══════════════════════════════════════════════════════════════
`;

        // Montar mensagens
        const openaiMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT + "\n\n" + context }
        ];

        // Adicionar histórico
        if (conversationHistory && Array.isArray(conversationHistory)) {
            for (const msg of conversationHistory.slice(-10)) {
                if (msg.role && msg.content) {
                    openaiMessages.push({ role: msg.role, content: msg.content });
                }
            }
        }

        // Mensagem atual
        openaiMessages.push({ role: "user", content: message });

        console.log("[ai-support-chat] Messages:", openaiMessages.length, "Tools:", allTools.length);

        // Primeira chamada à OpenAI (com tools)
        const { response, usedCustomToken } = await makeOpenAIRequest(supabaseAdmin, effectiveOwnerId, {
            endpoint: "https://api.openai.com/v1/chat/completions",
            body: {
                model: "gpt-4.1",
                messages: openaiMessages,
                tools: allTools,
                tool_choice: "auto",
                max_tokens: 800,
                temperature: 0.7,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[ai-support-chat] OpenAI error:", response.status, errorText);
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        let data = await response.json();
        let aiMessage = data.choices?.[0]?.message;
        let totalTokens = data.usage?.total_tokens || 0;

        // Process tool calls if any (up to 3 iterations)
        let iterations = 0;
        const maxIterations = 3;

        while (aiMessage?.tool_calls && iterations < maxIterations) {
            iterations++;
            console.log(`[ai-support-chat] Processing ${aiMessage.tool_calls.length} tool calls (iteration ${iterations})`);

            // Execute tools
            const toolResults = await processToolCalls(aiMessage.tool_calls, supabaseAdmin, userContext);

            // Add assistant message with tool calls
            openaiMessages.push(aiMessage);

            // Add tool results
            for (const result of toolResults) {
                openaiMessages.push(result);
            }

            // Call OpenAI again with tool results
            const { response: followUpResponse } = await makeOpenAIRequest(supabaseAdmin, effectiveOwnerId, {
                endpoint: "https://api.openai.com/v1/chat/completions",
                body: {
                    model: "gpt-4.1",
                    messages: openaiMessages,
                    tools: allTools,
                    tool_choice: "auto",
                    max_tokens: 800,
                    temperature: 0.7,
                },
            });

            if (!followUpResponse.ok) {
                break;
            }

            data = await followUpResponse.json();
            aiMessage = data.choices?.[0]?.message;
            totalTokens += data.usage?.total_tokens || 0;
        }

        const aiResponse = aiMessage?.content || "Desculpa, não consegui processar 😅";

        console.log("[ai-support-chat] Tokens:", totalTokens, "Iterations:", iterations);

        // Track token usage
        if (totalTokens > 0 && effectiveOwnerId) {
            trackTokenUsage(supabaseAdmin, {
                ownerId: effectiveOwnerId,
                teamMemberId: effectiveTeamMemberId || null,
                functionName: 'ai-support-chat',
                model: 'gpt-4.1',
                usage: {
                    prompt_tokens: Math.round(totalTokens * 0.7),
                    completion_tokens: Math.round(totalTokens * 0.3),
                    total_tokens: totalTokens
                }
            }).catch(err => console.error('[ai-support-chat] Token tracking error:', err));
        }

        return new Response(JSON.stringify({
            response: aiResponse,
            usage: { total_tokens: totalTokens },
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("[ai-support-chat] Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
