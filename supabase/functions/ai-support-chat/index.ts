import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { makeOpenAIRequest } from "../_shared/token-tracker.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Manuais das páginas com caminhos de navegação corretos
const PAGE_MANUALS: Record<string, string> = {
    'inbox': `📬 INBOX: Menu lateral > "Inbox" 💬
    - Lista de conversas: filtros por fila, tag, instância
    - Abas: Abertos, Pendentes, Resolvidos
    - Enviar mensagens: texto, emoji, áudio, anexos
    - Mensagens rápidas: digite / + atalho
    - Painel direito: CRM, Vendas, Agendamento, Follow Up`,

    'tasks': `📋 TAREFAS: Menu lateral > Administrativo 📊 > Tarefas 📋
    - Quadros = agendas personalizadas com horários
    - Criar tarefa: "+ Nova Tarefa" ou clique no slot vazio
    - Tipos: Atividade(verde), Agendamento(azul), Ausência(amarelo)
    - Arrastar para mover horário`,

    'crm': `📊 CRM: Menu lateral > "CRM" 💼
    - Funis de vendas no formato Kanban
    - Arrastar cards entre etapas
    - Ao mover para "Ganho": registra venda
    - Ao mover para "Perdido": pede motivo`,

    'scheduling': `📅 AGENDAMENTOS: Menu lateral > Administrativo 📊 > Agendamentos 📅
    - Calendário de profissionais
    - Criar: botão "+ Novo Agendamento"
    - Tipos: Agendamento ou Ausência
    - Ver disponibilidade por profissional`,

    'sales': `💰 VENDAS: Menu lateral > Administrativo 📊 > Vendas 🛒
    - Registrar vendas de produtos/serviços
    - Pagamento à vista ou parcelado
    - Relatórios mensais`,

    'team': `👥 EQUIPE: Menu lateral > Administrativo 📊 > Equipe 👥
    - Membros: gerenciar atendentes e supervisores
    - Profissionais: cadastrar para agenda
    - Comissões e permissões`,

    'ia-config': `🤖 DEFINIÇÕES DE IA: Menu lateral > Automação 🔧 > Definições da IA 🤖
    - Aba Empresa: dados que a IA usa
    - Aba Restrições: o que IA NÃO pode fazer
    - Aba Qualificação: fluxos por produto
    - Aba Config: ligar/desligar IA por instância`,

    'whatsapp-connection': `📱 CONEXÕES: Menu lateral > Automação 🔧 > Conexões 📱
    - Criar instância: nome + criar
    - Conectar: gerar código + digitar no WhatsApp
    - Definir fila padrão por instância`,

    'settings': `⚙️ CONFIGURAÇÕES: Menu lateral > Automação 🔧 > Configurações ⚙️
    - Perfil: foto, nome, dados pessoais
    - Empresa: nome da organização
    - Segurança: email e senha
    - Sistema: notificações, instalar app`,

    'products-services': `📦 PRODUTOS E SERVIÇOS: Menu lateral > Operações 📦 > Produtos e Serviços 📦
    - Aba Produtos: itens físicos com estoque
    - Aba Serviços: prestações com duração
    - Criar: botão "Novo Item"
    - Importar: botão "Importar" (arquivo CSV)`,

    'contacts': `📇 CONTATOS: Menu lateral > Operações 📦 > Contatos 📇
    - Lista de todos os contatos
    - Filtrar por canal: WhatsApp/Instagram
    - Switch IA: liga/desliga IA por contato
    - Atribuir tags em massa`,

    'queues': `📋 FILAS: Menu lateral > Operações 📦 > Filas 📋
    - Criar filas de atendimento
    - Atribuir usuários às filas
    - Vincular nas instâncias WhatsApp`,

    'tags': `🏷️ TAGS: Menu lateral > Operações 📦 > Tags 🏷️
    - Criar etiquetas coloridas
    - Usar para categorizar contatos
    - Tag "IA" é do sistema`,

    'follow-up': `⏰ FOLLOW UP: Menu lateral > Operações 📦 > Follow Up ⏰
    - Mensagens automáticas por tempo
    - Criar categorias e templates
    - Tempo em minutos após última msg do cliente`,

    'dashboard': `📊 DASHBOARD: Menu lateral > Dashboard 📊
    - Métricas de atendimento
    - Gráficos de vendas
    - Alertas de oportunidades`,

    'default': `🏠 CLINVIA - Sistema de Atendimento

MENU PRINCIPAL (itens soltos):
- Dashboard 📊: métricas e gráficos
- Inbox 💬: conversas WhatsApp/Instagram
- CRM 💼: funis de vendas

SUBMENU "AUTOMAÇÃO" 🔧:
- Definições da IA 🤖
- Conexões 📱 (WhatsApp)
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
- Equipe 👥`
};

const SYSTEM_PROMPT = `Você é a Bia, assistente de suporte da Clinvia. 25 anos, descontraída, informal mas profissional. Use emojis com moderação.

REGRAS IMPORTANTES:
1. SEMPRE indique o caminho completo de navegação quando explicar funcionalidades
2. Formato: "Menu lateral > Submenu > Página"
3. Descomplicar termos técnicos com analogias
4. Respostas curtas e objetivas
5. Passo a passo numerado para instruções

Exemplo de resposta:
"Para adicionar um produto:
1. No menu lateral, clique em **Operações** 📦
2. Depois clique em **Produtos e Serviços**
3. Clique no botão **Novo Item**
4. Preencha nome, preço, etc
5. Salva!"

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
