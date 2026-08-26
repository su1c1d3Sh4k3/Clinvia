import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    unexpectedErrorResponse,
} from '../_shared/api-errors.ts';

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

    // TODO(segurança): esta função não valida x-api-key — decidir com o usuário antes de exigir.
    try {
        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const conversationId = body!.conversation_id;
        const limit = Number(body!.limit) > 0 ? Math.min(Number(body!.limit), 100) : 10;

        const missing = missingFields(corsHeaders, body!, ['conversation_id'],
            'Envie o id da conversa (bd_data.conversation_id no prompt da IA).');
        if (missing) return missing;

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: conv, error: convError } = await supabase
            .from('conversations')
            .select('id, contact_id')
            .eq('id', conversationId)
            .maybeSingle();

        if (convError) {
            return dbErrorResponse(corsHeaders, 'conversation_lookup_failed',
                `buscar a conversa ${conversationId} cujo histórico foi pedido`, convError);
        }
        if (!conv) {
            return apiError(corsHeaders, {
                status: 404,
                code: 'conversation_not_found',
                message: `Conversa não encontrada: nenhuma conversa com o id ${conversationId} existe neste banco. Confira se o conversation_id veio de bd_data.conversation_id e não de outro campo.`,
            });
        }
        if (!conv.contact_id) {
            return apiError(corsHeaders, {
                status: 400,
                code: 'conversation_without_contact',
                message: `A conversa ${conversationId} não tem contato vinculado (é uma conversa de grupo) e o histórico desta API é por contato. Use uma conversa individual.`,
            });
        }
        const contactId = conv.contact_id;

        const { data, error } = await supabase.rpc('get_conversation_messages_toon', {
            p_conversation_id: conversationId,
            p_limit: limit,
        });

        if (error) {
            return dbErrorResponse(corsHeaders, 'conversation_history_failed',
                `montar o histórico das últimas ${limit} mensagens da conversa ${conversationId} (RPC get_conversation_messages_toon)`, error);
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

    } catch (err) {
        return unexpectedErrorResponse(corsHeaders, 'Falha inesperada na API de histórico de conversa (api-contact-messages)', err);
    }
});
