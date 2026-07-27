import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * meta-verify-connection
 *
 * Verifica o estado REAL de uma instância Meta Cloud API contra o Graph API,
 * tratando falsos positivos de "connected" no banco:
 * - Token válido?
 * - Número registrado no Cloud API (platform_type = CLOUD_API)?
 * - WABA inscrito no webhook com o callback correto?
 *
 * Tenta auto-reparo (register + subscribe) antes de marcar como desconectada.
 * Atualiza instances.status conforme o resultado.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { instance_id } = await req.json();
        if (!instance_id) return json({ error: "Missing instance_id" }, 400);

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { data: instance } = await supabase
            .from("instances")
            .select("id, status, meta_access_token, meta_phone_number_id, meta_waba_id")
            .eq("id", instance_id)
            .eq("provider", "meta")
            .maybeSingle();

        if (!instance) return json({ error: "Instância Meta não encontrada" }, 404);

        const token = instance.meta_access_token;
        const phoneId = instance.meta_phone_number_id;
        const wabaId = instance.meta_waba_id;

        const checks = {
            token_valid: false,
            phone_status: null as string | null,
            registered: false,
            webhook_subscribed: false,
        };
        let repaired = false;
        let reason: string | null = null;

        // ── Check 1: token + phone status + Cloud API registration ──
        const fetchPhone = () =>
            fetch(`${GRAPH_API}/${phoneId}?fields=status,platform_type,throughput`, {
                headers: { Authorization: `Bearer ${token}` },
            });

        let phoneResp = await fetchPhone();
        if (!phoneResp.ok) {
            const errBody = await phoneResp.json().catch(() => ({}));
            const code = errBody?.error?.code;
            reason = code === 190
                ? "Token de acesso expirado ou revogado — reconecte pelo Embedded Signup"
                : `Falha ao consultar o número no Meta: ${errBody?.error?.message || phoneResp.status}`;
        } else {
            checks.token_valid = true;
            let phoneData = await phoneResp.json();
            checks.phone_status = phoneData.status || null;
            checks.registered = phoneData.platform_type === "CLOUD_API";

            // Auto-reparo: tentar registrar o número no Cloud API
            if (!checks.registered) {
                console.log("[meta-verify-connection] Not registered on Cloud API, attempting register...");
                const pin = Math.floor(100000 + Math.random() * 900000).toString();
                const regResp = await fetch(`${GRAPH_API}/${phoneId}/register`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
                });
                if (regResp.ok || regResp.status === 412) {
                    phoneResp = await fetchPhone();
                    if (phoneResp.ok) {
                        phoneData = await phoneResp.json();
                        checks.phone_status = phoneData.status || null;
                        checks.registered = phoneData.platform_type === "CLOUD_API";
                        if (checks.registered) repaired = true;
                    }
                } else {
                    const regErr = await regResp.json().catch(() => ({}));
                    console.warn("[meta-verify-connection] Register failed:", JSON.stringify(regErr));
                    reason = `Número não registrado no Cloud API: ${regErr?.error?.error_user_msg || regErr?.error?.message || "falha no registro"}`;
                }
            }

            if (checks.registered && checks.phone_status && checks.phone_status !== "CONNECTED") {
                reason = `Número com status "${checks.phone_status}" no Meta`;
            }
        }

        // ── Check 2: webhook subscription no WABA ──
        if (checks.token_valid && wabaId) {
            const expectedCallback = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-webhook`;
            const fetchSubs = () =>
                fetch(`${GRAPH_API}/${wabaId}/subscribed_apps`, {
                    headers: { Authorization: `Bearer ${token}` },
                });

            let subsResp = await fetchSubs();
            if (subsResp.ok) {
                const subsData = await subsResp.json();
                checks.webhook_subscribed = (subsData.data || []).some(
                    (s: any) => !s.override_callback_uri || s.override_callback_uri === expectedCallback
                );
            }

            // Auto-reparo: re-inscrever o webhook
            if (!checks.webhook_subscribed) {
                console.log("[meta-verify-connection] Webhook not subscribed, re-subscribing...");
                const subResp = await fetch(`${GRAPH_API}/${wabaId}/subscribed_apps`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        override_callback_uri: expectedCallback,
                        verify_token: Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "clinvia_meta_verify",
                    }),
                });
                if (subResp.ok) {
                    subsResp = await fetchSubs();
                    if (subsResp.ok) {
                        const subsData = await subsResp.json();
                        checks.webhook_subscribed = (subsData.data || []).some(
                            (s: any) => !s.override_callback_uri || s.override_callback_uri === expectedCallback
                        );
                        if (checks.webhook_subscribed) repaired = true;
                    }
                } else if (!reason) {
                    reason = "WABA não está inscrito no webhook de mensagens";
                }
            }
        }

        const connected =
            checks.token_valid &&
            checks.registered &&
            checks.webhook_subscribed &&
            (checks.phone_status === "CONNECTED" || checks.phone_status === null);

        if (!connected && !reason) {
            reason = "Conexão Meta incompleta — reconecte pelo Embedded Signup";
        }

        // ── Sincroniza status no banco ──
        const newStatus = connected ? "connected" : "disconnected";
        if (instance.status !== newStatus || repaired) {
            await supabase
                .from("instances")
                .update({
                    status: newStatus,
                    last_health_check: new Date().toISOString(),
                    ...(connected ? {} : { last_disconnect_reason: reason }),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", instance.id);
        } else {
            await supabase
                .from("instances")
                .update({ last_health_check: new Date().toISOString() })
                .eq("id", instance.id);
        }

        console.log("[meta-verify-connection]", instance.id, "connected:", connected, "repaired:", repaired, "reason:", reason);
        return json({ connected, repaired, reason, checks });
    } catch (err: any) {
        console.error("[meta-verify-connection] Error:", err);
        return json({ error: err.message }, 400);
    }
});
