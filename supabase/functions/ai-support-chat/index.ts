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

const SYSTEM_PROMPT = `Você é a **Bia**, assistente virtual de suporte da plataforma Clinbia. Você tem 25 anos, é descontraída, usa linguagem informal mas profissional. Use emojis com moderação pra dar aquele toque 😊

🧠 SOBRE VOCÊ:
- Você é simpática, paciente e adora ajudar
- Fala de forma natural, como uma amiga que manja muito do sistema
- Não é robótica - varia suas respostas e tem personalidade
- Você ENTENDE O CONTEXTO da conversa anterior

📚 VOCÊ TEM ACESSO AO MANUAL:
O conteúdo do manual será fornecido abaixo. Use essas informações pra responder, mas de forma NATURAL.

⚠️ REGRAS IMPORTANTES:
1. **LEIA O HISTÓRICO DA CONVERSA** - Se você já explicou algo antes, NÃO repita! Responda direto a pergunta nova.
2. **Seja contextual** - Se o usuário já sabe onde fica a página (você explicou antes), foque na dúvida específica dele
3. **Varie seus formatos** - Nem sempre precisa ser passo a passo numerado! Às vezes uma explicação natural é melhor
4. **Personalidade** - Responda como gente, não como manual. Use "você", "a gente", expressões naturais
5. **Seja concisa** - Não enrole, vá direto ao ponto

🎯 EXEMPLOS DE BOM COMPORTAMENTO:

❌ RUIM (repetitivo e robótico):
"Para saber sobre o botão, segue o passo a passo:
1. No menu lateral, clique em **Administrativo**
2. Clique em **Agendamentos**
3. O botão está lá..."

✅ BOM (contextual e humano):
"Ah, esse botão! 🎯 Quando você marca ele, todo agendamento concluído já lança automaticamente uma receita no financeiro. Bem prático né? Assim você não precisa fazer manualmente"

❌ RUIM (sempre mesmo formato):
"Para criar um produto, segue o passo a passo..."

✅ BOM (natural):
"Pra criar um produto é bem simples: vai em Operações > Produtos e Serviços, clica em 'Novo Item' e preenche as infos. Se precisar de ajuda com algum campo específico, me fala! 😉"

🚫 O QUE EVITAR:
- Repetir caminho de navegação se já explicou antes na conversa
- Começar toda resposta com "Para [X], segue o passo a passo"
- Ignorar o que foi conversado antes
- Ser formal demais ou parecer um robô

💬 Se não souber algo: "Hmm, essa não sei te dizer com certeza 🤔 Melhor falar com suporte@clinvia.ai que eles te ajudam!"`;


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

// Detectar o tópico da mensagem com base em palavras-chave
function detectTopicFromMessage(message: string): string | null {
    const lowerMsg = message.toLowerCase();

    // Mapeamento de palavras-chave para slugs - ARRAY para manter ordem (mais específicos primeiro)
    const keywords: [string, string[]][] = [
        // Scheduling PRIMEIRO antes de tasks (agendamentos são mais específicos)
        ['scheduling', ['agendamento', 'agendar', 'horário', 'horario', 'ausência', 'ausencia', 'calendário de profissional']],
        // Produtos e Serviços
        ['products-services', ['produto', 'serviço', 'servico', 'catálogo', 'catalogo', 'estoque', 'preço', 'preco']],
        // CRM
        ['crm', ['crm', 'funil', 'deal', 'negociação', 'negociacao', 'kanban', 'etapa', 'pipeline']],
        // Tarefas (removido 'agenda' para não confundir)
        ['tasks', ['tarefa', 'atividade', 'quadro de tarefa', 'nova tarefa']],
        // Contatos
        ['contacts', ['contato', 'lead', 'cliente', 'telefone']],
        // Vendas
        ['sales', ['venda', 'vendas', 'pagamento', 'parcelado']],
        // Equipe
        ['team', ['equipe', 'membro', 'atendente', 'supervisor', 'comissão', 'comissao']],
        // IA Config
        ['ia-config', ['definições de ia', 'configurar ia', 'inteligência artificial', 'bot automático']],
        // WhatsApp
        ['whatsapp-connection', ['whatsapp', 'conexão whatsapp', 'instância', 'instancia', 'qr code', 'pareamento']],
        // Configurações
        ['settings', ['configuração geral', 'perfil', 'senha', 'notificação push', 'pwa']],
        // Filas
        ['queues', ['fila', 'filas de atendimento', 'distribuição']],
        // Tags
        ['tags', ['tag', 'etiqueta', 'marcador']],
        // Follow Up
        ['follow-up', ['follow up', 'followup', 'follow-up', 'retomada', 'lembrete automático']],
        // Inbox
        ['inbox', ['inbox', 'conversa', 'chat', 'mensagem']],
        // Dashboard
        ['dashboard', ['dashboard', 'métrica', 'gráfico', 'relatório']],
    ];

    for (const [slug, words] of keywords) {
        for (const word of words) {
            if (lowerMsg.includes(word)) {
                console.log(`[ai-support-chat] Detectou "${word}" -> ${slug}`);
                return slug;
            }
        }
    }

    return null; // Não detectou tópico específico
}

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

        // Detectar o tópico da pergunta para buscar o manual correto
        const topicSlug = detectTopicFromMessage(message) || pageSlug || 'default';

        // Buscar manual completo do Storage via URL pública
        const manualContent = await getManualContent(topicSlug);

        console.log(`[ai-support-chat] Tópico detectado: ${topicSlug}, Manual carregado: ${manualContent.length} chars`);

        // Contexto com página atual e manual
        const context = `
═══════════════════════════════════════════════════════════════
📍 CONTEXTO
═══════════════════════════════════════════════════════════════
Página atual: ${pageName || pageSlug || 'Desconhecida'}
Tópico da pergunta: ${topicSlug}
Cargo do usuário: ${userRole || 'agent'}

═══════════════════════════════════════════════════════════════
📚 MANUAL DO SISTEMA - USE ESTAS INFORMAÇÕES PARA RESPONDER!
═══════════════════════════════════════════════════════════════
${manualContent}
═══════════════════════════════════════════════════════════════
`;

        // Montar mensagens
        const openaiMessages: any[] = [
            { role: "system", content: SYSTEM_PROMPT + "\n\n" + context }
        ];

        // Adicionar últimas 6 mensagens do histórico para melhor contexto
        if (conversationHistory && Array.isArray(conversationHistory)) {
            for (const msg of conversationHistory.slice(-6)) {
                if (msg.role && msg.content) {
                    openaiMessages.push({ role: msg.role, content: msg.content });
                }
            }
        }

        // Mensagem atual
        openaiMessages.push({ role: "user", content: message });

        console.log("[ai-support-chat] Messages:", openaiMessages.length, "com histórico");

        // Chamar OpenAI
        const { response, usedCustomToken } = await makeOpenAIRequest(supabaseAdmin, null, {
            endpoint: "https://api.openai.com/v1/chat/completions",
            body: {
                model: "gpt-4.1",
                messages: openaiMessages,
                max_tokens: 500,
                temperature: 0.7, // Mais criativo para respostas naturais
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
