import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateConversationSummary,
  loadConversationTranscript,
} from "../_shared/conversation-summary.ts";

/**
 * ai-generate-summary — botão "Gerar Resumo" da lateral de inteligência.
 *
 * Usa o mesmo prompt/modelo do resumo automático (`_shared/conversation-summary.ts`),
 * para o resumo manual e o do encerramento serem idênticos em qualidade. Serve
 * também para reprocessar um ticket já encerrado.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serveMonitored("ai-generate-summary", async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();
    console.log('📝 Summary request received for conversation:', conversationId);

    if (!conversationId) {
      throw new Error('conversationId é obrigatório');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { transcript, ownerId } = await loadConversationTranscript(supabase, conversationId);
    const analysis = await generateConversationSummary(supabase, {
      transcript,
      ownerId,
      functionName: 'ai-generate-summary',
    });

    // Mesma gravação do worker (conversations.summary + ai_analysis), mas sem
    // somar na qualidade do contato: regerar o resumo não pode mexer na média.
    const { error: saveError } = await supabase.rpc('finish_conversation_summary', {
      p_conversation_id: conversationId,
      p_summary: analysis.summary,
      p_sentiment_score: analysis.sentiment_score,
      p_speed_score: analysis.speed_score,
      p_append_quality: false,
    });
    if (saveError) throw saveError;

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
