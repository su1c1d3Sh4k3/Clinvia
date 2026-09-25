import { serveMonitored } from "../_shared/serve-monitored.ts";
import { reportIncident, reportErroDeBanco } from "../_shared/report-incident.ts";
import {
    corsHeaders,
    createSupabaseClient,
    validateWebhookHMAC,
    checkRateLimit,
    validateWebhookPayload
} from "../_shared/utils.ts";
import {
    descreverErroMeta,
    esperaDoReenvio,
    grupoDoErroMeta,
    type GrupoErroMeta,
} from "../_shared/meta-error-codes.ts";

/**
 * Familia de componente por grupo do codigo. Decide QUEM e acordado:
 *
 * - `defeito` e `conta` sao os dois unicos casos que chegam no telefone do
 *   super admin (regra dele, 25/09/2026): um e conserto nosso, o outro para a
 *   conta inteira do cliente.
 * - `bloqueio` e `rejeitado` continuam virando incidente — a mensagem nao
 *   chegou e isso precisa ficar registrado —, mas o catalogo marca as duas
 *   familias como `somente_painel`: elas contam no resumo diario e nao acordam
 *   ninguem. Suprimir na ORIGEM, nunca na porta.
 */
const FAMILIA_POR_GRUPO: Record<GrupoErroMeta, string> = {
    passageiro: "bloqueado",
    bloqueio: "bloqueado",
    defeito: "defeito",
    conta: "conta",
    desconhecido: "rejeitado",
};

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
function reportarRejeicao(
    payload: any,
    quantas: number,
    codigo: string,
    ownerId: string | null,
): void {
    const instancia = String(payload?.instanceName ?? "").trim() || "instância desconhecida";
    const erro = payload?.erro ?? null;
    const motivo = erro?.title || erro?.details || "o provedor não informou o motivo";
    const grupo = grupoDoErroMeta(codigo);
    const familia = FAMILIA_POR_GRUPO[grupo];

    reportIncident({
        component: `envio:${familia}-${codigo} (${instancia})`,
        route: "recibo_de_falha",
        // A recusa e nossa mesmo quando quem avisa e a Meta: a mensagem, a
        // instancia e a decisao de enviar sao nossas. Marcar `webhook_externo`
        // aqui faria o titulo do alerta dizer "Humano (provedor)" e empurrar
        // para fora um problema que quase sempre se resolve deste lado.
        origem: "edge_interna",
        // Sem o dono, o campo Cliente do alerta so resolvia por parse do nome
        // da instancia entre parenteses. Agora vai explicito.
        ownerId,
        message:
            `${quantas} mensagem(ns) aceita(s) no envio e recusada(s) depois pelo provedor ` +
            `[${codigo}]: ${motivo}. O destinatário NÃO recebeu.`,
        context: { instancia, codigo, grupo, quantas },
    });
}

/**
 * Coloca na fila de reenvio a mensagem recusada por motivo PASSAGEIRO.
 *
 * O payload guardado e reconstruido a partir da propria linha de `messages`:
 * o corpo original nao fica em lugar nenhum depois do envio, e template
 * (familia 1320xx) e sempre bloqueio, entao nunca chega aqui.
 *
 * A unicidade por wamid faz a operacao ser idempotente: recibo repetido da
 * Meta nao duplica o reenvio.
 */
