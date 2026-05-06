import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// =============================================
// Instagram Log Webhook (proxy/tee)
// =============================================
// Recebe o webhook do Meta, loga o payload bruto em
// instagram_webhook_logs, e ENCAMINHA exatamente como
// veio para a função instagram-webhook (existente, intacta).
// Assim conseguimos logging sem precisar redeployar a
// função principal de 700+ linhas.
//
// Para usar: trocar a URL do webhook no Meta App Dashboard de
//   /functions/v1/instagram-webhook
// para
//   /functions/v1/instagram-log-webhook
// =============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature, x-hub-signature-256",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const TARGET_URL = `${SUPABASE_URL}/functions/v1/instagram-webhook`;

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // GET = verificação do webhook (Meta). Apenas encaminha.
    if (req.method === "GET") {
        const targetUrl = new URL(TARGET_URL);
        const incoming = new URL(req.url);
        for (const [k, v] of incoming.searchParams) {
            targetUrl.searchParams.set(k, v);
        }
        const fwd = await fetch(targetUrl.toString(), { method: "GET" });
        return new Response(await fwd.text(), {
            status: fwd.status,
            headers: { "Content-Type": fwd.headers.get("Content-Type") || "text/plain" },
        });
    }

    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const rawBody = await req.text();
    let payload: any = null;
    try {
        payload = JSON.parse(rawBody);
    } catch (_e) {
        // Mesmo se não for JSON, ainda encaminhamos
    }

    // ─── Log fire-and-forget ─────────────────────────────────────
    if (payload) {
        try {
            const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
            const entries = payload.entry || [];
            const inserts: any[] = [];
            for (const e of entries) {
                for (const evt of e.messaging || []) {
                    const evtType = evt.message?.is_echo
                        ? "echo"
                        : evt.message
                          ? "message"
                          : evt.postback
                            ? "postback"
                            : evt.reaction
                              ? "reaction"
                              : evt.referral
                                ? "referral"
                                : evt.read
                                  ? "seen"
                                  : "unknown";
                    const referralSource =
                        evt.referral?.source ||
                        evt.referral?.type ||
                        evt.message?.referral?.source ||
                        evt.postback?.referral?.source ||
                        null;
                    inserts.push({
                        sender_id: evt.sender?.id ? String(evt.sender.id) : null,
                        recipient_id: evt.recipient?.id ? String(evt.recipient.id) : null,
                        event_type: evtType,
                        has_text: !!evt.message?.text,
                        has_attachment: (evt.message?.attachments?.length ?? 0) > 0,
                        referral_source: referralSource,
                        payload: evt,
                    });
                }
            }
            if (inserts.length > 0) {
                // não-bloqueante: só logamos qualquer erro
                supabase
                    .from("instagram_webhook_logs")
                    .insert(inserts)
                    .then(({ error }: any) => {
                        if (error) console.warn("[IG-LOG] insert error:", error);
                    });
            }
        } catch (logErr) {
            console.warn("[IG-LOG] log block failed:", logErr);
        }
    }

    // ─── Forward para a função real ─────────────────────────────
    const fwdHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const sig1 = req.headers.get("x-hub-signature");
    const sig256 = req.headers.get("x-hub-signature-256");
    if (sig1) fwdHeaders["x-hub-signature"] = sig1;
    if (sig256) fwdHeaders["x-hub-signature-256"] = sig256;

    const fwd = await fetch(TARGET_URL, {
        method: "POST",
        headers: fwdHeaders,
        body: rawBody,
    });
    const respBody = await fwd.text();
    return new Response(respBody, {
        status: fwd.status,
        headers: { "Content-Type": fwd.headers.get("Content-Type") || "application/json" },
    });
});
