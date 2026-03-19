import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const EdgeRuntime: {
    waitUntil: (promise: Promise<any>) => void;
};

/**
 * webhook-queue-receiver
 *
 * CRITICAL: Responde 200 IMEDIATAMENTE antes de qualquer operação de DB.
 * Isso evita que a Evolution API re-tente (causando thundering herd / cascata de falhas).
 *
 * Fluxo:
 * 1. Lê e valida o body (sem DB)
 * 2. Responde 200 IMEDIATAMENTE
 * 3. Salva na fila + dispara processor em background (EdgeRuntime.waitUntil)
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    // --- 1. Parse do body (sem DB, muito rápido) ---
    let payload: any;
    try {
        const rawBody = await req.text();
        if (!rawBody) {
            return new Response(JSON.stringify({ success: true, message: 'Empty body' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        payload = JSON.parse(rawBody);
    } catch (_e) {
        // Retorna 200 mesmo em JSON inválido — não queremos que a Evolution retente
        return new Response(JSON.stringify({ success: true, message: 'Invalid JSON ignored' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const instanceName = payload.instanceName || payload.body?.instanceName || 'unknown';
    const eventType = payload.EventType || payload.event || payload.type || 'messages';

    // --- 2. RESPONDE 200 IMEDIATAMENTE (antes de qualquer operação de DB) ---
    // Isso garante que a Evolution API não re-tente, quebrando o ciclo de thundering herd.
    const immediateResponse = new Response(JSON.stringify({ success: true, queued: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

    // --- 3. Salva na fila + dispara processor em BACKGROUND ---
    const backgroundWork = (async () => {
        try {
            const supabase = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );

            const { error } = await supabase
                .from('webhook_queue')
                .insert({
                    instance_name: instanceName,
                    event_type: eventType,
                    payload: payload
                });

            if (error) {
                console.error('[webhook-queue-receiver] Error saving to queue:', error.message);
                return;
            }

            console.log(`[webhook-queue-receiver] Queued: instance=${instanceName} event=${eventType}`);

            // Dispara o processor (fire-and-forget)
            supabase.functions.invoke('webhook-queue-processor', { body: {} })
                .catch((err) => console.error('[webhook-queue-receiver] Processor invoke error:', err));

        } catch (e) {
            console.error('[webhook-queue-receiver] Background error:', e);
        }
    })();

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(backgroundWork);
    } else {
        // Fallback sem EdgeRuntime (desenvolvimento local)
        backgroundWork.catch(() => {});
    }

    return immediateResponse;
});
