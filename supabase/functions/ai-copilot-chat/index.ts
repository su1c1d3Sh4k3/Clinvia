import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let context = "";
    let systemPrompt = "";

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
      } catch (err) {
        console.error("Error fetching copilot settings:", err);
      }
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
            
            ${context}`
          },
          { role: "user", content: message }
        ],
      }),
    });

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    return new Response(JSON.stringify({ response: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
