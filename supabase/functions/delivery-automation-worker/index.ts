// supabase/functions/delivery-automation-worker/index.ts
// -----------------------------------------------------------------------------
// Per-minute worker for Delivery Automation jobs.
//
// Picks up ready jobs atomically via the `pick_delivery_automation_job` RPC
// (FOR UPDATE SKIP LOCKED). Dispatches:
//   - 'start' → send Step-1 day-of-week buttons, mark session 'awaiting_day'
//   - 'advance' → re-enter the flow at the session's current state (used for
//     rollover recomputes triggered by the respond handler)
//
// Budget: ~120s per invocation, cap 50 jobs/invocation with a 200ms pause
// between sends (= 5 msgs/sec).
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { sendMenu, sendText, type MenuButton } from "../_shared/uazapi-menu.ts";
import { todayInBrasilia, type Weekday } from "../_shared/timezone.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEADLINE_MS = 120_000;
const JOB_CAP = 50;
const SEND_PAUSE_MS = 200;

type WeekdayIndex = 1 | 2 | 3 | 4 | 5;
const DAY_BUTTONS: Record<WeekdayIndex, { text: string; weekday: Weekday }> = {
    1: { text: "Segunda-feira", weekday: 1 },
    2: { text: "Terça-feira", weekday: 2 },
    3: { text: "Quarta-feira", weekday: 3 },
    4: { text: "Quinta-feira", weekday: 4 },
    5: { text: "Sexta-feira", weekday: 5 },
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth gated by verify_jwt=true at the edge runtime

    const supabase = createClient(supabaseUrl, serviceKey);

    // Kill switch
    const { data: flag } = await supabase
        .from("delivery_automation_flags")
        .select("value")
        .eq("key", "enabled")
        .maybeSingle();
    if (!flag?.value) {
        return json({ success: true, skipped: true, reason: "kill-switch disabled" });
    }

    const started = Date.now();
    let processed = 0;
    let errors = 0;

    while (Date.now() - started < DEADLINE_MS && processed < JOB_CAP) {
        const { data: job, error: pickErr } = await supabase.rpc("pick_delivery_automation_job");
        if (pickErr) {
            console.error("[worker] pick RPC error:", pickErr.message);
            errors++;
            break;
        }
        if (!job) break; // no more ready jobs

        try {
            await dispatchJob(supabase, job);
            await supabase
                .from("delivery_automation_jobs")
                .update({ status: "done", finished_at: new Date().toISOString() })
                .eq("id", job.id);
            processed++;
        } catch (err) {
            errors++;
            const msg = String(err?.message || err);
            console.error(`[worker] job ${job.id} failed:`, msg);
            const attempts = job.attempts as number;
            if (attempts < 3) {
                // Requeue with +30s backoff
                const retryAt = new Date(Date.now() + 30_000).toISOString();
                await supabase
                    .from("delivery_automation_jobs")
                    .update({
                        status: "pending",
                        scheduled_at: retryAt,
                        last_error: msg,
                        picked_at: null,
                    })
                    .eq("id", job.id);
            } else {
                await supabase
                    .from("delivery_automation_jobs")
                    .update({
                        status: "error",
                        last_error: msg,
                        finished_at: new Date().toISOString(),
                    })
                    .eq("id", job.id);
            }
        }

        // UazAPI pacing
        await new Promise((r) => setTimeout(r, SEND_PAUSE_MS));
    }

    return json({ success: true, processed, errors, date: todayInBrasilia() });
});

// ---------------------------------------------------------------------------
// Job dispatch
// ---------------------------------------------------------------------------

async function dispatchJob(supabase: any, job: any): Promise<void> {
    if (job.job_type === "start") {
        await handleStartJob(supabase, job);
        return;
    }
    if (job.job_type === "advance") {
        // Advance jobs are used by the respond handler for rollover prompts
        // that need to be re-sent after target_date recompute. The respond
        // function handles the actual state transitions; here we just ensure
        // the session is still alive — advance jobs are no-ops by default.
        console.log(`[worker] advance job ${job.id} no-op`);
        return;
    }
    throw new Error(`unknown job_type: ${job.job_type}`);
}

