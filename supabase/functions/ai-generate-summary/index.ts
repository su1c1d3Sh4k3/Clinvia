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
    const { conversationId, conversationText } = await req.json();
    console.log('📝 Summary request received for conversation:', conversationId);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured in Edge Function secrets');
    }

    // Se conversationText não foi enviado, buscar do banco
    let textToAnalyze = conversationText;
    if (!textToAnalyze && conversationId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      console.log(`Fetching messages for conversation: ${conversationId}`);

      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('direction, body, message_type, media_url, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
        throw messagesError;
      }

      if (!messages || messages.length === 0) {
        console.warn('No messages found for this conversation.');
        throw new Error('No messages found');
      }

      console.log(`Found ${messages.length} messages to analyze.`);

      textToAnalyze = messages
        .map(m => {
          let content = m.body || '';
          if (m.media_url) content += ` [${m.message_type}: ${m.media_url}]`;
          return `[${new Date(m.created_at).toLocaleString()}] ${m.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${content}`;
        })
        .join('\n');

      console.log('Text to analyze length:', textToAnalyze.length);
    }

    const prompt = `Analise a seguinte conversa de suporte e gere um resumo executivo e estruturado.

      Diretrizes de Qualidade:
      1. **Tema Central**: Comece com uma frase sucinta definindo o motivo principal do contato.
      2. **Principais Pontos**: Liste os 3-5 pontos cruciais discutidos, focando na resolução de problemas e ações tomadas.
      3. **Destaques Positivos**: Identifique explicitamente pontos onde o atendimento foi eficaz, cordial ou resolveu o problema rapidamente.
      4. **Dados Sensíveis**: Se houver, destaque APENAS a presença de dados sensíveis (não repita senhas), links ou anexos importantes.
      
      Formatação do Resumo (Markdown):
      - Use negrito para ênfase.
      - Use emojis com moderação para categorizar (ex: ✅ para resoluções, ⚠️ para atenção).
      
      Métricas:
      - Sentimento do Cliente (0-10): Baseado no tom, palavras usadas e satisfação final.
      - Velocidade de Atendimento (0-10): Baseado na fluidez e tempo de resposta do agente.

      Conversa:
      ${textToAnalyze}
      
      Responda APENAS em formato JSON:
      {
        "summary": "### 🎯 Tema Central\\n[Descrição sucinta]\\n\\n### 📌 Principais Pontos\\n- [Ponto 1]\\n- [Ponto 2]\\n\\n### ✨ Destaques Positivos\\n- [Destaque 1]\\n\\n### ⚠️ Observações\\n[Dados sensíveis ou pendências]",
        "sentiment_score": 8,
        "speed_score": 9
      }`;

    console.log('Sending request to OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um analista de qualidade de atendimento.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    console.log('✅ OpenAI response received');
    console.log('Raw content:', content);

    // Tentar fazer parse do JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON parse error:', e);
      analysis = {
        summary: content,
        sentiment_score: 5,
        speed_score: 5
      };
    }

    console.log('Parsed analysis:', analysis);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save to database (ai_analysis)
    console.log('Saving to ai_analysis table...');
    const { error: upsertError } = await supabase
      .from('ai_analysis')
      .upsert({
        conversation_id: conversationId,
        summary: analysis.summary,
        sentiment_score: analysis.sentiment_score,
        speed_score: analysis.speed_score,
        last_updated: new Date().toISOString()
      }, { onConflict: 'conversation_id' });

    if (upsertError) {
      console.error('Error saving to ai_analysis:', upsertError);
      throw upsertError;
    }
    console.log('Saved to ai_analysis successfully.');

    // Save to database (conversations table)
    console.log('Updating conversations table with summary...');
    const { data: updateData, error: updateError } = await supabase
      .from('conversations')
      .update({ summary: analysis.summary })
      .eq('id', conversationId)
      .select();

    if (updateError) {
      console.error('Error updating conversations table:', updateError);
    } else {
      console.log('Conversations table updated successfully:', updateData);
    }

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
