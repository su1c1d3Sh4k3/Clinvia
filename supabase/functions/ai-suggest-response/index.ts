import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    const data = await response.json();
    const suggestion = data.choices[0].message.content;

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
