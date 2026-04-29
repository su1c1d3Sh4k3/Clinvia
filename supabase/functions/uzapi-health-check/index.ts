// =====================================================
// uzapi-health-check
// =====================================================
// Itera todas as instâncias ATIVAS no DB, faz GET /instance/status na UZAPI,
// atualiza instances.status + last_health_check + last_disconnect_reason.
//
// Detecção de desconexão (qualquer um basta):
//   1. HTTP 401/403/404 → token inválido / instância não existe
//   2. campo data.instance.status / data.status normalizado para 'disconnected'
//   3. data.instance.current_presence === 'unavailable' (WhatsApp offline,
//      mesmo quando UZAPI reporta status='connected' em cache antigo)
//   4. data.instance.lastDisconnectReason populado E recente (≤7 dias) E
//      mais novo que o last_health_check anterior — captura o caso
//      "logged out from another device with recentMessage" do WhatsApp
//      Multi-Device, que NÃO altera o flag connected na UZAPI.
//
// Quando vira 'disconnected':
//   - cria notification type='instance_disconnected' (1x a cada 24h)
//   - persiste last_disconnect_reason para o banner exibir motivo amigável
//
// Quando volta para 'connected':
//   - cria notification type='instance_reconnected'
//   - limpa last_disconnect_reason e zera consecutive_send_failures
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
    last_health_check: string | null;
    restriction_active: boolean | null;
    restriction_until: string | null;
}

type HealthStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

interface PingResult {
    status: HealthStatus;
    httpCode: number;
    reason: string | null;
    raw?: unknown;
}

function mapUzapiStatus(uzapiStatus: unknown): HealthStatus {
    const s = String(uzapiStatus || '').toLowerCase();
    if (s === 'connected' || s === 'online') return 'connected';
    if (s === 'connecting' || s === 'pairing') return 'connecting';
    if (s === 'disconnected' || s === 'offline' || s === 'close') return 'disconnected';
    return 'error';
}

// Mapeia razões cruas da UZAPI para mensagens amigáveis em pt-BR
function friendlyReason(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const r = raw.toLowerCase();
    if (r.includes('logged out from another device') || r.includes('multi-device')) {
        return 'WhatsApp foi deslogado por outro dispositivo. Reconecte escaneando o QR code.';
    }
    if (r.includes('401') && r.includes('logged out')) {
        return 'Sessão do WhatsApp expirou. Reconecte escaneando o QR code.';
    }
    if (r.includes('unavailable')) {
        return 'WhatsApp está offline. Verifique o telefone e reconecte se necessário.';
    }
    if (r.includes('banned') || r.includes('blocked')) {
        return 'Número foi bloqueado pelo WhatsApp. Entre em contato com o suporte.';
    }
    return raw;
}

