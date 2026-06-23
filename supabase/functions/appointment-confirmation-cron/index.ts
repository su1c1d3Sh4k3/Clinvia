// supabase/functions/appointment-confirmation-cron/index.ts
// -----------------------------------------------------------------------------
// Cron-driven scanner (*/10 * * * *) for automatic appointment confirmation.
// Scans 3 time windows:
//   1. 24h before → send confirmation buttons
//   2. 2h before  → send reminder text
//   3. 24h after  → send feedback survey buttons
// Groups appointments by contact+day (Brasília). One message per contact per day.
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { sendMenu, sendText, type MenuButton } from "../_shared/uazapi-menu.ts";
import { utcToBrasiliaParts } from "../_shared/timezone.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAGGER_MS = 200; // delay between sends to avoid rate limiting

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    let totalSent = 0;
    let totalErrors = 0;

    try {
        // Get all users with ia_on = true
        const { data: activeConfigs } = await supabase
            .from("ia_config")
            .select("user_id, name")
            .eq("ia_on", true);

        if (!activeConfigs?.length) {
            return json({ success: true, sent: 0, message: "no active configs" });
        }

        for (const config of activeConfigs) {
            try {
                // Get connected instance for this user
                const { data: instance } = await supabase
                    .from("instances")
                    .select("id, apikey, status")
                    .eq("user_id", config.user_id)
                    .eq("status", "connected")
                    .limit(1)
                    .maybeSingle();

                if (!instance?.apikey) continue;

                const ctx = { supabase, userId: config.user_id, instance, clinicName: config.name || "a clínica", now };

                const r1 = await processConfirm24h(ctx);
                const r2 = await processReminder2h(ctx);
                const r3 = await processFeedback24h(ctx);

                totalSent += r1.sent + r2.sent + r3.sent;
                totalErrors += r1.errors + r2.errors + r3.errors;
            } catch (err) {
                console.error(`[ac-cron] error for user ${config.user_id}:`, err);
                totalErrors++;
            }
        }

        console.log(`[ac-cron] done: sent=${totalSent} errors=${totalErrors}`);
        return json({ success: true, sent: totalSent, errors: totalErrors });
    } catch (err) {
        console.error("[ac-cron] fatal error:", err);
        return json({ success: false, error: String(err?.message || err) }, 500);
    }
});

// ---------------------------------------------------------------------------
// Flow 1: 24h before — Confirmation with buttons
// ---------------------------------------------------------------------------

interface CronContext {
    supabase: any;
    userId: string;
    instance: { id: string; apikey: string };
    clinicName: string;
    now: Date;
}

