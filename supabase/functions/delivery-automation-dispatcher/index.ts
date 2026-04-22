// supabase/functions/delivery-automation-dispatcher/index.ts
// -----------------------------------------------------------------------------
// Daily 10:00 Brasília dispatcher for the Delivery Automation flow.
//
// Runs via pg_cron (13:00 UTC daily). Scans deliveries in stage
// 'aguardando_agendamento' whose contact_date <= today_BR, belonging to users
// with delivery_config.ai_enabled = TRUE, and that DON'T already have an
// active automation session. For each match:
//   1. Pick the first connected instance of the owner (WhatsApp sender).
//   2. Upsert a delivery_automation_sessions row (state='pending_send').
//   3. Insert a delivery_automation_jobs row (type='start') with a staggered
//      scheduled_at (+2s per match) so the worker can pace UazAPI calls.
//
// Auth: must be called with a service_role Bearer token (the cron invoker
// passes SERVICE_ROLE_KEY). Returns a count summary.
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { todayInBrasilia } from "../_shared/timezone.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth gated by verify_jwt=true at the edge runtime

    const supabase = createClient(supabaseUrl, serviceKey);

    try {
        // Optional payload for manual testing: { dryRun?: boolean, forceUserId?: string }
        const body = await req.json().catch(() => ({}));
        const dryRun: boolean = body?.dryRun === true;
        const forceUserId: string | undefined = body?.forceUserId;

        // Kill switch
        const { data: flag } = await supabase
            .from("delivery_automation_flags")
            .select("value")
            .eq("key", "enabled")
            .maybeSingle();
        if (!flag?.value && !dryRun) {
            return json({ success: true, skipped: true, reason: "kill-switch disabled" });
        }

        const today = todayInBrasilia();
        console.log(`[dispatcher] running for date=${today} (BRT)`);

        // Fetch eligible deliveries. We do this in two steps:
        //   A) pull raw deliveries + delivery_config join
        //   B) filter client-side for NOT EXISTS active session (PostgREST
        //      can't easily express NOT EXISTS across tables without RPC).

        // CRITICAL: contact_date must be EXACTLY today_BR — never past, never future.
        // Past = would spam overdue clients. Future = premature contact.
        let q = supabase
            .from("deliveries")
            .select(`
                id, user_id, patient_id, service_id, professional_id,
                contact_date, stage, appointment_id
            `)
            .eq("stage", "aguardando_agendamento")
            .eq("contact_date", today)
            .not("patient_id", "is", null)
            .not("service_id", "is", null)
            .not("professional_id", "is", null);

        if (forceUserId) q = q.eq("user_id", forceUserId);

        const { data: deliveries, error: dErr } = await q;
        if (dErr) throw dErr;

        if (!deliveries || deliveries.length === 0) {
            return json({ success: true, matched: 0, jobsCreated: 0 });
        }

        // Pull delivery_config flags for all involved users
        const userIds = Array.from(new Set(deliveries.map((d) => d.user_id)));
        const { data: configs } = await supabase
            .from("delivery_config")
            .select("user_id, ai_enabled")
            .in("user_id", userIds);
        const aiEnabledBy = new Map<string, boolean>();
        for (const c of configs || []) aiEnabledBy.set(c.user_id, c.ai_enabled === true);

        // Existing active sessions
        const deliveryIds = deliveries.map((d) => d.id);
        const { data: activeSess } = await supabase
            .from("delivery_automation_sessions")
            .select("delivery_id, state")
            .in("delivery_id", deliveryIds)
            .not("state", "in", "(completed,transferred,abandoned,failed)");
        const hasActive = new Set((activeSess || []).map((s) => s.delivery_id));

        // Resolve an instance per user (first connected)
        const { data: instances } = await supabase
            .from("instances")
            .select("id, user_id, status")
            .in("user_id", userIds)
            .eq("status", "connected");
        const instanceBy = new Map<string, string>();
        for (const i of instances || []) {
            if (!instanceBy.has(i.user_id)) instanceBy.set(i.user_id, i.id);
        }

        let matched = 0;
        let jobsCreated = 0;
        const now = Date.now();

        for (let i = 0; i < deliveries.length; i++) {
            const d = deliveries[i];
            if (!aiEnabledBy.get(d.user_id)) continue;
            if (hasActive.has(d.id)) continue;
            const instanceId = instanceBy.get(d.user_id);
            if (!instanceId) {
                console.warn(`[dispatcher] no connected instance for user=${d.user_id} — skipping delivery=${d.id}`);
                continue;
            }
            matched++;
            if (dryRun) continue;

            // Stagger 2s per job so 1000 matches spread across ~33 min.
            const scheduledAt = new Date(now + matched * 2000).toISOString();

            const { data: session, error: sErr } = await supabase
                .from("delivery_automation_sessions")
                .insert({
                    user_id: d.user_id,
                    delivery_id: d.id,
                    contact_id: null, // will be resolved at send time
                    instance_id: instanceId,
                    professional_id: d.professional_id,
                    service_id: d.service_id,
                    state: "pending_send",
                })
                .select("id")
                .single();

            if (sErr) {
                // If uq_active_session_per_delivery was violated (race vs another run),
                // just skip — the existing session will drive the flow.
                console.warn(`[dispatcher] skip delivery=${d.id}: ${sErr.message}`);
                continue;
            }

            const { error: jErr } = await supabase
                .from("delivery_automation_jobs")
                .insert({
                    user_id: d.user_id,
                    delivery_id: d.id,
                    session_id: session.id,
                    job_type: "start",
                    scheduled_at: scheduledAt,
                    payload: {},
                });
            if (jErr) {
                console.error(`[dispatcher] job insert failed for delivery=${d.id}: ${jErr.message}`);
                continue;
            }
            jobsCreated++;
        }

        return json({ success: true, matched, jobsCreated, dryRun, today });
    } catch (error) {
        console.error("[dispatcher] fatal:", error);
        return json({ success: false, error: String(error?.message || error) }, 500);
    }
});

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
