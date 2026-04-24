// =====================================================
// uzapi-health-check
// =====================================================
// Itera todas as instâncias ATIVAS no DB, faz ping em GET /instance/status
// na UZAPI, atualiza instances.status + last_health_check.
//
// Quando o status muda para 'disconnected':
//   - cria notification type='instance_disconnected' (1x a cada 24h por instância)
//
// Quando o status muda de volta para 'connected':
//   - cria notification type='instance_reconnected'
//
// Invocado pelo cron a cada 10 minutos.
// =====================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Instance {
    id: string;
    name: string;
    user_id: string;
    status: string;
    server_url: string;
    apikey: string;
    last_disconnect_notified_at: string | null;
}

// Mapa UZAPI status → enum instance_status
function mapUzapiStatus(uzapiStatus: unknown): 'connected' | 'disconnected' | 'connecting' | 'error' {
    const s = String(uzapiStatus || '').toLowerCase();
    if (s === 'connected' || s === 'online') return 'connected';
    if (s === 'connecting' || s === 'pairing') return 'connecting';
    if (s === 'disconnected' || s === 'offline' || s === 'close') return 'disconnected';
    return 'error';
}

// Ping UZAPI /instance/status. Retorna status normalizado ou 'disconnected'/'error'.
async function pingUzapi(
    serverUrl: string, apikey: string,
): Promise<{ status: 'connected' | 'disconnected' | 'connecting' | 'error'; httpCode: number; raw?: unknown }> {
    const url = `${serverUrl.replace(/\/$/, '')}/instance/status`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'token': apikey,
                'Content-Type': 'application/json',
            },
            // Evita travar o cron em instâncias mortas
            signal: AbortSignal.timeout(10_000),
        });

        const httpCode = response.status;

        if (httpCode === 401 || httpCode === 403 || httpCode === 404) {
            // Token inválido ou instância não existe → disconnected
            return { status: 'disconnected', httpCode };
        }

        if (!response.ok) {
            return { status: 'error', httpCode };
        }

        const data = await response.json().catch(() => null);
        const uzapiStatus = data?.instance?.status
            ?? data?.instance?.state
            ?? data?.status
            ?? data?.state;

        return { status: mapUzapiStatus(uzapiStatus), httpCode, raw: data };
    } catch (err) {
        console.error(`[uzapi-health-check] ping failed for ${serverUrl}:`, err);
        return { status: 'error', httpCode: 0 };
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    try {
        // Busca todas as instâncias que têm apikey (pulamos "órfãs")
        const { data: instances, error: fetchErr } = await supabase
            .from('instances')
            .select('id, name, user_id, status, server_url, apikey, last_disconnect_notified_at')
            .not('apikey', 'is', null)
            .not('server_url', 'is', null);

        if (fetchErr) throw fetchErr;
        if (!instances || instances.length === 0) {
            return new Response(JSON.stringify({ checked: 0, summary: {} }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const summary = {
            checked: 0,
            connected: 0,
            disconnected: 0,
            changed: 0,
            notifications_created: 0,
            errors: 0,
        };

        // Processa em paralelo (com limite implícito pelo timeout individual)
        await Promise.all((instances as Instance[]).map(async (inst) => {
            summary.checked++;
            const ping = await pingUzapi(inst.server_url, inst.apikey);

            const newStatus = ping.status;
            const prevStatus = inst.status;
            const now = new Date().toISOString();

            if (newStatus === 'connected') summary.connected++;
            if (newStatus === 'disconnected') summary.disconnected++;
            if (newStatus === 'error') summary.errors++;

            // Atualiza status + last_health_check SEMPRE
            const updates: Record<string, unknown> = {
                last_health_check: now,
            };
            if (newStatus !== prevStatus) {
                updates.status = newStatus;
                summary.changed++;
            }

            await supabase.from('instances').update(updates).eq('id', inst.id);

            // Notificações: só em transições de estado
            const justDisconnected = prevStatus === 'connected' && newStatus === 'disconnected';
            const justReconnected = prevStatus !== 'connected' && newStatus === 'connected';

            if (justDisconnected) {
                // Evita spam: só notifica se não notificou nas últimas 24h
                const lastNotified = inst.last_disconnect_notified_at
                    ? new Date(inst.last_disconnect_notified_at).getTime()
                    : 0;
                const hoursSince = (Date.now() - lastNotified) / 3600_000;

                if (hoursSince >= 24) {
                    await supabase.from('notifications').insert({
                        type: 'instance_disconnected',
                        title: `Instância "${inst.name}" desconectada`,
                        description:
                            `A instância ${inst.name} perdeu conexão com o WhatsApp. ` +
                            `Vá em Conexões e reconecte para voltar a enviar/receber mensagens.`,
                        metadata: {
                            instance_id: inst.id,
                            instance_name: inst.name,
                            http_code: ping.httpCode,
                        },
                        related_user_id: inst.user_id,
                    });
                    await supabase
                        .from('instances')
                        .update({ last_disconnect_notified_at: now })
                        .eq('id', inst.id);
                    summary.notifications_created++;
                }
            }

            if (justReconnected) {
                await supabase.from('notifications').insert({
                    type: 'instance_reconnected',
                    title: `Instância "${inst.name}" reconectada`,
                    description: `A instância ${inst.name} voltou a funcionar.`,
                    metadata: { instance_id: inst.id, instance_name: inst.name },
                    related_user_id: inst.user_id,
                });
                summary.notifications_created++;
            }
        }));

        console.log('[uzapi-health-check] summary:', JSON.stringify(summary));

        return new Response(
            JSON.stringify({ success: true, summary }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err) {
        console.error('[uzapi-health-check] fatal:', err);
        return new Response(
            JSON.stringify({ success: false, error: String(err) }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
        );
    }
});