async function processConfirm24h(ctx: CronContext): Promise<{ sent: number; errors: number }> {
    const { supabase, userId, now } = ctx;
    const from = new Date(now.getTime() + 23 * 3600_000);
    const to = new Date(now.getTime() + 25 * 3600_000);

    // Find appointments in the 24h window (trigger)
    const { data: windowAppointments } = await supabase
        .from("appointments")
        .select("id, contact_id, start_time, service_name, professional_name")
        .eq("user_id", userId)
        .eq("type", "appointment")
        .in("status", ["pending", "confirmed", "rescheduled"])
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString());

    if (!windowAppointments?.length) return { sent: 0, errors: 0 };

    // Get unique contact+day pairs from window hits
    const contactDays = new Map<string, { contactId: string; dateBR: string }>();
    for (const apt of windowAppointments) {
        if (!apt.contact_id) continue;
        const dateBR = utcToBrasiliaParts(new Date(apt.start_time)).ymd;
        const key = `${apt.contact_id}__${dateBR}`;
        if (!contactDays.has(key)) contactDays.set(key, { contactId: apt.contact_id, dateBR });
    }

    let sent = 0, errors = 0;

    for (const { contactId, dateBR } of contactDays.values()) {
        try {
            // Check if already sent
            const { data: existing } = await supabase
                .from("appointment_confirmation_sessions")
                .select("id")
                .eq("contact_id", contactId)
                .eq("flow_type", "confirm_24h")
                .eq("appointment_date", dateBR)
                .maybeSingle();
            if (existing) continue;

            // Fetch ALL appointments for this contact on this day (not just window)
            const dayStart = `${dateBR}T00:00:00-03:00`;
            const dayEnd = `${dateBR}T23:59:59-03:00`;
            const { data: allDayAppointments } = await supabase
                .from("appointments")
                .select("id, contact_id, start_time, service_name, professional_name")
                .eq("user_id", userId)
                .eq("contact_id", contactId)
                .eq("type", "appointment")
                .in("status", ["pending", "confirmed", "rescheduled"])
                .gte("start_time", dayStart)
                .lte("start_time", dayEnd)
                .order("start_time", { ascending: true });

            const group = (allDayAppointments || []).map((a: any) => ({ ...a, _dateBR: dateBR }));
            if (!group.length) continue;

            const { data: contact } = await supabase
                .from("contacts")
                .select("id, push_name, number, instance_id")
                .eq("id", contactId)
                .single();
            if (!contact?.number) continue;

            const { conversationId } = await resolveConversation(supabase, userId, ctx.instance.id, contact);

            const firstName = (contact.push_name || "").split(" ")[0] || "cliente";
            const msgText = buildConfirmMessage(firstName, group, ctx.clinicName);

            const buttons: MenuButton[] = [
                { id: "ac_confirm", text: "Sim, pode confirmar" },
                { id: "ac_reschedule", text: "Vou precisar reagendar" },
                { id: "ac_cancel", text: "Não vou poder ir" },
            ];

            const sendRes = await sendMenu({
                supabase,
                userId,
                conversationId,
                instanceApikey: ctx.instance.apikey,
                number: contact.number,
                text: msgText,
                buttons,
                trackSource: "appointment_confirmation",
                trackId: `confirm_24h:${contactId}`,
            });

            // Move CRM to Pós-Venda stage (trigger syncs queue automatically)
            await supabase
                .from("crm_client")
                .update({
                    stage: "Pós-Venda",
                    stage_changed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("contact_id", contactId)
                .eq("user_id", userId)
                .eq("is_active", true);

            // Also explicitly move queue (in case no CRM card exists)
            const { data: pvQueue } = await supabase
                .from("queues")
                .select("id")
                .eq("user_id", userId)
                .eq("name", "Pós-Venda")
                .maybeSingle();
            if (pvQueue?.id) {
                await supabase.from("conversations")
                    .update({ queue_id: pvQueue.id, updated_at: new Date().toISOString() })
                    .eq("id", conversationId);
            }

            await supabase.from("appointment_confirmation_sessions").insert({
                user_id: userId,
                contact_id: contactId,
                conversation_id: conversationId,
                instance_id: ctx.instance.id,
                appointment_ids: group.map((a: any) => a.id),
                appointment_date: dateBR,
                flow_type: "confirm_24h",
                state: "awaiting_confirmation",
                last_prompt_message_id: sendRes.messageId,
            });

            sent++;
            if (STAGGER_MS > 0) await sleep(STAGGER_MS);
        } catch (err) {
            console.error("[ac-cron] confirm_24h error:", err);
            errors++;
        }
    }

    return { sent, errors };
}

// ---------------------------------------------------------------------------
// Flow 2: 2h before — Reminder text (no buttons)
// ---------------------------------------------------------------------------

async function processReminder2h(ctx: CronContext): Promise<{ sent: number; errors: number }> {
    const { supabase, userId, now } = ctx;
    const from = new Date(now.getTime() + 110 * 60_000); // 1h50m
    const to = new Date(now.getTime() + 130 * 60_000);   // 2h10m

    const { data: windowAppointments } = await supabase
        .from("appointments")
        .select("id, contact_id, start_time, service_name, professional_name")
        .eq("user_id", userId)
        .eq("type", "appointment")
        .in("status", ["pending", "confirmed", "rescheduled"])
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString());

    if (!windowAppointments?.length) return { sent: 0, errors: 0 };

    const contactDays = new Map<string, { contactId: string; dateBR: string }>();
    for (const apt of windowAppointments) {
        if (!apt.contact_id) continue;
        const dateBR = utcToBrasiliaParts(new Date(apt.start_time)).ymd;
        const key = `${apt.contact_id}__${dateBR}`;
        if (!contactDays.has(key)) contactDays.set(key, { contactId: apt.contact_id, dateBR });
    }

    let sent = 0, errors = 0;

    for (const { contactId, dateBR } of contactDays.values()) {
        try {
            const { data: existing } = await supabase
                .from("appointment_confirmation_sessions")
                .select("id")
                .eq("contact_id", contactId)
                .eq("flow_type", "reminder_2h")
                .eq("appointment_date", dateBR)
                .maybeSingle();
            if (existing) continue;

            // Fetch ALL appointments for this contact on this day
            const dayStart = `${dateBR}T00:00:00-03:00`;
            const dayEnd = `${dateBR}T23:59:59-03:00`;
            const { data: allDayAppointments } = await supabase
                .from("appointments")
                .select("id, contact_id, start_time, service_name, professional_name")
                .eq("user_id", userId)
                .eq("contact_id", contactId)
                .eq("type", "appointment")
                .in("status", ["pending", "confirmed", "rescheduled"])
                .gte("start_time", dayStart)
                .lte("start_time", dayEnd)
                .order("start_time", { ascending: true });

            const group = (allDayAppointments || []).map((a: any) => ({ ...a, _dateBR: dateBR }));
            if (!group.length) continue;

            const { data: contact } = await supabase
                .from("contacts")
                .select("id, push_name, number, instance_id")
                .eq("id", contactId)
                .single();
            if (!contact?.number) continue;

            const { conversationId } = await resolveConversation(supabase, userId, ctx.instance.id, contact);

            const firstName = (contact.push_name || "").split(" ")[0] || "cliente";
            const msgText = buildReminderMessage(firstName, group);

            await sendText({
                supabase,
                userId,
                conversationId,
                instanceApikey: ctx.instance.apikey,
                number: contact.number,
                text: msgText,
            });

            // Create session as completed (no response expected)
            await supabase.from("appointment_confirmation_sessions").insert({
                user_id: userId,
                contact_id: contactId,
                conversation_id: conversationId,
                instance_id: ctx.instance.id,
                appointment_ids: group.map((a: any) => a.id),
                appointment_date: dateBR,
                flow_type: "reminder_2h",
                state: "completed",
                ended_at: new Date().toISOString(),
            });

            sent++;
            if (STAGGER_MS > 0) await sleep(STAGGER_MS);
        } catch (err) {
            console.error("[ac-cron] reminder_2h error:", err);
            errors++;
        }
    }

    return { sent, errors };
}

