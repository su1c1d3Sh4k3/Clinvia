import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { trackTokenUsage } from "../_shared/token-tracker.ts";
import { fetchProvider } from "../_shared/provider-errors.ts";
import { apiError } from "../_shared/api-errors.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-origin',
};

serveMonitored("generate-client-report", async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { contactId } = await req.json();

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

        // 1. Fetch Contact Data
        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', contactId)
            .single();

        if (contactError) throw contactError;

        // 2. Fetch Copilot Data (Company Info & Personality)
        // Assuming there's a 'copilot' table. We'll fetch the first row.
        const { data: copilotData } = await supabase
            .from('copilot')
            .select('*')
            .limit(1)
            .single();

        // 3. Prepare Data for Analysis
        const analysisHistory = contact.analysis || [];
        const qualityScores = contact.quality || [];
        const averageQuality = qualityScores.length > 0
            ? (qualityScores.reduce((a: any, b: any) => a + b, 0) / qualityScores.length).toFixed(1)
            : "N/A";

        const prompt = `Gere um relatório completo sobre o cliente abaixo.
    
    Dados do Cliente:
    Nome: ${contact.push_name}
    Telefone: ${contact.phone || contact.remote_jid}
    Média de Satisfação: ${averageQuality}
    
    Histórico de Atendimentos (Resumos):
    ${JSON.stringify(analysisHistory, null, 2)}
    
    Dados da Empresa (Copilot):
    ${JSON.stringify(copilotData || {}, null, 2)}
    
    Instruções:
    Analise como o atendente lidou com o cliente, dores do cliente, pontos positivos, pontos negativos, melhorias e ações imediatas.
    Estruture a resposta em Markdown, formatada para ser exibida em um card.
    Seja direto e profissional.
    `;

        // 4. Generate Report with OpenAI
        const response = await fetchProvider('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo',
                messages: [
                    { role: 'system', content: 'Você é um consultor especialista em Customer Success.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
            })
        });

        const data = await response.json();
        const reportContent = data.choices?.[0]?.message?.content || "Não foi possível gerar o relatório.";

        // 5. Save Report to Contact
        const { error: updateError } = await supabase
            .from('contacts')
            .update({ report: reportContent })
            .eq('id', contactId);

        if (updateError) throw updateError;

        // Track token usage (use contact.user_id as owner)
        if (data.usage && contact.user_id) {
            await trackTokenUsage(supabase, {
                ownerId: contact.user_id,
                teamMemberId: null,
                functionName: 'generate-client-report',
                model: 'gpt-4-turbo',
                usage: data.usage
            });
        }

        return new Response(
            JSON.stringify({ success: true, report: reportContent }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        return apiError(corsHeaders, {
            status: 500,
            code: "client_report_failed",
            request: req,
            report: true,
            message: "Não foi possível gerar o relatório do cliente agora. Tente novamente em alguns instantes.",
            details: String((error as Error)?.message ?? error),
        });
    }
});
