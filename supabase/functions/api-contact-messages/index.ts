import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * api-contact-messages
 *
 * Retorna as ultimas 10 mensagens de um contato em formato TOON compacto.
 * Formato: ROLE|DD/MM HH:MI|mensagem (uma linha por mensagem)
 * Roles: C = Cliente, IA = IA, A = Agente humano
 *
 * Body (JSON):
 *   - contact_id (obrigatorio): ID do contato
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const contactId = body.contact_id;

        if (!contactId) {
            return new Response(
                JSON.stringify({ success: false, error: 'contact_id is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data, error } = await supabase.rpc('get_contact_messages_toon', {
            p_contact_id: contactId,
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