async function pingUzapi(serverUrl: string, apikey: string, prevHealthCheck: string | null): Promise<PingResult> {
    const url = `${serverUrl.replace(/\/$/, '')}/instance/status`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'token': apikey, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10_000),
        });

        const httpCode = response.status;

        if (httpCode === 401 || httpCode === 403 || httpCode === 404) {
            return { status: 'disconnected', httpCode, reason: `HTTP ${httpCode}: token/instância inválida na UZAPI` };
        }

        if (!response.ok) {
            return { status: 'error', httpCode, reason: `HTTP ${httpCode} da UZAPI` };
        }

        const data = await response.json().catch(() => null) as any;

        // 1) Status declarado pela UZAPI
        const declaredStatus = mapUzapiStatus(
            data?.instance?.status ?? data?.instance?.state ?? data?.status ?? data?.state,
        );

        // 2) current_presence === 'unavailable' indica WhatsApp offline na prática,
        //    mesmo que o "status" declarado pela UZAPI seja 'connected' (cache antigo).
        const currentPresence = String(data?.instance?.current_presence ?? '').toLowerCase();
        const presenceUnavailable = currentPresence === 'unavailable';

        // 3) lastDisconnectReason recente — captura logout silencioso do WhatsApp
        const lastDisconnectRaw = data?.instance?.lastDisconnect ?? null;
        const lastDisconnectReason: string | null = data?.instance?.lastDisconnectReason ?? null;
        let disconnectIsRecent = false;
        if (lastDisconnectReason && lastDisconnectRaw) {
            const dt = new Date(lastDisconnectRaw).getTime();
            if (!Number.isNaN(dt)) {
                const ageHours = (Date.now() - dt) / 3_600_000;
                const prevHealthMs = prevHealthCheck ? new Date(prevHealthCheck).getTime() : 0;
                // Recente E mais novo do que a última verificação que vimos como saudável
                disconnectIsRecent = ageHours <= 24 * 7 && dt > prevHealthMs;
            }
        }

        if (declaredStatus === 'disconnected') {
            return { status: 'disconnected', httpCode, reason: lastDisconnectReason ?? 'UZAPI reporta disconnected', raw: data };
        }

        if (presenceUnavailable) {
            return {
                status: 'disconnected',
                httpCode,
                reason: lastDisconnectReason ?? 'WhatsApp offline (current_presence=unavailable)',
                raw: data,
            };
        }

        if (disconnectIsRecent) {
            return { status: 'disconnected', httpCode, reason: lastDisconnectReason, raw: data };
        }

        return { status: declaredStatus, httpCode, reason: null, raw: data };
    } catch (err) {
        console.error(`[uzapi-health-check] ping failed for ${serverUrl}:`, err);
        return { status: 'error', httpCode: 0, reason: `ping error: ${(err as Error)?.message ?? err}` };
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
        const { data: instances, error: fetchErr } = await supabase
            .from('instances')
            .select('id, name, user_id, status, server_url, apikey, last_disconnect_notified_at, last_health_check, restriction_active, restriction_until')
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

        await Promise.all((instances as Instance[]).map(async (inst) => {
            summary.checked++;
            let ping = await pingUzapi(inst.server_url, inst.apikey, inst.last_health_check);

            // Se a instância está em RESTRIÇÃO TEMPORÁRIA ativa (RESTRICT_ALL_COMPANIONS)
            // e ainda dentro do prazo, NÃO rebaixamos para 'disconnected'. A sessão
            // UZAPI está saudável — current_presence='unavailable' é parte do estado
            // de warmup do companion, não desconexão real.
            const restrictionActive =
                inst.restriction_active === true &&
                inst.restriction_until &&
                new Date(inst.restriction_until).getTime() > Date.now();
            if (restrictionActive && ping.status === 'disconnected') {
                console.log(
                    `[uzapi-health-check] instance ${inst.id} would be disconnected, but restriction is active until ${inst.restriction_until} — keeping connected`,
                );
                ping = { ...ping, status: 'connected' as HealthStatus };
            }

            const newStatus = ping.status;
            const prevStatus = inst.status;
            const now = new Date().toISOString();

            if (newStatus === 'connected') summary.connected++;
            if (newStatus === 'disconnected') summary.disconnected++;
            if (newStatus === 'error') summary.errors++;

            const updates: Record<string, unknown> = {
                last_health_check: now,
            };
            if (newStatus !== prevStatus) {
                updates.status = newStatus;
                summary.changed++;
            }
            // Persiste motivo na desconexão; limpa em reconexão
            if (newStatus === 'disconnected' && ping.reason) {
                updates.last_disconnect_reason = friendlyReason(ping.reason);
            } else if (newStatus === 'connected' && prevStatus !== 'connected') {
                updates.last_disconnect_reason = null;
                updates.consecutive_send_failures = 0;
            }

            await supabase.from('instances').update(updates).eq('id', inst.id);

            const justDisconnected = prevStatus === 'connected' && newStatus === 'disconnected';
            const justReconnected = prevStatus !== 'connected' && newStatus === 'connected';

            if (justDisconnected) {
                const lastNotified = inst.last_disconnect_notified_at
                    ? new Date(inst.last_disconnect_notified_at).getTime()
                    : 0;
                const hoursSince = (Date.now() - lastNotified) / 3600_000;

                if (hoursSince >= 24) {
                    const friendly = friendlyReason(ping.reason) ?? 'A instância perdeu conexão com o WhatsApp.';
                    await supabase.from('notifications').insert({
                        type: 'instance_disconnected',
                        title: `Instância "${inst.name}" desconectada`,
                        description: `${friendly} Vá em Conexões e reconecte para voltar a enviar/receber mensagens.`,
                        metadata: {
                            instance_id: inst.id,
                            instance_name: inst.name,
                            http_code: ping.httpCode,
                            raw_reason: ping.reason,
                            detected_by: 'health-check',
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
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
