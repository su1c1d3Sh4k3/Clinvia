import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { reportIncident } from "../_shared/report-incident.ts";
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-origin',
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
serveMonitored("webhook-queue-processor", async (req) => {
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

                // Eventos de conexão/status da instância → ignorar (marcar como done imediatamente)
                const IGNORED_EVENTS = ['connection', 'status.instance', 'contacts.upsert', 'contacts.update', 'presence.update', 'chats.upsert', 'chats.update', 'chats.delete'];
                if (IGNORED_EVENTS.includes(eventType)) {
                    await supabase.from('webhook_queue').update({
                        status: 'done',
                        completed_at: new Date().toISOString()
                    }).eq('id', job.id);
                    console.log(`[webhook-queue-processor] Job ${job.id} ignored (event: ${eventType})`);
                    processed++;
                    continue;
                }

                // Corpo BRUTO da Meta: o payload não está normalizado e uma
                // única entrega pode carregar várias mensagens e vários recibos.
                // Quem sabe desmontar isso é o próprio meta-webhook — devolvê-lo
                // para lá é o que evita ter uma segunda implementação do mesmo
                // desmonte, que envelheceria em separado.
                const ehMetaBruto = eventType === 'meta_raw';

                if (ehMetaBruto) {
                    targetFunction = 'meta-webhook';
                } else if (eventType === 'messages_update' || eventType === 'ack' || job.payload?.type === 'ReadReceipt') {
                    // Status updates (read receipts, ack) → webhook-handle-status
                    targetFunction = 'webhook-handle-status';
                } else {
                    // Messages (inbound/outbound) → webhook-handle-message
                    targetFunction = 'webhook-handle-message';
                }

                console.log(`[webhook-queue-processor] Routing to ${targetFunction} for event: ${eventType}`);

                const { data, error: invokeError } = await supabase.functions.invoke(targetFunction, {
                    body: job.payload,
                    // `x-fila-id` diz ao meta-webhook "você já está na fila": ele
                    // pula a gravação bruta (senão o reprocessamento criaria uma
                    // linha nova a cada volta) e não mexe no status, porque quem
                    // conta `attempts` é este laço.
                    ...(ehMetaBruto ? { headers: { 'x-fila-id': job.id } } : {}),
                });


                if (invokeError) {
                    throw new Error(invokeError.message);
                }

                // CRÍTICO: validar success semântico, não só HTTP status.
                // Antes, o handler podia retornar { success: false } com HTTP 500
                // (msgError) e o processor marcava como done — a mensagem sumia.
                // Agora qualquer { success: false } dispara retry/failed.
                if (data && data.success === false) {
                    const errMsg = data.message || data.error || 'Handler reported success=false';
                    throw new Error(`[handler ${targetFunction}] ${errMsg}`);
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

                // 5. Determinar status: retry ou failed (incrementar attempts SEMPRE)
                const newAttempts = (job.attempts || 0) + 1;
                const newStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

                await supabase
                    .from('webhook_queue')
                    .update({
                        status: newStatus,
                        attempts: newAttempts,
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
        reportIncident({ route: "batch", httpCode: 500, error: e });
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
