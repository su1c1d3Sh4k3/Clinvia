import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * meta-embedded-signup
 *
 * Handles the OAuth callback from Meta Embedded Signup.
 *
 * Supports TWO flows:
 * - GET: OAuth redirect (Meta redirects here with ?code=xxx)
 *   - Auto-discovers WABA and phone numbers from the token
 *   - Redirects user back to frontend /connections?meta_signup=success
 * - POST: Frontend API call (legacy, with explicit waba_id/phone_number_id)
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";
const FRONTEND_URL = "https://app.clinbia.ai";

async function processSignup(
    supabase: any,
    code: string,
    wabaId: string | null,
    phoneNumberId: string | null,
    userId: string | null
) {
    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const verifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");

    if (!appId || !appSecret) {
        throw new Error("META_APP_ID or META_APP_SECRET not configured");
    }

    // ── Step 1: Exchange code for access_token ──
    console.log("[meta-embedded-signup] Exchanging code for access_token...");

    const redirectUri = `${supabaseUrl}/functions/v1/meta-embedded-signup`;
    const tokenResp = await fetch(
        `${GRAPH_API}/oauth/access_token` +
        `?client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&code=${code}`
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

    // ── Step 2: Auto-discover WABA and phone number if not provided ──
    if (!wabaId || !phoneNumberId) {
        console.log("[meta-embedded-signup] Auto-discovering WABA and phone numbers...");

        // Get shared WABAs for this business
        const debugResp = await fetch(
            `${GRAPH_API}/debug_token?input_token=${accessToken}`,
            { headers: { Authorization: `Bearer ${appId}|${appSecret}` } }
        );

        if (debugResp.ok) {
            const debugData = await debugResp.json();
            const granularScopes = debugData.data?.granular_scopes || [];
            console.log("[meta-embedded-signup] Granular scopes:", JSON.stringify(granularScopes));

            // Find whatsapp_business_management scope for WABA IDs
            const wabaMgmt = granularScopes.find(
                (s: any) => s.scope === "whatsapp_business_management"
            );
            if (wabaMgmt?.target_ids?.length > 0 && !wabaId) {
                wabaId = wabaMgmt.target_ids[0];
                console.log("[meta-embedded-signup] Discovered WABA ID:", wabaId);
            }

            // Find whatsapp_business_messaging scope for phone number IDs
            const wabaMsg = granularScopes.find(
                (s: any) => s.scope === "whatsapp_business_messaging"
            );
            if (wabaMsg?.target_ids?.length > 0 && !phoneNumberId) {
                phoneNumberId = wabaMsg.target_ids[0];
                console.log("[meta-embedded-signup] Discovered Phone Number ID:", phoneNumberId);
            }
        }

        // Fallback: query WABA phone numbers directly
        if (wabaId && !phoneNumberId) {
            const phonesResp = await fetch(
                `${GRAPH_API}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (phonesResp.ok) {
                const phonesData = await phonesResp.json();
                if (phonesData.data?.length > 0) {
                    phoneNumberId = phonesData.data[0].id;
                    console.log("[meta-embedded-signup] Got phone from WABA:", phoneNumberId);
                }
            }
        }
    }

    if (!wabaId) throw new Error("Could not determine WABA ID");
    if (!phoneNumberId) throw new Error("Could not determine Phone Number ID");

    // ── Step 3: Get phone number details ──
    const phoneResp = await fetch(
        `${GRAPH_API}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
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

    // ── Step 4: Register phone number for Cloud API ──
    console.log("[meta-embedded-signup] Registering phone number...");
    const pin = Math.floor(100000 + Math.random() * 900000).toString();

    const registerResp = await fetch(
        `${GRAPH_API}/${phoneNumberId}/register`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messaging_product: "whatsapp", pin }),
        }
    );

    if (!registerResp.ok) {
        const regErr = await registerResp.text();
        if (registerResp.status !== 412) {
            console.warn("[meta-embedded-signup] Registration response:", registerResp.status, regErr);
        }
    }
    console.log("[meta-embedded-signup] Phone registered (or already registered)");

    // ── Step 5: Subscribe WABA to webhooks ──
    const webhookUrl = `${supabaseUrl}/functions/v1/meta-webhook`;

    const subResp = await fetch(
        `${GRAPH_API}/${wabaId}/subscribed_apps`,
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

    // ── Step 6: Check for existing instance ──
    const { data: existing } = await supabase
        .from("instances")
        .select("id")
        .eq("meta_phone_number_id", phoneNumberId)
        .eq("provider", "meta")
        .maybeSingle();

    if (existing) {
        const { data: updated, error: updateError } = await supabase
            .from("instances")
            .update({
                meta_access_token: accessToken,
                meta_waba_id: wabaId,
                status: "connected",
                phone: displayPhoneNumber,
                user_name: verifiedName,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();

        if (updateError) throw updateError;

        return {
            success: true,
            instance_id: updated.id,
            phone: displayPhoneNumber,
            name: verifiedName,
            updated: true,
        };
    }

    // ── Step 7: Find or create owner user ──
    // If no user_id provided (GET flow), find the first admin user
    if (!userId) {
        const { data: adminUser } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("role", "admin")
            .limit(1)
            .single();
        userId = adminUser?.user_id || null;

        if (!userId) {
            // Fallback: get any user that has instances
            const { data: anyInstance } = await supabase
                .from("instances")
                .select("user_id")
                .limit(1)
                .single();
            userId = anyInstance?.user_id || null;
        }
    }

    if (!userId) throw new Error("Could not determine user_id for new instance");

    // ── Step 8: Create default queue if needed ──
    let defaultQueueId = null;
    const { data: queue } = await supabase
        .from("queues")
        .select("id")
        .eq("user_id", userId)
        .eq("name", "Atendimento Humano")
        .maybeSingle();

    if (queue) {
        defaultQueueId = queue.id;
    } else {
        const { data: newQueue } = await supabase
            .from("queues")
            .insert({ user_id: userId, name: "Atendimento Humano", is_active: true })
            .select()
            .single();
        defaultQueueId = newQueue?.id || null;
    }

    // ── Step 9: Create new instance ──
    const finalName = verifiedName || `Meta ${displayPhoneNumber}`;
    const sanitizedInstanceName = `meta-${phoneNumberId}`;

    const { data: newInstance, error: insertError } = await supabase
        .from("instances")
        .insert({
            user_id: userId,
            name: finalName,
            instance_name: sanitizedInstanceName,
            server_url: "https://graph.facebook.com",
            apikey: accessToken,
            provider: "meta",
            meta_waba_id: wabaId,
            meta_phone_number_id: phoneNumberId,
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

    return {
        success: true,
        instance_id: newInstance.id,
        phone: displayPhoneNumber,
        name: verifiedName,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
    };
}

// ── Main handler ──

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // ── GET: OAuth redirect from Meta ──
    if (req.method === "GET") {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
            const errorDesc = url.searchParams.get("error_description") || error;
            console.error("[meta-embedded-signup] OAuth error:", errorDesc);
            return Response.redirect(
                `${FRONTEND_URL}/connections?meta_signup=error&message=${encodeURIComponent(errorDesc)}`,
                302
            );
        }

        if (!code) {
            return Response.redirect(
                `${FRONTEND_URL}/connections?meta_signup=error&message=${encodeURIComponent("No authorization code received")}`,
                302
            );
        }

        // Extract user_id from OAuth state parameter
        let stateUserId: string | null = null;
        const stateParam = url.searchParams.get("state");
        if (stateParam) {
            try {
                const decoded = JSON.parse(atob(stateParam));
                stateUserId = decoded.user_id || null;
                console.log("[meta-embedded-signup] Got user_id from state:", stateUserId);
            } catch {
                console.warn("[meta-embedded-signup] Could not parse state parameter");
            }
        }

        try {
            const supabase = createClient(
                Deno.env.get("SUPABASE_URL") ?? "",
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
            );

            const result = await processSignup(supabase, code, null, null, stateUserId);

            console.log("[meta-embedded-signup] GET flow completed:", result.instance_id);

            return Response.redirect(
                `${FRONTEND_URL}/connections?meta_signup=success&phone=${encodeURIComponent(result.phone || '')}&name=${encodeURIComponent(result.name || '')}`,
                302
            );
        } catch (err: any) {
            console.error("[meta-embedded-signup] GET flow error:", err);
            return Response.redirect(
                `${FRONTEND_URL}/connections?meta_signup=error&message=${encodeURIComponent(err.message)}`,
                302
            );
        }
    }

    // ── POST: Frontend API call ──
    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const body = await req.json();
        const { code, waba_id, phone_number_id, user_id } = body;

        if (!code) throw new Error("Missing field: code");
        if (!user_id) throw new Error("Missing field: user_id");

        const result = await processSignup(supabase, code, waba_id || null, phone_number_id || null, user_id);

        return new Response(
            JSON.stringify(result),
            { status: result.updated ? 200 : 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("[meta-embedded-signup] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
