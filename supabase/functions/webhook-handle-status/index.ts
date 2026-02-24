import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
    corsHeaders,
    createSupabaseClient,
    validateWebhookHMAC,
    checkRateLimit,
    validateWebhookPayload
} from "../_shared/utils.ts";

/**
 * webhook-handle-status
 *
 * Processa eventos de atualização de status de mensagens:
 * - Read receipts (mensagem lida)
 * - Delivery receipts (mensagem entregue)
 * - ACK events
 */
serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    console.log('[webhook-handle-status] Starting...');

    try {
        // 🛡️ RATE LIMITING
        const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            req.headers.get('cf-connecting-ip') || 'unknown';
        if (!checkRateLimit(`whs:${clientIP}`, 200, 60000)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Too many requests' }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 🔐 HMAC VALIDATION
        const rawBody = await req.text();
        const webhookSecret = Deno.env.get('WEBHOOK_HMAC_SECRET');
        if (webhookSecret) {
            const signature = req.headers.get('x-webhook-signature') ||
                req.headers.get('x-hub-signature-256');
            const isValid = await validateWebhookHMAC(rawBody, signature, webhookSecret);
            if (!isValid) {
                console.warn(`[webhook-handle-status] Invalid HMAC from IP: ${clientIP}`);
                return new Response(
                    JSON.stringify({ success: false, error: 'Invalid webhook signature' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        const payload = JSON.parse(rawBody);
        const eventType = payload.EventType || payload.event || payload.type || 'unknown';

        console.log('[webhook-handle-status] Event Type:', eventType);
        console.log('[webhook-handle-status] Payload type:', payload.type);

        const supabase = createSupabaseClient();

        // Handle Read Receipts
        if (payload.type === 'ReadReceipt' || eventType === 'messages_update') {
            console.log('[webhook-handle-status] Processing Read Receipt...');
            console.log('[webhook-handle-status] State:', payload.state);

            const messageIds = payload.event?.MessageIDs || [];
            const state = payload.state; // "Delivered" or "Read"

            if (messageIds.length === 0) {
                console.log('[webhook-handle-status] No MessageIDs in payload');
                return new Response(
                    JSON.stringify({ success: true, message: "No messages to update" }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                );
            }

            // Map state to our status values
            let status: string;
            if (state === 'Read') {
                status = 'read';
            } else if (state === 'Delivered') {
                status = 'delivered';
            } else {
                console.log('[webhook-handle-status] Unknown state:', state);
                status = 'sent';
            }

            console.log('[webhook-handle-status] Mapped status:', status);

            // Update each message
            let updated = 0;
            let notFound = 0;

            for (const messageId of messageIds) {
                const { data, error: updateError } = await supabase
                    .from('messages')
                    .update({ status: status })
                    .eq('evolution_id', messageId)
                    .select('id');

                if (updateError) {
                    console.error('[webhook-handle-status] Error updating message:', messageId, updateError);
                } else if (data && data.length > 0) {
                    console.log('[webhook-handle-status] Updated message:', messageId, '→', status);
                    updated++;
                } else {
                    console.log('[webhook-handle-status] Message not found:', messageId);
                    notFound++;
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Read receipt processed",
                    updated,
                    notFound
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        // Handle ACK events (general acknowledgment)
        if (eventType === 'ack') {
            console.log('[webhook-handle-status] Processing ACK event...');
            const messageId = payload.ack?.key?.id || payload.key?.id;
            const ackStatus = payload.ack?.status || payload.status;

            if (messageId) {
                // Map ACK status: 1=sent, 2=delivered, 3=read, 4=played
                let status = 'sent';
                if (ackStatus === 2) status = 'delivered';
                else if (ackStatus >= 3) status = 'read';

                const { data, error } = await supabase
                    .from('messages')
                    .update({ status: status })
                    .eq('evolution_id', messageId)
                    .select('id');

                if (error) {
                    console.error('[webhook-handle-status] Error updating ACK:', error);
                } else if (data && data.length > 0) {
                    console.log('[webhook-handle-status] ACK updated:', messageId, '→', status);
                }
            }

            return new Response(
                JSON.stringify({ success: true, message: "ACK processed" }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        // Unknown event type for this handler
        console.log('[webhook-handle-status] Unhandled event type:', eventType);
        return new Response(
            JSON.stringify({ success: true, message: "Event type not handled by status handler" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        console.error('[webhook-handle-status] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
