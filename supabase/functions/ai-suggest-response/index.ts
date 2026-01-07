import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    const { conversationId, mode = 'generate', text } = await req.json();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get owner ID early for custom token lookup
    let ownerId: string | null = null;
    if (conversationId) {
      ownerId = await getOwnerFromConversation(supabase, conversationId);
    }

    let systemPrompt = "";
    let userPrompt = "";

    if (mode === 'fix') {
      systemPrompt = "Você é um assistente que corrige erros ortográficos e gramaticais. Mantenha o tom original, apenas corrija os erros. Retorne APENAS o texto corrigido, sem aspas e sem explicações.";
      userPrompt = `Corrija este texto: "${text}"`;
    } else if (mode === 'improve') {
      systemPrompt = "Você é um especialista em comunicação empresarial. Reescreva o texto para torná-lo mais profissional, empático e claro, mantendo o sentido original. Retorne APENAS o texto melhorado, sem aspas e sem explicações.";
      userPrompt = `Melhore este texto: "${text}"`;
    } else {
      // mode === 'generate'
      // Fetch context
      const { data: conversation } = await supabase
        .from('conversations')
        .select('summary, contacts(push_name, phone)')
        .eq('id', conversationId)
        .single();

      const { data: messages } = await supabase
        .from('messages')
        .select('direction, body')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(10);

      const lastMessages = messages?.reverse().map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${m.body}`).join('\n') || "";
      const summary = conversation?.summary || "Sem resumo disponível.";
      const clientName = conversation?.contacts?.push_name || "Cliente";

      systemPrompt = `Você é um assistente de atendimento ao cliente.
      Contexto da conversa:
      Resumo: ${summary}
      Cliente: ${clientName}
      
      Últimas mensagens:
      ${lastMessages}
      
      Gere uma resposta curta, direta e empática para continuar o atendimento. Retorne APENAS o texto da resposta, sem aspas.`;

      userPrompt = "Sugira uma resposta adequada para o momento atual da conversa.";
    }

    // Use makeOpenAIRequest with custom token support
    const { response, usedCustomToken } = await makeOpenAIRequest(supabase, ownerId, {
      endpoint: "https://api.openai.com/v1/chat/completions",
      body: {
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      },
    });

    console.log(`[ai-suggest-response] Used ${usedCustomToken ? 'custom' : 'default'} OpenAI token`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const suggestion = data.choices[0].message.content;

    // Track token usage (always track, regardless of which token was used)
    if (data.usage && ownerId) {
      await trackTokenUsage(supabase, {
        ownerId,
        teamMemberId: null,
        functionName: 'ai-suggest-response',
        model: 'gpt-4.1',
        usage: data.usage
      });
    }

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in ai-suggest-response:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