async function handleStartJob(supabase: any, job: any): Promise<void> {
    // 1. Load session + delivery + related lookups
    const { data: session, error: sessErr } = await supabase
        .from("delivery_automation_sessions")
        .select(`
            id, user_id, delivery_id, conversation_id, contact_id,
            instance_id, professional_id, service_id, state
        `)
        .eq("id", job.session_id)
        .maybeSingle();
    if (sessErr) throw sessErr;
    if (!session) throw new Error("session not found");

    if (session.state !== "pending_send") {
        // Another worker already advanced it
        console.log(`[worker] session ${session.id} already past pending_send (state=${session.state}) — skipping`);
        return;
    }

    // 2. Load delivery + patient + service + professional
    const { data: delivery, error: dErr } = await supabase
        .from("deliveries")
        .select(`
            id, user_id, patient_id, service_id, professional_id,
            contact_date, stage
        `)
        .eq("id", session.delivery_id)
        .maybeSingle();
    if (dErr) throw dErr;
    if (!delivery) throw new Error("delivery not found");
    if (delivery.stage !== "aguardando_agendamento") {
        // State changed externally (e.g., human already scheduled) — abort
        await markSession(supabase, session.id, {
            state: "abandoned",
            ended_at: new Date().toISOString(),
        });
        return;
    }

    const [patientRes, serviceRes, professionalRes, instanceRes] = await Promise.all([
        supabase.from("patients")
            .select("id, user_id, contact_id, nome, telefone")
            .eq("id", delivery.patient_id).maybeSingle(),
        supabase.from("products_services")
            .select("id, name, duration_minutes")
            .eq("id", delivery.service_id).maybeSingle(),
        supabase.from("professionals")
            .select("id, name, work_days, work_hours")
            .eq("id", delivery.professional_id).maybeSingle(),
        supabase.from("instances")
            .select("id, user_id, apikey, status")
            .eq("id", session.instance_id).maybeSingle(),
    ]);

    const patient = patientRes.data;
    const service = serviceRes.data;
    const professional = professionalRes.data;
    const instance = instanceRes.data;

    if (!patient) throw new Error("patient not found");
    if (!service) throw new Error("service not found");
    if (!professional) throw new Error("professional not found");
    if (!instance) throw new Error("instance not found");
    if (!instance.apikey) throw new Error("instance missing apikey");

    // 3. Resolve / create contact + conversation
    const { contactId, conversationId } = await resolveConversation(
        supabase, delivery.user_id, instance.id, patient,
    );

    // 4. Build day-of-week buttons from professional.work_days ∩ {1..5}
    const workDays: number[] = professional.work_days || [];
    const available: WeekdayIndex[] = [];
    for (const d of [1, 2, 3, 4, 5] as WeekdayIndex[]) {
        if (workDays.includes(d)) available.push(d);
    }

    if (available.length === 0) {
        // Professional has no weekday availability — nothing we can do
        await markSession(supabase, session.id, {
            state: "failed",
            ended_at: new Date().toISOString(),
        });
        throw new Error("professional has no Mon-Fri work_days");
    }

    // 5. Build prompt
    const firstName = (patient.nome || "").split(" ")[0] || "tudo bem";
    const promptText =
        `Bom dia ${firstName}, vi que você possui um procedimento de ${service.name} ` +
        `com ${professional.name} aguardando agendamento. Estou entrando em contato ` +
        `para podermos realizar esse agendamento para você — me diz qual o melhor ` +
        `dia da semana para agendarmos?`;

    const buttons: MenuButton[] = available.map((d) => ({
        id: `day_${d}`,
        text: DAY_BUTTONS[d].text,
    }));
    buttons.push({ id: "day_no", text: "Não quero agendar no momento" });

    // 6. Send menu + log
    const sendRes = await sendMenu({
        supabase,
        userId: delivery.user_id,
        conversationId,
        instanceApikey: instance.apikey,
        number: patient.telefone,
        text: promptText,
        buttons,
        trackSource: "delivery_automation",
        trackId: `start:${session.id}`,
    });

    // 7. Advance session
    await markSession(supabase, session.id, {
        state: "awaiting_day",
        conversation_id: conversationId,
        contact_id: contactId,
        last_prompt_message_id: sendRes.messageId,
        last_state_at: new Date().toISOString(),
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveConversation(
    supabase: any,
    userId: string,
    instanceId: string,
    patient: { id: string; contact_id: string | null; telefone: string; nome: string | null },
): Promise<{ contactId: string; conversationId: string }> {
    // Prefer the patient's linked contact if present.
    let contactId = patient.contact_id || "";

    if (!contactId) {
        const digits = String(patient.telefone).replace(/\D/g, "");
        if (!digits) throw new Error("patient has no phone/contact_id");

        const jid = digits.endsWith("@s.whatsapp.net") ? digits : `${digits}@s.whatsapp.net`;

        // Try to find an existing contact by number variants
        const { data: existing } = await supabase
            .from("contacts")
            .select("id")
            .eq("user_id", userId)
            .or(`number.eq.${digits},number.eq.${jid},phone.eq.${digits}`)
            .limit(1)
            .maybeSingle();

        if (existing?.id) {
            contactId = existing.id;
        } else {
            const { data: created, error: cErr } = await supabase
                .from("contacts")
                .insert({
                    user_id: userId,
                    number: jid,
                    phone: digits,
                    push_name: patient.nome || digits,
                    patient_id: patient.id,
                    instance_id: instanceId,
                })
                .select("id")
                .single();
            if (cErr) throw cErr;
            contactId = created.id;
        }
    }

    // Find or create a conversation for (contact, instance)
    const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, status")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingConv?.id) {
        return { contactId, conversationId: existingConv.id };
    }

    const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
            contact_id: contactId,
            user_id: userId,
            instance_id: instanceId,
            status: "open", // 'open' avoids N8N forward; intercept will handle responses
            unread_count: 0,
            last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (convErr) throw convErr;
    return { contactId, conversationId: newConv.id };
}

async function markSession(supabase: any, id: string, patch: Record<string, unknown>) {
    const { error } = await supabase
        .from("delivery_automation_sessions")
        .update(patch)
        .eq("id", id);
    if (error) throw error;
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
