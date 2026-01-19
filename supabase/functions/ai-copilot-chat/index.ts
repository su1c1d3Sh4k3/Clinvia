import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { trackTokenUsage, getOwnerFromConversation, makeOpenAIRequest } from "../_shared/token-tracker.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationId, userId } = await req.json();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Create Supabase admin client for tracking
    const supabaseAdmin = createClient(
      SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY ?? ""
    );

    let context = "";
    let systemPrompt = "";
    let ownerId: string | null = null;
    let teamMemberId: string | null = null;

    // Fetch Copilot Settings if userId is provided
    if (userId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const settingsUrl = `${SUPABASE_URL}/rest/v1/copilot?user_id=eq.${userId}&select=*`;
        const settingsResponse = await fetch(settingsUrl, {
          headers: {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });

        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData && settingsData.length > 0) {
            const settings = settingsData[0];
            systemPrompt = `Você é um assistente virtual que auxilia atendimento, sua personalidade é de ${settings.personality || "Profissional"}. Haja como tal. Você tem um senso de humor ${settings.humor_level || "Médio"} e atua numa empresa com as seguintes caracteristicas:
            Sobre a empresa: ${settings.about_company || "Não informado"}
            Nossos produtos: ${settings.products || "Não informado"}
            Nossos clientes: ${settings.customer_profile || "Não informado"}
            
            Sua Missão:
            Ajudar o agente a resolver o problema do cliente da forma mais rápida e eficiente possível.`;
          }
        }

        // Get owner_id from team_members table
        const ownerUrl = `${SUPABASE_URL}/rest/v1/team_members?auth_user_id=eq.${userId}&select=id,user_id`;
        const ownerResponse = await fetch(ownerUrl, {
          headers: {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          }
        });

        if (ownerResponse.ok) {
          const ownerData = await ownerResponse.json();
          if (ownerData && ownerData.length > 0) {
            ownerId = ownerData[0].user_id;
            teamMemberId = ownerData[0].id;
          }
        }
      } catch (err) {
        console.error("Error fetching copilot settings:", err);
      }
    }

    // Fallback: try to get owner from conversation
    if (!ownerId && conversationId) {
      ownerId = await getOwnerFromConversation(supabaseAdmin, conversationId);
    }

    // Default prompt if no settings found or fetch failed
    if (!systemPrompt) {
      systemPrompt = `Você é um colega de trabalho experiente, direto e perspicaz (Copilot).
            
      Sua Missão:
      Ajudar o agente a resolver o problema do cliente da forma mais rápida e eficiente possível.`;
    }

    // Fetch Conversation History
    if (conversationId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const messagesUrl = `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${conversationId}&select=direction,body,created_at&order=created_at.asc`;

      const messagesResponse = await fetch(messagesUrl, {
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      if (messagesResponse.ok) {
        const messages = await messagesResponse.json();
        const conversationHistory = messages.map((m: any) =>
          `[${new Date(m.created_at).toLocaleString()}] ${m.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${m.body}`
        ).join('\n');

        if (conversationHistory) {
          context = `\n\nContexto da conversa atual:\n${conversationHistory}`;
        }
      }
    }

    // Call OpenAI API with GPT-4.1 (with custom token support)
    const { response, usedCustomToken } = await makeOpenAIRequest(supabaseAdmin, ownerId, {
      endpoint: "https://api.openai.com/v1/chat/completions",
      body: {
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `${systemPrompt}

            Diretrizes de Comportamento:
            1. **Analise Antes de Responder**: Leia o histórico da conversa. Se você não tiver informações suficientes para dar uma solução certeira, **FAÇA PERGUNTAS** ao agente para entender melhor o cenário.
               - Exemplo: "O cliente mencionou qual erro aparece na tela?" ou "Você já tentou reiniciar o serviço?"
            2. **Seja Extremamente Conciso**: Evite textos longos. Use frases curtas. Vá direto ao ponto.
            3. **Foco na Ação**: Suas respostas devem ser orientadas para a resolução. Diga o que fazer, não apenas o que é o problema.
            4. **Tom de Voz**: Profissional, mas leve e parceiro. Use emojis com moderação.
            
            ═══════════════════════════════════════════════════════════════
            📚 GUIA DE MANUAIS DO SISTEMA
            ═══════════════════════════════════════════════════════════════
            
            Para dúvidas sobre funcionalidades do sistema, consulte os manuais abaixo.
            IMPORTANTE: Sempre indique como acessar a página quando explicar uma funcionalidade!
            
            📬 **INBOX / CONVERSAS** (inbox.md)
            📍 ACESSO: Menu lateral > "Inbox" (ícone de mensagem 💬)
            - Lista de conversas, filtros, status (abertos/pendentes/resolvidos)
            - Área de chat, enviar mensagens, anexos, áudios
            - Menu de ações (responder/editar/apagar/reagir)
            - Botão IA no chat (gerar/corrigir/melhorar)
            - Mensagens rápidas (comando /atalho)
            - Painel lateral: CRM, Vendas, Agendamento, Follow Up, Copilot
            
            📋 **TAREFAS** (tasks.md)
            📍 ACESSO: Menu lateral > Submenu "Administrativo" 📊 > "Tarefas" 📋
            - Criar, editar, excluir tarefas
            - Status, prioridades, responsáveis
            - Quadros de tarefas personalizados
            
            📊 **CRM** (crm.md)
            📍 ACESSO: Menu lateral > "CRM" (ícone de maleta 💼)
            - Pipeline de vendas, Kanban
            - Leads, Deals, Negócios
            - Movimentação entre etapas
            
            🤖 **DEFINIÇÕES DE IA** (ia-config.md)
            📍 ACESSO: Menu lateral > Submenu "Automação" 🔧 > "Definições da IA" 🤖
            - Configurar comportamento da IA
            - Empresa, Restrições, Qualificação, FAQ
            - Ativar/desativar IA por instância
            
            📱 **CONEXÕES WHATSAPP** (whatsapp-connection.md)
            📍 ACESSO: Menu lateral > Submenu "Automação" 🔧 > "Conexões" 📱
            - Conectar/desconectar instâncias WhatsApp
            - Gerar código de pareamento
            - Configurar fila padrão
            
            ⚙️ **CONFIGURAÇÕES** (settings.md)
            📍 ACESSO: Menu lateral > Submenu "Automação" 🔧 > "Configurações" ⚙️
            - Perfil, Empresa, Segurança, Sistema
            - Notificações push, instalar PWA
            - Exclusão de conta
            
            📦 **PRODUTOS E SERVIÇOS** (products-services.md)
            📍 ACESSO: Menu lateral > Submenu "Operações" 📦 > "Produtos e Serviços" 📦
            - Cadastrar produtos e serviços
            - Preços, duração, alertas de oportunidade
            - Importação via CSV
            
            👥 **CONTATOS** (contacts.md)
            📍 ACESSO: Menu lateral > Submenu "Operações" 📦 > "Contatos" 📇
            - Lista de contatos, busca
            - Tags, edição, exclusão em massa
            - Toggle de IA por contato
            
            📂 **FILAS** (queues.md)
            📍 ACESSO: Menu lateral > Submenu "Operações" 📦 > "Filas" 📋
            - Criar e gerenciar filas de atendimento
            - Atribuir usuários às filas
            
            🏷️ **TAGS** (tags.md)
            📍 ACESSO: Menu lateral > Submenu "Operações" 📦 > "Tags" 🏷️
            - Criar, editar, excluir tags
            - Cores, status, tag especial "IA"
            
            ⏰ **FOLLOW UP** (follow-up.md)
            📍 ACESSO: Menu lateral > Submenu "Operações" 📦 > "Follow Up" ⏰
            - Mensagens de follow up por tempo
            - Categorias, templates
            - Envio automático
            
            📅 **AGENDAMENTOS** (scheduling.md)
            📍 ACESSO: Menu lateral > Submenu "Administrativo" 📊 > "Agendamentos" 📅
            - Calendário, criar agendamentos
            - Profissionais, serviços, horários
            - Ausências, status (concluído/cancelado)
            
            💰 **VENDAS** (sales.md)
            📍 ACESSO: Menu lateral > Submenu "Administrativo" 📊 > "Vendas" 🛒
            - Registrar vendas
            - Pagamento à vista/parcelado
            - Relatórios de vendas
            
            👨‍💼 **EQUIPE** (team.md)
            📍 ACESSO: Menu lateral > Submenu "Administrativo" 📊 > "Equipe" 👥
            - Membros da equipe (atendentes, supervisores)
            - Profissionais de agenda
            - Permissões e comissões
            
            ═══════════════════════════════════════════════════════════════
            INSTRUÇÕES DE USO:
            - Quando o usuário perguntar sobre uma funcionalidade, SEMPRE indique como acessar a página
            - Exemplo: "Para adicionar um produto, acesse: Menu lateral > Operações > Produtos e Serviços"
            - Seja direto e objetivo nas explicações
            - Forneça passos práticos quando possível
            ═══════════════════════════════════════════════════════════════
            
            ${context}`
          },
          { role: "user", content: message }
        ],
      },
    });

    console.log(`[ai-copilot-chat] Used ${usedCustomToken ? 'custom' : 'default'} OpenAI token`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Track token usage (always track, regardless of which token was used)
    if (data.usage && ownerId) {
      await trackTokenUsage(supabaseAdmin, {
        ownerId,
        teamMemberId,
        functionName: 'ai-copilot-chat',
        model: 'gpt-4.1',
        usage: data.usage
      });
    }

    return new Response(JSON.stringify({
      response: aiResponse,
      usage: data.usage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in ai-copilot-chat:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
