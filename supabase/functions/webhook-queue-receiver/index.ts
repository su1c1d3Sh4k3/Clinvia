import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Declare EdgeRuntime for TypeScript
declare const EdgeRuntime: {
    waitUntil: (promise: Promise<any>) => void;
};

/**
 * webhook-queue-receiver
 * 
 * Função que salva o payload na fila E dispara processamento em background.
 * 
 * Fluxo:
 * 1. Salva na fila (garantia de persistência)
 * 2. Responde OK ao UZAPI (~100ms)
 * 3. Dispara processor em background (não bloqueia)
 * 
 * Benefícios:
 * - Responde rápido (UZAPI não dá timeout)
 * - Mensagens nunca são perdidas (salvas na tabela)
 * - Processamento quase instantâneo
 */
serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const startTime = Date.now();

    try {
        const rawBody = await req.text();

        if (!rawBody) {
            console.log('[webhook-queue-receiver] Empty body received');
            return new Response(JSON.stringify({ success: true, message: 'Empty body' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        let payload: any;
        try {
            payload = JSON.parse(rawBody);
        } catch (e) {
            console.error('[webhook-queue-receiver] Invalid JSON:', e);
            return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Extrair informações básicas
        const instanceName = payload.instanceName || payload.body?.instanceName || 'unknown';
        const eventType = payload.EventType || payload.event || payload.type || 'messages';

        console.log(`[webhook-queue-receiver] Instance: ${instanceName}, Event: ${eventType}`);


        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Salva na fila - OPERAÇÃO ÚNICA, MUITO RÁPIDA
        const { error } = await supabase
            .from('webhook_queue')
            .insert({
                instance_name: instanceName,
                event_type: eventType,
                payload: payload
            });

        if (error) {
            console.error('[webhook-queue-receiver] Error saving to queue:', error);
            return new Response(JSON.stringify({ success: false, error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const elapsed = Date.now() - startTime;
        console.log(`[webhook-queue-receiver] Queued successfully in ${elapsed}ms`);

        // 2. Dispara processamento em BACKGROUND (não bloqueia a resposta)
        // Usa EdgeRuntime.waitUntil para executar após retornar a resposta
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
            EdgeRuntime.waitUntil(
                supabase.functions.invoke('webhook-queue-processor', { body: {} })
                    .then((_result: unknown) => {
                    })
                    .catch((err) => {
                        console.error('[webhook-queue-receiver] Background processor error:', err);
                    })
            );
        } else {
            // Fallback: invocar diretamente (pode adicionar ~200ms)
            supabase.functions.invoke('webhook-queue-processor', { body: {} })
                .catch((err) => console.error('[webhook-queue-receiver] Processor invoke failed:', err));
        }

        return new Response(JSON.stringify({
            success: true,
            queued: true,
            time_ms: elapsed
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        console.error('[webhook-queue-receiver] Exception:', e);
        return new Response(JSON.stringify({ success: false, error: String(e) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