async function enfileirarReenvio(
    supabase: any,
    alvos: Array<{ wamid: string; messageId: string; conversationId: string | null }>,
    meta: { codigo: string; ownerId: string | null; instanceName: string },
): Promise<void> {
    const ids = alvos.map((a) => a.messageId);
    const { data: linhas, error } = await supabase
        .from('messages')
        .select('id, conversation_id, content, message_type, media_url')
        .in('id', ids);

    if (error) {
        console.error('[webhook-handle-status] Não consegui ler as mensagens para reenvio:', error);
        return;
    }

    const espera = esperaDoReenvio(1) ?? 30;
    const proxima = new Date(Date.now() + espera * 1000).toISOString();
    const porId = new Map<string, any>((linhas ?? []).map((l: any) => [l.id, l]));

    const fila = alvos
        .map((alvo) => {
            const linha = porId.get(alvo.messageId);
            if (!linha || !linha.conversation_id) return null;
            return {
                message_id: alvo.messageId,
                wamid: alvo.wamid,
                conversation_id: linha.conversation_id,
                owner_id: meta.ownerId,
                error_code: meta.codigo,
                payload: {
                    conversationId: linha.conversation_id,
                    body: linha.content ?? '',
                    messageType: linha.message_type ?? 'text',
                    mediaUrl: linha.media_url ?? undefined,
                },
                attempt: 0,
                next_attempt_at: proxima,
            };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    if (fila.length === 0) return;

    const { error: insErr } = await supabase
        .from('meta_send_retry')
        .upsert(fila, { onConflict: 'wamid', ignoreDuplicates: true });

    if (insErr) {
        console.error('[webhook-handle-status] Não consegui enfileirar o reenvio:', insErr);
        reportIncident({
            component: `envio:defeito-fila-reenvio (${meta.instanceName || 'instância desconhecida'})`,
            route: 'enfileirar_reenvio',
            origem: 'edge_interna',
            ownerId: meta.ownerId,
            error: insErr,
            message: 'Falha passageira da Meta identificada, mas o reenvio automático não pôde ser agendado.',
            context: { codigo: meta.codigo, quantas: fila.length },
        });
    } else {
        console.log('[webhook-handle-status] Reenvio agendado para', fila.length, 'mensagem(ns) em', espera, 's');
    }
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
        const applyToArchivedHistory = async (
            messageId: string,
            status: string,
            errorCode: string | null = null,
            errorTitle: string | null = null,
        ) => {
            const { data, error } = await supabase.rpc('apply_archived_message_status', {
                p_wamid: messageId,
                p_status: status,
                p_error_code: errorCode,
                p_error_title: errorTitle,
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

            // Motivo da recusa. Antes deste ponto o codigo da Meta chegava e era
            // jogado fora: o balao virava "falhou" sem dizer POR QUE, e nem o
            // atendente nem o super admin tinham como saber.
            const erroDoRecibo = payload?.erro ?? null;
            const codigo = status === 'failed'
                ? (erroDoRecibo?.code != null ? String(erroDoRecibo.code) : 'sem_codigo')
                : null;
            const traducao = codigo ? descreverErroMeta(codigo) : null;
            const grupo = codigo ? grupoDoErroMeta(codigo) : null;

            // Dono da conta: sem ele o alerta so descobre o cliente por parse do
            // nome da instancia. Falha aqui nao pode derrubar o recibo.
            let ownerId: string | null = null;
            const instanceName = String(payload?.instanceName ?? '').trim();
            if (status === 'failed' && instanceName) {
                const { data: inst, error: instErr } = await supabase
                    .from('instances')
                    .select('id, user_id')
                    .eq('instance_name', instanceName)
                    .maybeSingle();
                if (instErr) {
                    console.error('[webhook-handle-status] Erro ao resolver a instância:', instErr);
                } else if (inst) {
                    ownerId = inst.user_id ?? null;
                }
            }

            // Update each message
            let updated = 0;
            let archived = 0;
            let notFound = 0;
            // Um recibo pode trazer dezenas de wamids e o erro tende a ser o mesmo
            // para todos. Guarda o primeiro e reporta UMA vez depois do laco.
            let erroDeRecibo: unknown = null;
            const paraReenviar: Array<{ wamid: string; messageId: string; conversationId: string | null }> = [];

            for (const messageId of messageIds) {
                const patch: Record<string, unknown> = { status };
                if (status === 'failed') {
                    patch.error_code = codigo;
                    patch.error_title = traducao?.titulo ?? null;
                }

                const { data, error: updateError } = await supabase
                    .from('messages')
                    .update(patch)
                    .eq('evolution_id', messageId)
                    .select('id, conversation_id, retry_count');

                if (updateError) {
                    console.error('[webhook-handle-status] Error updating message:', messageId, updateError);
                    erroDeRecibo ??= updateError;
                } else if (data && data.length > 0) {
                    console.log('[webhook-handle-status] Updated message:', messageId, '→', status);
                    updated++;
                    if (grupo === 'passageiro') {
                        paraReenviar.push({
                            wamid: messageId,
                            messageId: data[0].id,
                            conversationId: data[0].conversation_id ?? null,
                        });
                    }
                } else if (await applyToArchivedHistory(
                    messageId, status, codigo, traducao?.titulo ?? null,
                )) {
                    // Ticket ja encerrado: nao ha para onde reenviar sem
                    // ressuscitar a conversa, entao so o motivo fica registrado.
                    archived++;
                } else {
                    console.log('[webhook-handle-status] Message not found:', messageId);
                    notFound++;
                }
            }

            // Codigo passageiro: reenvio automatico em 30s, 2min e 10min.
            // Bloqueio/regra NUNCA entra aqui — insistir em 131049 so piora a
            // qualidade do numero da clinica.
            if (paraReenviar.length > 0 && codigo) {
                await enfileirarReenvio(supabase, paraReenviar, {
                    codigo,
                    ownerId,
                    instanceName,
                });
            }

            // So reporta o que era MESMO mensagem de conversa. O recibo de um
            // wamid que nao existe em `messages` nem no historico e o alerta do
            // proprio super admin, que nao tem linha ali (o `meta-webhook`
            // reconcilia esses pelo wamid) — reportar o alerta que falhou por
            // este caminho criaria um incidente que so pode ser avisado pelo
            // canal que acabou de cair. Quem cuida daquele caso e o
            // `canal:whatsapp-alertas`, que vive fora do canal de proposito.
            if (status === 'failed' && updated + archived > 0 && codigo) {
                reportarRejeicao(payload, updated + archived, codigo, ownerId);
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