// ---------------------------------------------------------------------------
// Flow 3: 24h after — Feedback survey with buttons
// ---------------------------------------------------------------------------

async function processFeedback24h(ctx: CronContext): Promise<{ sent: number; errors: number }> {
    const { supabase, userId, now } = ctx;
    const from = new Date(now.getTime() - 25 * 3600_000);
    const to = new Date(now.getTime() - 23 * 3600_000);

    const { data: windowAppointments } = await supabase
        .from("appointments")
        .select("id, contact_id, start_time, end_time, status, service_name, professional_name")
        .eq("user_id", userId)
        .eq("type", "appointment")
        .in("status", ["confirmed", "completed"])
        .gte("end_time", from.toISOString())
        .lte("end_time", to.toISOString());

    if (!windowAppointments?.length) return { sent: 0, errors: 0 };

    // Update confirmed → completed for ALL found
    for (const apt of windowAppointments) {
        if (apt.status === "confirmed") {
            await supabase.from("appointments")
                .update({ status: "completed" })
                .eq("id", apt.id);
        }
    }

    const contactDays = new Map<string, { contactId: string; dateBR: string }>();
    for (const apt of windowAppointments) {
        if (!apt.contact_id) continue;
        const dateBR = utcToBrasiliaParts(new Date(apt.start_time)).ymd;
        const key = `${apt.contact_id}__${dateBR}`;
        if (!contactDays.has(key)) contactDays.set(key, { contactId: apt.contact_id, dateBR });
    }

    let sent = 0, errors = 0;

    for (const { contactId, dateBR } of contactDays.values()) {
        try {
            const { data: existing } = await supabase
                .from("appointment_confirmation_sessions")
                .select("id")
                .eq("contact_id", contactId)
                .eq("flow_type", "feedback_24h")
                .eq("appointment_date", dateBR)
                .maybeSingle();
            if (existing) continue;

            // Fetch ALL appointments for this contact on this day and mark completed
            const dayStart = `${dateBR}T00:00:00-03:00`;
            const dayEnd = `${dateBR}T23:59:59-03:00`;
            const { data: allDayAppointments } = await supabase
                .from("appointments")
                .select("id, contact_id, start_time, end_time, status, service_name, professional_name")
                .eq("user_id", userId)
                .eq("contact_id", contactId)
                .eq("type", "appointment")
                .in("status", ["confirmed", "completed"])
                .gte("start_time", dayStart)
                .lte("start_time", dayEnd)
                .order("start_time", { ascending: true });

            const group = (allDayAppointments || []).map((a: any) => ({ ...a, _dateBR: dateBR }));
            if (!group.length) continue;

            // Also mark any remaining confirmed as completed
            for (const apt of group) {
                if (apt.status === "confirmed") {
                    await supabase.from("appointments")
                        .update({ status: "completed" })
                        .eq("id", apt.id);
                }
            }

            const { data: contact } = await supabase
                .from("contacts")
                .select("id, push_name, number, instance_id")
                .eq("id", contactId)
                .single();
            if (!contact?.number) continue;

            const { conversationId } = await resolveConversation(supabase, userId, ctx.instance.id, contact);

            const firstName = (contact.push_name || "").split(" ")[0] || "cliente";
            const msgText = `Como vai ${firstName}, espero que esteja bem, estou passando para pedir seu feedback sobre seu atendimento aqui na clínica ontem, se puder por gentileza nos dar seu feedback:`;

            const buttons: MenuButton[] = [
                { id: "ac_fb_5", text: "Excelente" },
                { id: "ac_fb_4", text: "Muito bom" },
                { id: "ac_fb_3", text: "Regular" },
                { id: "ac_fb_2", text: "Precisa melhorar" },
                { id: "ac_fb_1", text: "Insatisfeito" },
            ];

            const sendRes = await sendMenu({
                supabase,
                userId,
                conversationId,
                instanceApikey: ctx.instance.apikey,
                number: contact.number,
                text: msgText,
                buttons,
                trackSource: "appointment_confirmation",
                trackId: `feedback_24h:${contactId}`,
            });

            await supabase.from("appointment_confirmation_sessions").insert({
                user_id: userId,
                contact_id: contactId,
                conversation_id: conversationId,
                instance_id: ctx.instance.id,
                appointment_ids: group.map((a: any) => a.id),
                appointment_date: dateBR,
                flow_type: "feedback_24h",
                state: "awaiting_feedback_rating",
                last_prompt_message_id: sendRes.messageId,
            });

            sent++;
            if (STAGGER_MS > 0) await sleep(STAGGER_MS);
        } catch (err) {
            console.error("[ac-cron] feedback_24h error:", err);
            errors++;
        }
    }

    return { sent, errors };
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

function formatTimeBR(isoString: string): string {
    const parts = utcToBrasiliaParts(new Date(isoString));
    return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function buildConfirmMessage(firstName: string, group: any[], clinicName: string): string {
    if (group.length === 1) {
        const a = group[0];
        return `Olá ${firstName}, tudo bem com você? Estou entrando em contato para confirmar seu agendamento amanhã às ${formatTimeBR(a.start_time)} aqui na ${clinicName} para o procedimento de ${a.service_name} com ${a.professional_name}. Posso confirmar sua presença?`;
    }

    // Multiple appointments — list all, use first time
    const lines = group.map((a: any) =>
        `• ${formatTimeBR(a.start_time)} — ${a.service_name} com ${a.professional_name}`
    ).join("\n");
    return `Olá ${firstName}, tudo bem com você? Estou entrando em contato para confirmar seus agendamentos de amanhã aqui na ${clinicName}:\n\n${lines}\n\nPosso confirmar sua presença em todos?`;
}

function buildReminderMessage(firstName: string, group: any[]): string {
    if (group.length === 1) {
        return `Olá ${firstName}, passando para reforçar seu atendimento às ${formatTimeBR(group[0].start_time)} aqui na clínica, se puder chegar com pelo menos 30 min de antecedencia seria o ideal, estamos te aguardando.`;
    }

    const times = group.map((a: any) => formatTimeBR(a.start_time)).join(" e ");
    return `Olá ${firstName}, passando para reforçar seus atendimentos às ${times} aqui na clínica, se puder chegar com pelo menos 30 min de antecedencia seria o ideal, estamos te aguardando.`;
}

// ---------------------------------------------------------------------------
// Group appointments by contact + day (Brasília)
// ---------------------------------------------------------------------------

function groupByContactAndDay(appointments: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    for (const apt of appointments) {
        if (!apt.contact_id) continue;
        const parts = utcToBrasiliaParts(new Date(apt.start_time));
        const dateBR = parts.ymd; // YYYY-MM-DD in Brasília
        const key = `${apt.contact_id}__${dateBR}`;

        if (!groups.has(key)) groups.set(key, []);
        apt._dateBR = dateBR;
        groups.get(key)!.push(apt);
    }

    // Sort each group by start_time ascending
    for (const group of groups.values()) {
        group.sort((a: any, b: any) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
    }

    return groups;
}

// ---------------------------------------------------------------------------
// Conversation resolution (adapted from delivery-automation-worker)
// ---------------------------------------------------------------------------

async function resolveConversation(
    supabase: any,
    userId: string,
    instanceId: string,
    contact: { id: string; number: string; push_name: string | null; instance_id: string | null },
): Promise<{ conversationId: string }> {
    // Find existing open/pending conversation
    const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, status")
        .eq("contact_id", contact.id)
        .eq("user_id", userId)
        .in("status", ["pending", "open"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingConv?.id) {
        return { conversationId: existingConv.id };
    }

    // Create new conversation (never reopen resolved)
    const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
            contact_id: contact.id,
            user_id: userId,
            instance_id: instanceId,
            status: "open",
            unread_count: 0,
            last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (convErr) throw convErr;
    return { conversationId: newConv.id };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
