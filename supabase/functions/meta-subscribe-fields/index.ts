// supabase/functions/meta-subscribe-fields/index.ts
// -----------------------------------------------------------------------------
// Utilitário de manutenção: garante que o app Meta está inscrito nos webhook
// fields necessários do objeto whatsapp_business_account, incluindo
// smb_message_echoes (ecos de mensagens enviadas pelo app do WhatsApp Business
// em modo coexistência). Sem essa inscrição a Meta não entrega os ecos e as
// mensagens enviadas pelo celular não aparecem no inbox.
// Chamar com Authorization: Bearer <service_role_key>.
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GRAPH_API = "https://graph.facebook.com/v21.0";

const REQUIRED_FIELDS = [
    "messages",
    "message_template_status_update",
    "smb_message_echoes",
];

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

    try {
        const appId = Deno.env.get("META_APP_ID");
        const appSecret = Deno.env.get("META_APP_SECRET");
        const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");

        if (!appId || !appSecret || !verifyToken || !supabaseUrl) {
            return json({ success: false, error: "Missing env vars" }, 500);
        }

        const appToken = `${appId}|${appSecret}`;
        const callbackUrl = `${supabaseUrl}/functions/v1/meta-webhook`;

        // Estado atual
        const beforeResp = await fetch(
            `${GRAPH_API}/${appId}/subscriptions?access_token=${appToken}`
        );
        const before = await beforeResp.json();

        const waba = (before.data || []).find(
            (s: any) => s.object === "whatsapp_business_account"
        );
        const currentFields: string[] = (waba?.fields || []).map(
            (f: any) => (typeof f === "string" ? f : f.name)
        );
        const fields = [...new Set([...currentFields, ...REQUIRED_FIELDS])];

        // Atualiza a inscrição (a Meta valida o callback com um GET de verificação)
        const body = new URLSearchParams({
            object: "whatsapp_business_account",
            callback_url: callbackUrl,
            fields: fields.join(","),
            verify_token: verifyToken,
            access_token: appToken,
        });
        const subResp = await fetch(`${GRAPH_API}/${appId}/subscriptions`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
        const subResult = await subResp.json();

        // Estado final
        const afterResp = await fetch(
            `${GRAPH_API}/${appId}/subscriptions?access_token=${appToken}`
        );
        const after = await afterResp.json();

        return json({
            success: subResp.ok && subResult.success === true,
            requested_fields: fields,
            subscribe_result: subResult,
            before: before.data || before,
            after: after.data || after,
        });
    } catch (err) {
        return json({ success: false, error: String(err?.message || err) }, 500);
    }
});

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
