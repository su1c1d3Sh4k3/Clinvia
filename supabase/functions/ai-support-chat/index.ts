import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { makeOpenAIRequest } from "../_shared/token-tracker.ts";

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

const SYSTEM_PROMPT = `Você é a Bia, assistente de suporte da Clinbia. 25 anos, descontraída, informal mas profissional. Use emojis com moderação.

REGRAS OBRIGATÓRIAS:
1. SEMPRE use as informações do MANUAL fornecido para responder
2. SEMPRE indique o caminho completo de navegação: "Menu lateral > Submenu > Página"
3. Se a informação estiver no manual, use ela - NÃO invente
4. Respostas curtas e objetivas com passo a passo numerado
5. Descomplicar termos técnicos

FORMATO DE RESPOSTA:
"Para [ação], faça assim:
1. No menu lateral, clique em **[Submenu]** [emoji]
2. Depois clique em **[Página]**
3. [próximo passo]
..."

Se a informação NÃO estiver no manual: "Hmm, não encontrei essa info 😅 Fala com suporte@clinvia.ai"`;

// Mapeamento de slugs para nomes de arquivo
const SLUG_TO_FILE: Record<string, string> = {
    'inbox': 'inbox.md',
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
    'tags': 'tags.md',
    'follow-up': 'follow-up.md',
    'financial': 'sales.md', // Fallback para sales
    'default': 'default.md',
    'unknown': 'default.md',
};

// Buscar manual do Storage via URL pública
async function getManualContent(pageSlug: string): Promise<string> {
    const fileName = SLUG_TO_FILE[pageSlug] || 'default.md';
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    // URL pública do Storage
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/manuals/${fileName}`;

    console.log(`[ai-support-chat] Buscando manual: ${publicUrl}`);

    try {
        const response = await fetch(publicUrl);

        if (!response.ok) {
            console.error(`[ai-support-chat] Erro ao buscar ${fileName}: ${response.status}`);

            // Tenta o default
            if (fileName !== 'default.md') {
                const defaultUrl = `${SUPABASE_URL}/storage/v1/object/public/manuals/default.md`;
                const defaultResponse = await fetch(defaultUrl);

                if (defaultResponse.ok) {
                    const content = await defaultResponse.text();
                    console.log(`[ai-support-chat] Usando default.md: ${content.length} chars`);
                    return content;
                }
            }
            return FALLBACK_MANUAL;
        }

        const content = await response.text();

        if (!content || content.length < 50) {
            console.log(`[ai-support-chat] Arquivo ${fileName} vazio ou muito pequeno, usando fallback`);
            return FALLBACK_MANUAL;
        }

        console.log(`[ai-support-chat] Manual ${fileName} carregado: ${content.length} chars`);

        // Limitar tamanho para economizar tokens (máx 6000 caracteres)
        if (content.length > 6000) {
            console.log(`[ai-support-chat] Manual truncado de ${content.length} para 6000 chars`);
            return content.substring(0, 6000) + "\n\n[... manual truncado ...]";
        }

        return content;
    } catch (err: any) {
        console.error(`[ai-support-chat] Exception ao buscar manual:`, err.message);
        return FALLBACK_MANUAL;
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { message, pageSlug, pageName, userRole, conversationHistory } = body;

        console.log("[ai-support-chat] Request:", { pageSlug, pageName, userRole });

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

        // Buscar manual completo do Storage via URL pública
        const manualContent = await getManualContent(pageSlug || 'default');

        console.log(`[ai-support-chat] Manual carregado: ${manualContent.length} chars`);

        // Contexto com página atual e manual
        const context = `
═══════════════════════════════════════════════════════════════
📍 CONTEXTO ATUAL
═══════════════════════════════════════════════════════════════
Página: ${pageName || pageSlug || 'Desconhecida'}
Cargo do usuário: ${userRole || 'agent'}

═══════════════════════════════════════════════════════════════
📚 MANUAL DA PÁGINA (USE ESTAS INFORMAÇÕES PARA RESPONDER)
═══════════════════════════════════════════════════════════════
${manualContent}
═══════════════════════════════════════════════════════════════
`;

        // Montar mensagens
        const openaiMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT + "\n\n" + context }
        ];

        // Adicionar últimas 3 mensagens do histórico
        if (conversationHistory && Array.isArray(conversationHistory)) {
            for (const msg of conversationHistory.slice(-3)) {
                if (msg.role && msg.content) {
                    openaiMessages.push({ role: msg.role, content: msg.content });
                }
            }
        }

        // Mensagem atual
        openaiMessages.push({ role: "user", content: message });

        console.log("[ai-support-chat] Messages:", openaiMessages.length);

        // Chamar OpenAI
        const { response, usedCustomToken } = await makeOpenAIRequest(supabaseAdmin, null, {
            endpoint: "https://api.openai.com/v1/chat/completions",
            body: {
                model: "gpt-4.1",
                messages: openaiMessages,
                max_tokens: 600,
                temperature: 0.5, // Mais determinístico para seguir o manual
            },
        });

        console.log(`[ai-support-chat] Token: ${usedCustomToken ? 'custom' : 'default'}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[ai-support-chat] OpenAI error:", response.status, errorText);
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.choices?.[0]?.message?.content || "Desculpa, não consegui processar 😅";

        console.log("[ai-support-chat] Tokens:", data.usage?.total_tokens);

        return new Response(JSON.stringify({
            response: aiResponse,
            usage: data.usage,
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
