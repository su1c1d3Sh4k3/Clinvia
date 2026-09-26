import { serveMonitored } from "../_shared/serve-monitored.ts";
import { unexpectedErrorResponse } from "../_shared/api-errors.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-origin',
};

serveMonitored("inspect-message", async (req) => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (!messages || messages.length === 0) {
            return new Response(JSON.stringify({ message: 'No messages found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const msg = messages[0];
        const result = {
            id: msg.id,
            type: msg.message_type,
            body: msg.body,
            media_url: msg.media_url,
            created_at: msg.created_at,
            headers: {} as any
        };

        if (msg.media_url) {
            try {
                const res = await fetch(msg.media_url, { method: 'HEAD' });
                result.headers = {
                    status: res.status,
                    contentType: res.headers.get('content-type'),
                    contentLength: res.headers.get('content-length')
                };
            } catch (err) {
                // Rota anonima: o motivo cru fica no log, nao no corpo.
                console.error('[inspect-message] HEAD da midia falhou:', err);
                result.headers = { error: 'head_falhou' };
            }
        }

        return new Response(JSON.stringify(result, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Inspecionar a mensagem", error, req);
    }
});
