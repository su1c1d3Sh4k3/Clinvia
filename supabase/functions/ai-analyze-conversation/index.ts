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
    const { conversationId } = await req.json();
    
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar todas as mensagens da conversa
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*, direction, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ sentiment_score: 5, message: 'No messages to analyze' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Formatar conversa para análise
    const conversationText = messages
      .map(msg => `${msg.direction === 'inbound' ? 'Cliente' : 'Atendente'}: ${msg.body || '(mídia)'}`)
      .join('\n');

    // Chamar Lovable AI para análise
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um analisador de satisfação de atendimento. Analise o contexto da conversa e atribua uma nota de 0 a 10 baseado nos seguintes critérios:

0 - Péssimo: Cliente odiando tudo, totalmente insatisfeito, atendente arrogante/mal educado
1-3 - Insatisfeito: Cliente muito bravo, atendente tentando contornar mas cliente irredutível
4-6 - Neutro: Sem sinais claros de satisfação ou insatisfação
7-9 - Satisfeito: Cliente bem satisfeito, sem hostilidade
10 - Impressionado: Cliente elogiou atendimento, objetivo alcançado

Retorne APENAS um número de 0 a 10.`
          },
          {
            role: 'user',
            content: `Analise esta conversa de atendimento:\n\n${conversationText}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'return_satisfaction_score',
              description: 'Return the satisfaction score analysis',
              parameters: {
                type: 'object',
                properties: {
                  score: {
                    type: 'number',
                    description: 'Satisfaction score from 0 to 10',
                    minimum: 0,
                    maximum: 10
                  }
                },
                required: ['score'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'return_satisfaction_score' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const score = toolCall ? JSON.parse(toolCall.function.arguments).score : 5;

    // Garantir que o score está entre 0 e 10
    const sentimentScore = Math.max(0, Math.min(10, score));

    // Atualizar ou inserir análise
    const { data: analysis, error: analysisError } = await supabase
      .from('ai_analysis')
      .upsert({
        conversation_id: conversationId,
        sentiment_score: sentimentScore,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'conversation_id'
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    console.log(`Analyzed conversation ${conversationId}: score ${sentimentScore}`);

    return new Response(
      JSON.stringify({ sentiment_score: sentimentScore, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-analyze-conversation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
