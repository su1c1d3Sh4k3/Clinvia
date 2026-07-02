import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * meta-embedded-signup
 *
 * Handles the OAuth callback from Meta Embedded Signup:
 * 1. Exchanges code for access_token
 * 2. Registers phone number for Cloud API
 * 3. Subscribes WABA to webhooks
 * 4. Saves instance in DB
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const body = await req.json();
        const { code, waba_id, phone_number_id, user_id, instance_name } = body;

        if (!code) throw new Error("Missing field: code");
        if (!waba_id) throw new Error("Missing field: waba_id");
        if (!phone_number_id) throw new Error("Missing field: phone_number_id");
        if (!user_id) throw new Error("Missing field: user_id");

        const appId = Deno.env.get("META_APP_ID");
        const appSecret = Deno.env.get("META_APP_SECRET");
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");

        if (!appId || !appSecret) {
            throw new Error("META_APP_ID or META_APP_SECRET not configured");
        }

        // ── Step 1: Exchange code for access_token ──
        console.log("[meta-embedded-signup] Exchanging code for access_token...");

        const tokenResp = await fetch(
            `${GRAPH_API}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`
        );

        if (!tokenResp.ok) {
            const err = await tokenResp.text();
            console.error("[meta-embedded-signup] Token exchange failed:", err);
            throw new Error(`Token exchange failed: ${err}`);
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            throw new Error("No access_token returned from Meta");
        }

        console.log("[meta-embedded-signup] Got access_token");

        // ── Step 2: Get phone number details ──
        const phoneResp = await fetch(
            `${GRAPH_API}/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        let displayPhoneNumber = "";
        let verifiedName = "";

        if (phoneResp.ok) {
            const phoneData = await phoneResp.json();
            displayPhoneNumber = phoneData.display_phone_number || "";
            verifiedName = phoneData.verified_name || "";
            console.log("[meta-embedded-signup] Phone:", displayPhoneNumber, "Name:", verifiedName);
        }

        // ── Step 3: Register phone number for Cloud API ──
        console.log("[meta-embedded-signup] Registering phone number...");

        const pin = Math.floor(100000 + Math.random() * 900000).toString();

        const registerResp = await fetch(
            `${GRAPH_API}/${phone_number_id}/register`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    pin,
                }),
            }
        );

        if (!registerResp.ok) {
            const regErr = await registerResp.text();
            // 412 = already registered (ok to continue)
            if (registerResp.status !== 412) {
                console.warn("[meta-embedded-signup] Registration response:", registerResp.status, regErr);
            }
        }

        console.log("[meta-embedded-signup] Phone registered (or already registered)");

        // ── Step 4: Subscribe WABA to webhooks ──
        console.log("[meta-embedded-signup] Subscribing to webhooks...");

        const webhookUrl = `${supabaseUrl}/functions/v1/meta-webhook`;

        const subResp = await fetch(
            `${GRAPH_API}/${waba_id}/subscribed_apps`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    override_callback_uri: webhookUrl,
                    verify_token: verifyToken || "clinvia_meta_verify",
                }),
            }
        );

        if (!subResp.ok) {
            const subErr = await subResp.text();
            console.warn("[meta-embedded-signup] Webhook subscription warning:", subErr);
        } else {
            console.log("[meta-embedded-signup] Webhook subscribed");
        }

        // ── Step 5: Check for existing instance ──
        const { data: existing } = await supabase
            .from("instances")
            .select("id")
            .eq("meta_phone_number_id", phone_number_id)
            .eq("provider", "meta")
            .maybeSingle();

        if (existing) {
            // Update existing instance
            const { data: updated, error: updateError } = await supabase
                .from("instances")
                .update({
                    meta_access_token: accessToken,
                    meta_waba_id: waba_id,
                    status: "connected",
                    phone: displayPhoneNumber,
                    user_name: verifiedName,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id)
                .select()
                .single();

            if (updateError) throw updateError;

            return new Response(
                JSON.stringify({
                    success: true,
                    instance_id: updated.id,
                    phone: displayPhoneNumber,
                    name: verifiedName,
                    updated: true,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── Step 6: Create default queue if needed ──
        let defaultQueueId = null;
        const { data: queue } = await supabase
            .from("queues")
            .select("id")
            .eq("user_id", user_id)
            .eq("name", "Atendimento Humano")
            .maybeSingle();

        if (queue) {
            defaultQueueId = queue.id;
        } else {
            const { data: newQueue } = await supabase
                .from("queues")
                .insert({ user_id, name: "Atendimento Humano", is_active: true })
                .select()
                .single();
            defaultQueueId = newQueue?.id || null;
        }

        // ── Step 7: Create new instance ──
        const finalName = instance_name || verifiedName || `Meta ${displayPhoneNumber}`;
        const sanitizedInstanceName = `meta-${phone_number_id}`;

        const { data: newInstance, error: insertError } = await supabase
            .from("instances")
            .insert({
                user_id,
                name: finalName,
                instance_name: sanitizedInstanceName,
                server_url: "https://graph.facebook.com",
                apikey: accessToken,
                provider: "meta",
                meta_waba_id: waba_id,
                meta_phone_number_id: phone_number_id,
                meta_access_token: accessToken,
                status: "connected",
                phone: displayPhoneNumber,
                user_name: verifiedName,
                default_queue_id: defaultQueueId,
                webhook_url: webhookUrl,
            })
            .select()
            .single();

        if (insertError) {
            console.error("[meta-embedded-signup] Insert error:", insertError);
            throw insertError;
        }

        console.log("[meta-embedded-signup] Instance created:", newInstance.id);

        return new Response(
            JSON.stringify({
                success: true,
                instance_id: newInstance.id,
                phone: displayPhoneNumber,
                name: verifiedName,
                waba_id,
                phone_number_id,
            }),
            { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("[meta-embedded-signup] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
