import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * api-contact-messages
 *
 * Retorna as ultimas mensagens da conversa em formato TOON compacto,
 * limitadas a CONEXAO (instancia) daquela conversa.
 * Formato: ROLE|DD/MM HH:MI|mensagem (uma linha por mensagem)
 * Roles: C = Cliente, IA = IA, A = Agente humano
 *
 * O mesmo conteudo ja vai em bd_data.conversation_history no payload do n8n
 * (webhook-handle-message) — esta fn serve para buscar sob demanda / com mais linhas.
 *
 * Body (JSON):
 *   - conversation_id (obrigatorio): ID da conversa (bd_data.conversation_id)
 *   - limit (opcional, default 10)
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const conversationId = body.conversation_id;
        const limit = Number(body.limit) > 0 ? Math.min(Number(body.limit), 100) : 10;

        if (!conversationId) {
            return new Response(
                JSON.stringify({ success: false, error: 'conversation_id is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: conv } = await supabase
            .from('conversations')
            .select('id, contact_id')
            .eq('id', conversationId)
            .maybeSingle();

        if (!conv?.contact_id) {
            return new Response(
                JSON.stringify({ success: false, error: 'Conversa não encontrada ou sem contato vinculado' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
        const contactId = conv.contact_id;

        const { data, error } = await supabase.rpc('get_conversation_messages_toon', {
            p_conversation_id: conversationId,
            p_limit: limit,
        });

        if (error) {
            console.error('[api-contact-messages] RPC error:', error);
            return new Response(
                JSON.stringify({ success: false, error: error.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                conversation_id: conversationId,
                contact_id: contactId,
                messages: data || '',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: any) {
        console.error('[api-contact-messages] Error:', err);
        return new Response(
            JSON.stringify({ success: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
