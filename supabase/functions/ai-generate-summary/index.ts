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

    // Buscar todas as mensagens da conversa com informações de mídia
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*, direction, body, message_type, media_url, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;
    if (!messages || messages.length === 0) {
      throw new Error('No messages found for this conversation');
    }

    // Formatar conversa com informações detalhadas
    const conversationText = messages
      .map(msg => {
        let content = msg.body || '';
        if (msg.media_url) {
          content += ` [${msg.message_type}: ${msg.media_url}]`;
        }
        return `${msg.direction === 'inbound' ? 'Cliente' : 'Atendente'}: ${content}`;
      })
      .join('\n');

    // Extrair todas as URLs de mídia
    const mediaUrls = messages
      .filter(msg => msg.media_url)
      .map(msg => `- ${msg.message_type}: ${msg.media_url}`)
      .join('\n');

    // Chamar Lovable AI para gerar resumo
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
            content: `Você é um assistente que resume conversas de atendimento. Resuma esta conversa em tópicos, destacando:

📌 **INFORMAÇÕES CRÍTICAS** (sempre em destaque se presentes):
- Dados pessoais (nome, CPF, telefone, email)
- Senhas, códigos, tokens
- Links importantes
- URLs de imagens/documentos enviados

📝 **RESUMO DA CONVERSA**:
- Motivo do contato
- Problema relatado
- Solução oferecida
- Status atual

Use emojis e formatação markdown para clareza. Seja conciso mas completo.`
          },
          {
            role: 'user',
            content: `Analise e resuma esta conversa de atendimento:\n\n${conversationText}\n\n${mediaUrls ? `Mídias compartilhadas:\n${mediaUrls}` : ''}`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      throw new Error(`AI summary generation failed: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content || 'Não foi possível gerar o resumo.';

    // Atualizar análise com o resumo
    const { error: updateError } = await supabase
      .from('ai_analysis')
      .upsert({
        conversation_id: conversationId,
        summary: summary,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'conversation_id'
      });

    if (updateError) throw updateError;

    console.log(`Generated summary for conversation ${conversationId}`);

    return new Response(
      JSON.stringify({ summary, success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-generate-summary:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
