import { serveMonitored } from "../_shared/serve-monitored.ts";
import { reportIncident, reportErroDeBanco } from "../_shared/report-incident.ts";
import {
    corsHeaders,
    createSupabaseClient,
    validateWebhookHMAC,
    checkRateLimit,
    validateWebhookPayload
} from "../_shared/utils.ts";

/**
 * Codigos em que a recusa NAO e defeito nosso: o destinatario nao pode receber,
 * ou a politica da Meta barrou aquela mensagem especifica. Continuam virando
 * incidente — a mensagem nao chegou, e isso e um fato que o dono da conta
 * precisa ver — mas numa familia de componente propria, porque o primeiro
 * respondente e outro e a gravidade padrao e outra.
 */
const RECUSA_DO_DESTINATARIO = new Set([
    "131026", // mensagem nao entregavel (numero nao tem WhatsApp / recusou)
    "131047", // precisa reengajar: passaram 24h desde a ultima resposta
    "131049", // limite por usuario do "healthy ecosystem" (marketing)
    "131051", // tipo de mensagem nao suportado pelo destinatario
    "130472", // usuario em experimento da Meta
]);

/**
 * Mensagem que o provedor ACEITOU no envio e derrubou depois.
 *
 * POR QUE ISTO EXISTE: nada neste caminho responde 5xx. A Meta devolve 200 com
 * wamid real no envio, o recibo de falha chega minutos depois por webhook e
 * este handler responde 200 — entao o `serveMonitored`, que so reporta >= 500,
 * nunca ve. Medido em 24/09/2026: 9 mensagens morreram assim num unico dia,
 * numa unica conta, e o painel ficou verde o dia inteiro enquanto o cliente
 * final nao recebia nada. "Nao chegou ao cliente" e exatamente a falha que o
 * monitoramento existe para pegar.
 *
 * O componente carrega o codigo do provedor E a instancia entre parenteses:
 * o codigo separa "numero bloqueado" de "template pausado" em incidentes
 * distintos (problemas diferentes nao podem somar no mesmo contador), e a
 * instancia entre parenteses e o que faz o titulo do alerta descobrir de qual
 * cliente se trata, pela mesma cadeia que o `alert-notify` ja usa.
 */
function reportarRejeicao(payload: any, quantas: number): void {
    const instancia = String(payload?.instanceName ?? "").trim() || "instância desconhecida";
    const erro = payload?.erro ?? null;
    const codigo = erro?.code != null ? String(erro.code) : "sem_codigo";
    const motivo = erro?.title || erro?.details || "o provedor não informou o motivo";
    const familia = RECUSA_DO_DESTINATARIO.has(codigo) ? "bloqueado" : "rejeitado";

    reportIncident({
        component: `envio:${familia}-${codigo} (${instancia})`,
        route: "recibo_de_falha",
        // A recusa e nossa mesmo quando quem avisa e a Meta: a mensagem, a
        // instancia e a decisao de enviar sao nossas. Marcar `webhook_externo`
        // aqui faria o titulo do alerta dizer "Humano (provedor)" e empurrar
        // para fora um problema que quase sempre se resolve deste lado.
        origem: "edge_interna",
        message:
            `${quantas} mensagem(ns) aceita(s) no envio e recusada(s) depois pelo provedor ` +
            `[${codigo}]: ${motivo}. O destinatário NÃO recebeu.`,
        context: { instancia, codigo, quantas },
    });
}

/**
 * webhook-handle-status
 *
 * Processa eventos de atualização de status de mensagens:
 * - Read receipts (mensagem lida)
 * - Delivery receipts (mensagem entregue)
 * - ACK events
 */
serveMonitored("webhook-handle-status", async (req) => {
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

        /**
         * Ticket encerrado arquiva as mensagens em conversations.messages_history e
         * apaga as linhas de messages. O recibo da Meta chega depois disso, entao o
         * UPDATE acima nao acha nada — aplica o status direto no historico.
         */
        const applyToArchivedHistory = async (messageId: string, status: string) => {
            const { data, error } = await supabase.rpc('apply_archived_message_status', {
                p_wamid: messageId,
                p_status: status,
            });
            if (error) {
                console.error('[webhook-handle-status] Error patching history:', messageId, error);
                return false;
            }
            if (data === true) {
                console.log('[webhook-handle-status] Patched archived message:', messageId, '→', status);
            }
            return data === true;
        };

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
            } else if (state === 'Failed') {
                status = 'failed';
            } else {
                console.log('[webhook-handle-status] Unknown state:', state);
                status = 'sent';
            }

            console.log('[webhook-handle-status] Mapped status:', status);

            // Update each message
            let updated = 0;
            let archived = 0;
            let notFound = 0;
            // Um recibo pode trazer dezenas de wamids e o erro tende a ser o mesmo
            // para todos. Guarda o primeiro e reporta UMA vez depois do laco.
            let erroDeRecibo: unknown = null;

            for (const messageId of messageIds) {
                const { data, error: updateError } = await supabase
                    .from('messages')
                    .update({ status: status })
                    .eq('evolution_id', messageId)
                    .select('id');

                if (updateError) {
                    console.error('[webhook-handle-status] Error updating message:', messageId, updateError);
                    erroDeRecibo ??= updateError;
                } else if (data && data.length > 0) {
                    console.log('[webhook-handle-status] Updated message:', messageId, '→', status);
                    updated++;
                } else if (await applyToArchivedHistory(messageId, status)) {
                    archived++;
                } else {
                    console.log('[webhook-handle-status] Message not found:', messageId);
                    notFound++;
                }
            }

            // So reporta o que era MESMO mensagem de conversa. O recibo de um
            // wamid que nao existe em `messages` nem no historico e o alerta do
            // proprio super admin, que nao tem linha ali (o `meta-webhook`
            // reconcilia esses pelo wamid) — reportar o alerta que falhou por
            // este caminho criaria um incidente que so pode ser avisado pelo
            // canal que acabou de cair. Quem cuida daquele caso e o
            // `canal:whatsapp-alertas`, que vive fora do canal de proposito.
            if (status === 'failed' && updated + archived > 0) {
                reportarRejeicao(payload, updated + archived);
            }

            // Familia PROPRIA, `recibo:`, e nao `recebimento:`. O que se perde
            // aqui e o comprovante de entrega de uma mensagem que JA existe e JA
            // saiu — o balao fica em "enviada" quando deveria dizer "lida". Nao
            // ha mensagem de paciente em risco, entao isto e painel, nao telefone.
            if (erroDeRecibo) {
                reportErroDeBanco({
                    familia: 'recibo:banco-',
                    route: 'atualizar_status',
                    error: erroDeRecibo,
                    instancia: String(payload?.instanceName ?? '').trim() || null,
                    ignorar: [],
                    context: { status, quantos: messageIds.length },
                });
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Read receipt processed",
                    updated,
                    archived,
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
                } else {
                    await applyToArchivedHistory(messageId, status);
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
