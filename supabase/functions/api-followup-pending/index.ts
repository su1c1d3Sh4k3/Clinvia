import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    unexpectedErrorResponse,
    detalheTecnicoNoCorpo,
} from "../_shared/api-errors.ts";

// Esta API fala com o n8n: o detalhe tecnico do banco no corpo da resposta e
// o que a torna diagnosticavel. Sem esta declaracao o corpo sai limpo -- ver
// o cabecalho de `_shared/api-errors.ts`.
detalheTecnicoNoCorpo();


const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-origin',
};

/**
 * api-followup-pending
 *
 * Retorna CONVERSAS pendentes de follow-up da IA (uma linha por conversa).
 * Filtros: conversa pending na fila 'Atendimento IA', conexão da conversa com a
 * IA ligada (WhatsApp: instances.ia_on_wpp; Instagram:
 * instagram_instances.ia_on_insta), contato com ia_on = true, última mensagem da
 * conversa enviada por nós e mais antiga que X minutos.
 *
 * WhatsApp e Instagram seguem as MESMAS regras. Cada linha traz channel
 * ('whatsapp' | 'instagram') e a conexão correspondente: no WhatsApp vem
 * instance_id (instagram_instance_id NULL) e number é o telefone; no Instagram
 * vem instagram_instance_id (instance_id NULL) e number é 'instagram:<IGSID>',
 * nunca um telefone — responda pelo Direct, não por WhatsApp.
 *
 * Contato com conversa em 2 conexões, ambas com IA ligada => 2 linhas, cada uma
 * com seu conversation_id, sua conexão e seu próprio last_message_time.
 * Só uma conexão com IA => só a conversa dela.
 *
 * ENTREGA ÚNICA POR ETAPA: a RPC reserva a conversa
 * (conversations.followup_claimed_number) de forma atômica, então chamadas
 * simultâneas (ex.: várias instâncias no mesmo workflow do n8n) recebem cada
 * conversa UMA vez só em cada follow_number.
 *
 * Body (JSON):
 *   - user_id (obrigatório): ID do usuário dono dos contatos
 *   - min (obrigatório): tempo mínimo em minutos desde a última mensagem
 *   - follow_number (opcional): filtrar por número de follow-up (0, 1 ou 2)
 */
serveMonitored("api-followup-pending", async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const userId = body!.user_id;
        const minParam = body!.min;
        const followNumber = body!.follow_number !== undefined ? Number(body!.follow_number) : null;

        const missing = missingFields(corsHeaders, body!, ["user_id", "min"],
            "Envie o id da conta (bd_data.user_id no prompt da IA) e min = tempo mínimo, em minutos, desde a última mensagem.");
        if (missing) return missing;

        if (!minParam || isNaN(Number(minParam))) {
            return apiError(corsHeaders, {
                status: 400,
                code: "invalid_min",
                message: `Campo min inválido: recebido ${JSON.stringify(minParam)}. Envie min como um número de minutos maior que zero (ex.: 60 para conversas paradas há 1 hora).`,
            });
        }

        if (followNumber !== null && !Number.isFinite(followNumber)) {
            return apiError(corsHeaders, {
                status: 400,
                code: "invalid_follow_number",
                message: `Campo follow_number inválido: recebido ${JSON.stringify(body!.follow_number)}. Envie o número do follow-up (0, 1 ou 2) ou omita o campo para não filtrar por etapa.`,
            });
        }

        const minutes = Number(minParam);

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Busca contatos pendentes usando query com timezone de São Paulo no retorno
        const rpcParams: Record<string, any> = {
            p_user_id: userId,
            p_minutes: minutes,
        };
        if (followNumber !== null) {
            rpcParams.p_follow_number = followNumber;
        }

        const { data, error } = await supabase.rpc('get_followup_pending_contacts', rpcParams);

        if (error) {
            return dbErrorResponse(corsHeaders, "followup_pending_query_failed",
                `listar as conversas pendentes de follow-up da conta ${userId} (RPC get_followup_pending_contacts, min=${minutes}${followNumber !== null ? `, follow_number=${followNumber}` : ""})`,
                error, req);
        }

        const contacts = data || [];

        console.log(`[api-followup-pending] user=${userId} min=${minutes} found=${contacts.length}`);

        return new Response(
            JSON.stringify({
                success: true,
                count: contacts.length,
                contacts,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err) {
        return unexpectedErrorResponse(corsHeaders,
            "Falha inesperada na API de follow-up pendente (api-followup-pending)", err, req);
    }
});
