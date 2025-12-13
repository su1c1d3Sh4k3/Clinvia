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
        const { conversationId, conversationText: providedText } = await req.json();

        if (!conversationId) {
            throw new Error('conversationId is required');
        }

        const openAiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openAiKey) {
            throw new Error('OPENAI_API_KEY is not set');
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        let conversationText = providedText;

        // If text not provided, fetch from DB
        if (!conversationText) {
            console.log(`Fetching messages for conversation ${conversationId}...`);
            const { data: messages, error: messagesError } = await supabaseAdmin
                .from('messages')
                .select('body, direction, created_at')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });

            if (messagesError) {
                throw new Error(`Error fetching messages: ${messagesError.message}`);
            }

            if (!messages || messages.length === 0) {
                // Try fetching from history if resolved (optional, but good for completeness)
                const { data: conversation, error: convError } = await supabaseAdmin
                    .from('conversations')
                    .select('messages_history, status')
                    .eq('id', conversationId)
                    .single();

                if (convError) throw convError;

                if (conversation.status === 'resolved' && conversation.messages_history) {
                    const history = conversation.messages_history as any[];
                    conversationText = history.map((m: any) => {
                        const role = m.role === 'user' || m.user ? 'Cliente' : 'Atendente';
                        const content = m.content || m.user || m.assistant || '';
                        return `${role}: ${content}`;
                    }).join('\n');
                } else {
                    throw new Error('No messages found for this conversation');
                }
            } else {
                conversationText = messages.map((m: any) => {
                    const role = m.direction === 'inbound' ? 'Cliente' : 'Atendente';
                    return `${role}: ${m.body}`;
                }).join('\n');
            }
        }

        const prompt = `Analise a satisfação do cliente nesta conversa.
Critérios:
0 (Péssimo): Odeia tudo, insatisfeito, atendente arrogante.
1-3 (Insatisfeito): Bravo, irredutível.
4-6 (Neutro): Sem emoção forte.
7-9 (Satisfeito): Sem hostilidade, bem atendido.
10 (Impressionado): Elogiou, problema resolvido.

Conversa:
${conversationText}

Responda APENAS um número inteiro de 0 a 10.`;

        console.log(`Analyzing conversation ${conversationId}...`);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'Você é um avaliador de satisfação.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 10
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('OpenAI API Error:', errorData);
            throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const score = parseInt(content || "5");

        console.log(`Analyzed score: ${score}`);

        // Save to Database using Service Role (bypassing RLS)
        // supabaseAdmin is already initialized above

        const { error: upsertError } = await supabaseAdmin
            .from('ai_analysis')
            .upsert({
                conversation_id: conversationId,
                sentiment_score: score,
                last_updated: new Date().toISOString()
            }, { onConflict: 'conversation_id' });

        if (upsertError) {
            console.error('Error saving to DB:', upsertError);
            // We don't throw here to ensure the score is still returned to UI
        } else {
            console.log('Score saved to DB successfully');
        }

        return new Response(
            JSON.stringify({ score, success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error in ai-sentiment-analysis:', error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
