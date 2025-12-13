import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { agent_name, metrics } = await req.json();

        if (!agent_name || !metrics) {
            throw new Error('Missing agent_name or metrics');
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Fetch company context (copilot settings)
        // We'll fetch the first record found, assuming single company/tenant for now
        const { data: copilotSettings } = await supabaseClient
            .from('copilot')
            .select('*')
            .limit(1)
            .single();

        const companyContext = copilotSettings ? `
      Sobre a empresa: ${copilotSettings.about_company || 'N/A'}
      Perfil do cliente: ${copilotSettings.customer_profile || 'N/A'}
      Produtos: ${copilotSettings.products || 'N/A'}
    ` : 'Contexto da empresa não disponível.';

        const prompt = `
      Você é um gerente de atendimento experiente. Avalie o desempenho do seguinte atendente:
      
      Nome: ${agent_name}
      Métricas:
      - Tickets Resolvidos: ${metrics.resolved_tickets}
      - Tempo Médio de Resposta: ${metrics.avg_response_time_min} minutos
      - Nota de Qualidade Média: ${metrics.avg_quality}/10

      Contexto da Empresa:
      ${companyContext}

      Instruções:
      1. Seja direto e profissional.
      2. Destaque pontos fortes baseados nos números.
      3. Sugira pontos de melhoria se houver (ex: se o tempo for alto ou qualidade baixa).
      4. Use um tom construtivo e motivador.
      5. Responda em português do Brasil.
      6. Máximo de 3 parágrafos curtos.
    `;

        const openAiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openAiKey) {
            throw new Error('OPENAI_API_KEY not set');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openAiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant for evaluating customer support agents.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
            }),
        });

        const data = await response.json();
        const evaluation = data.choices[0].message.content;

        return new Response(
            JSON.stringify({ evaluation }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
