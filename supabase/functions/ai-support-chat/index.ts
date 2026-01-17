import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { makeOpenAIRequest } from "../_shared/token-tracker.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Manuais das páginas (compactos para economizar tokens)
const PAGE_MANUALS: Record<string, string> = {
    'tasks': `Tarefas: Agenda/calendário. Quadros = agendas personalizadas. Criar tarefa: botão "+ Nova Tarefa" ou clique no slot. Tipos: Atividade(verde), Agendamento(azul), Ausência(amarelo), Ocupado(laranja), Lembrete(roxo).`,
    'default': `Clinvia: Inbox(chat), Dashboard(métricas), CRM(funis), Tarefas(agenda), Agendamentos(calendário), Contatos, Financeiro, Vendas, Conexões(WhatsApp/Instagram), Configurações.`
};

const SYSTEM_PROMPT = `Você é a Bia, assistente de suporte da Clinvia. 25 anos, descontraída, informal mas profissional. Use emojis com moderação.

Diretrizes:
1. Descomplicar termos técnicos com analogias
2. Respostas curtas e objetivas
3. Passo a passo numerado para instruções
4. NÃO mencione a página atual, exceto para orientar navegação

Se não souber: "Hmm, não sei 😅 Fala com suporte@clinvia.ai"`;

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { message, pageSlug, pageName, userRole, conversationHistory } = body;

        console.log("[ai-support-chat] Request:", { pageSlug, userRole });

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

        // Manual compacto
        const manual = PAGE_MANUALS[pageSlug || 'default'] || PAGE_MANUALS['default'];

        // Contexto mínimo
        const context = `[Página: ${pageName || pageSlug}, Role: ${userRole || 'agent'}]\n${manual}`;

        // Montar mensagens - APENAS últimas 3 do histórico + mensagem atual
        const openaiMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT + "\n\n" + context }
        ];

        // Adicionar apenas últimas 3 mensagens do histórico
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
                max_tokens: 400,
                temperature: 0.7,
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
