import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * api-followup-pending
 *
 * Retorna contatos pendentes de follow-up da IA.
 * Filtros: ia_on = true, last_message = 'enviada',
 * last_message_time mais antiga que X minutos.
 *
 * Body (JSON):
 *   - user_id (obrigatório): ID do usuário dono dos contatos
 *   - min (obrigatório): tempo mínimo em minutos desde a última mensagem
 *   - follow_number (opcional): filtrar por número de follow-up (0, 1 ou 2)
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const userId = body.user_id;
        const minParam = body.min;
        const followNumber = body.follow_number !== undefined ? Number(body.follow_number) : null;

        if (!userId) {
            return new Response(
                JSON.stringify({ success: false, error: 'user_id is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!minParam || isNaN(Number(minParam))) {
            return new Response(
                JSON.stringify({ success: false, error: 'min must be a valid number (minutes)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
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
            console.error('[api-followup-pending] RPC error:', error);
            return new Response(
                JSON.stringify({ success: false, error: error.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
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

    } catch (err: any) {
        console.error('[api-followup-pending] Error:', err);
        return new Response(
            JSON.stringify({ success: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
