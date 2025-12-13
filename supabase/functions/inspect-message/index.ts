import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
                result.headers = { error: err.message };
            }
        }

        return new Response(JSON.stringify(result, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
