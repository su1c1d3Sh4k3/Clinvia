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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { conversationId } = await req.json();
    
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar usuário autenticado
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Buscar dados de análise atual
    const { data: analysis, error: analysisError } = await supabase
      .from('ai_analysis')
      .select('sentiment_score, speed_score, summary')
      .eq('conversation_id', conversationId)
      .single();

    if (analysisError) {
      console.error('Error fetching analysis:', analysisError);
      // Se não houver análise, usar valores padrão
    }

    // Buscar informações da conversa para obter team_id se houver
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError) throw convError;

    // Salvar dados de atendimento
    const { data: attendanceData, error: insertError } = await supabase
      .from('dados_atendimento')
      .insert({
        user_id: user.id,
        ticket_id: conversationId,
        team_id: null, // Será implementado quando houver sistema de times
        qualidade: analysis?.sentiment_score || 5,
        velocidade: analysis?.speed_score || 5,
        resumo: analysis?.summary || 'Sem resumo disponível'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`Saved attendance data for conversation ${conversationId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: attendanceData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in save-attendance-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
