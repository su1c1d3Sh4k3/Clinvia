import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

/**
 * webhook-queue-processor
 * 
 * Processa a fila de webhooks em lotes.
 * Deve ser chamado periodicamente via CRON (a cada 30s).
 * 
 * Para cada item na fila:
 * 1. Marca como 'processing'
 * 2. Invoca a lógica de processamento
 * 3. Marca como 'done' ou 'failed'
 */
serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const startTime = Date.now();
    console.log('[webhook-queue-processor] Starting batch processing...');

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
        // 1. ATOMIC: Claim jobs by updating status to 'processing' with a WHERE clause
        // This prevents race conditions where multiple processors try to grab the same job
        // The key is: only jobs with status='pending' will be updated
        const { data: claimedJobs, error: claimError } = await supabase
            .from('webhook_queue')
            .update({
                status: 'processing',
                started_at: new Date().toISOString()
            })
            .eq('status', 'pending')
            .lt('attempts', MAX_ATTEMPTS)
            .order('created_at', { ascending: true })
            .limit(BATCH_SIZE)
            .select();

        if (claimError) {
            console.error('[webhook-queue-processor] Error claiming jobs:', claimError);
            return new Response(JSON.stringify({ success: false, error: claimError.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const jobs = claimedJobs || [];

        if (jobs.length === 0) {
            console.log('[webhook-queue-processor] No pending jobs to claim');
            return new Response(JSON.stringify({
                success: true,
                processed: 0,
                message: 'No pending jobs'
            }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        console.log(`[webhook-queue-processor] Claimed ${jobs.length} jobs atomically`);

        let processed = 0;
        let failed = 0;

        for (const job of jobs) {
            console.log(`[webhook-queue-processor] Processing job ${job.id} (attempt ${(job.attempts || 0) + 1})`);

            try {
                // 3. Rotear por tipo de evento para funções especializadas
                const eventType = job.event_type || job.payload?.EventType || job.payload?.event || 'messages';
                let targetFunction: string;

                // Status updates (read receipts, ack) → webhook-handle-status
                if (eventType === 'messages_update' || eventType === 'ack' || job.payload?.type === 'ReadReceipt') {
                    targetFunction = 'webhook-handle-status';
                } else {
                    // Messages (inbound/outbound) → webhook-handle-message
                    targetFunction = 'webhook-handle-message';
                }

                console.log(`[webhook-queue-processor] Routing to ${targetFunction} for event: ${eventType}`);

                const { data, error: invokeError } = await supabase.functions.invoke(targetFunction, {
                    body: job.payload
                });


                if (invokeError) {
                    throw new Error(invokeError.message);
                }

                // 4. Marcar como 'done'
                await supabase
                    .from('webhook_queue')
                    .update({
                        status: 'done',
                        completed_at: new Date().toISOString()
                    })
                    .eq('id', job.id);

                console.log(`[webhook-queue-processor] Job ${job.id} completed successfully`);
                processed++;

            } catch (e: any) {
                console.error(`[webhook-queue-processor] Error processing job ${job.id}:`, e);

                // 5. Determinar status: retry ou failed
                const newStatus = job.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';

                await supabase
                    .from('webhook_queue')
                    .update({
                        status: newStatus,
                        error_message: e.message || String(e)
                    })
                    .eq('id', job.id);

                if (newStatus === 'failed') {
                    console.log(`[webhook-queue-processor] Job ${job.id} moved to FAILED after ${MAX_ATTEMPTS} attempts`);
                    failed++;
                } else {
                    console.log(`[webhook-queue-processor] Job ${job.id} will be retried`);
                }
            }
        }

        const elapsed = Date.now() - startTime;
        console.log(`[webhook-queue-processor] Finished in ${elapsed}ms. Processed: ${processed}, Failed: ${failed}`);

        return new Response(JSON.stringify({
            success: true,
            processed,
            failed,
            time_ms: elapsed
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        console.error('[webhook-queue-processor] Exception:', e);
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
