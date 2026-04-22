// supabase/functions/delivery-automation-respond/index.ts
// -----------------------------------------------------------------------------
// Inbound handler for Delivery Automation sessions. Invoked by
// webhook-handle-message when an active session exists for the incoming
// conversation. Advances the state machine based on the button the client
// tapped (or marks invalid if free-text was sent), and emits the next
// outbound prompt via UazAPI /send/menu or /send/text.
//
// State machine summary (full table in plan file):
//   pending_send → awaiting_day → awaiting_period? → awaiting_time →
//   awaiting_confirm → (completed | transferred | abandoned | failed)
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
    sendMenu,
    sendText,
    type MenuButton,
} from "../_shared/uazapi-menu.ts";
import { computeAvailableSlots, type Slot } from "../_shared/slot-engine.ts";
import {
    todayInBrasilia,
    getNextWeekdayInBrasilia,
    addDaysBR,
    formatDDMM,
    isMorningBR,
    weekdayNamePt,
    type Weekday,
} from "../_shared/timezone.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RespondInput {
    conversationId: string;
    contactId: string;
    userId: string;
    rawMessage: string | null;
    buttonId: string | null;
    buttonText: string | null;
    messageId?: string | null;
}

const TERMINAL = new Set(["completed", "transferred", "abandoned", "failed"]);
const MAX_ROLLOVER_WEEKS = 8;
const MAX_TIME_BUTTONS = 8;

/**
 * Infer a buttonId from free text. Used when the DB trigger dispatches us and
 * we only have the message body, OR when the webhook intercept failed to
 * extract the structured selectedID from the UazAPI payload.
 * Returns "" if no match — caller treats that as invalid input.
 */
function inferButtonIdFromText(raw: string | null): string {
    if (!raw) return "";
    const s = raw.trim().toLowerCase();
    if (!s) return "";

    // Day-of-week matches (accepts "segunda", "segunda-feira", "Segunda-feira", etc.)
    if (/^segunda/.test(s) || s.includes("segunda-feira")) return "day_1";
    if (/^ter[çc]a/.test(s) || s.includes("terça-feira") || s.includes("terca-feira")) return "day_2";
    if (/^quarta/.test(s) || s.includes("quarta-feira")) return "day_3";
    if (/^quinta/.test(s) || s.includes("quinta-feira")) return "day_4";
    if (/^sexta/.test(s) || s.includes("sexta-feira")) return "day_5";
    if (s.includes("não quero agendar") || s.includes("nao quero agendar")) return "day_no";

    // Periods
    if (s.includes("manh") || s === "manha" || s === "manhã") return "period_morning";
    if (s.includes("tarde")) return "period_afternoon";

    // Navigation
    if (s.includes("outro dia da semana")) return "nav_week";
    if (s.includes("outro dia do m")) return "nav_month"; // "do mês"/"do mes"

    // Final confirmation
    if (s.includes("encerrar") || s === "finalizar" || s === "ok") return "final_close";
    if (s.includes("dúvida") || s.includes("duvida") || s.includes("especialista")) return "final_human";

    // Time HH:MM → time_HH_MM (accept "09:00", "9:00", "9h", "09h00")
    const timeMatch = s.match(/^(\d{1,2})[:h](\d{0,2})$/);
    if (timeMatch) {
        const hh = timeMatch[1].padStart(2, "0");
        const mm = (timeMatch[2] || "00").padStart(2, "0");
        return `time_${hh}_${mm}`;
    }

    return "";
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    try {
        const body: RespondInput = await req.json();
        if (!body?.conversationId) return json({ error: "conversationId required" }, 400);

        // Load the MOST RECENT active session. When the same contact has
        // multiple deliveries hitting the same conversation (e.g. two cron
        // rounds on different days for the same patient), several active
        // sessions may coexist. We always drive the newest one.
        const { data: sessions, error: sErr } = await supabase
            .from("delivery_automation_sessions")
            .select("*")
            .eq("conversation_id", body.conversationId)
            .not("state", "in", `(${Array.from(TERMINAL).join(",")})`)
            .order("created_at", { ascending: false })
            .limit(1);
        if (sErr) throw sErr;
        const session = Array.isArray(sessions) && sessions.length > 0 ? sessions[0] : null;
        if (!session) {
            return json({ success: true, skipped: true, reason: "no active session" });
        }

        const ctx = await loadContext(supabase, session);
        // Prefer structured buttonId from webhook; fallback to inferring from
        // button text OR raw message body (handles DB-trigger invocations).
        let buttonId = (body.buttonId || "").trim();
        if (!buttonId) {
            buttonId = inferButtonIdFromText(body.buttonText) || inferButtonIdFromText(body.rawMessage);
        }
        console.log(`[respond] session=${session.id} state=${session.state} buttonId='${buttonId}' rawMsg='${(body.rawMessage || '').slice(0, 60)}'`);

        // Route by state
        let result: { newState: string; action: string };
        switch (session.state) {
            case "awaiting_day":
                result = await handleAwaitingDay(supabase, session, ctx, buttonId);
                break;
            case "awaiting_period":
                result = await handleAwaitingPeriod(supabase, session, ctx, buttonId);
                break;
            case "awaiting_time":
                result = await handleAwaitingTime(supabase, session, ctx, buttonId);
                break;
            case "awaiting_confirm":
                result = await handleAwaitingConfirm(supabase, session, ctx, buttonId);
                break;
            default:
                result = { newState: session.state, action: "ignored" };
        }

        return json({ success: true, ...result });
    } catch (error) {
        console.error("[respond] error:", error);
        return json({ success: false, error: String(error?.message || error) }, 500);
    }
});

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

interface SessionContext {
    instance: { id: string; apikey: string };
    patient: { id: string; nome: string | null; telefone: string; contact_id: string | null };
    service: { id: string; name: string; duration_minutes: number };
    professional: { id: string; name: string };
    delivery: { id: string; contact_date: string | null };
    humanQueueId: string | null;
}

async function loadContext(supabase: any, session: any): Promise<SessionContext> {
    const [instanceRes, deliveryRes, queuesRes] = await Promise.all([
        supabase.from("instances")
            .select("id, apikey")
            .eq("id", session.instance_id).maybeSingle(),
        supabase.from("deliveries")
            .select("id, contact_date, patient_id, service_id, professional_id")
            .eq("id", session.delivery_id).maybeSingle(),
        supabase.from("queues")
            .select("id, name")
            .eq("user_id", session.user_id)
            .eq("name", "Atendimento Humano")
            .maybeSingle(),
    ]);

    const instance = instanceRes.data;
    const delivery = deliveryRes.data;
    if (!instance) throw new Error("instance missing");
    if (!delivery) throw new Error("delivery missing");

    const [patientRes, serviceRes, professionalRes] = await Promise.all([
        supabase.from("patients")
            .select("id, nome, telefone, contact_id")
            .eq("id", delivery.patient_id).maybeSingle(),
        supabase.from("products_services")
            .select("id, name, duration_minutes")
            .eq("id", delivery.service_id).maybeSingle(),
        supabase.from("professionals")
            .select("id, name")
            .eq("id", delivery.professional_id).maybeSingle(),
    ]);

    return {
        instance: { id: instance.id, apikey: instance.apikey },
        patient: patientRes.data!,
        service: {
            id: serviceRes.data!.id,
            name: serviceRes.data!.name,
            duration_minutes: Number(serviceRes.data!.duration_minutes || 60),
        },
        professional: { id: professionalRes.data!.id, name: professionalRes.data!.name },
        delivery: { id: delivery.id, contact_date: delivery.contact_date },
        humanQueueId: queuesRes.data?.id || null,
    };
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

async function handleAwaitingDay(
    supabase: any,
    session: any,
    ctx: SessionContext,
    buttonId: string,
): Promise<{ newState: string; action: string }> {
    // "Não quero agendar no momento"
    if (buttonId === "day_no") {
        await sendText({
            supabase,
            userId: session.user_id,
            conversationId: session.conversation_id,
            instanceApikey: ctx.instance.apikey,
            number: ctx.patient.telefone,
            text: "Sem problemas, qualquer coisa estamos a disposição.",
        });

        // Push contact_date forward by 7 days to avoid daily re-contact
        const today = todayInBrasilia();
        const nextContact = addDaysBR(today, 7);
        await supabase
            .from("deliveries")
            .update({ contact_date: nextContact })
            .eq("id", ctx.delivery.id);

        await transferToHuman(supabase, session, ctx);
        await markSession(supabase, session.id, {
            state: "abandoned",
            ended_at: new Date().toISOString(),
        });
        return { newState: "abandoned", action: "declined_scheduling" };
    }

    // day_1..5
    const m = buttonId.match(/^day_([1-5])$/);
    if (!m) return await handleInvalid(supabase, session, ctx, "awaiting_day");

    const weekday = Number(m[1]) as Weekday;
    const today = todayInBrasilia();
    let targetDate = getNextWeekdayInBrasilia(today, weekday);
    // If next occurrence is "today", advance by 7 — same-day automation feels abrupt
    if (targetDate === today) targetDate = addDaysBR(targetDate, 7);

    await markSession(supabase, session.id, {
        target_date: targetDate,
        rollover_weeks: 0,
        invalid_response_count: 0,
        selected_period: null,
        available_slots: null,
    });
    return await advanceToPeriodOrTime(supabase, session.id, ctx, targetDate, 0);
}

async function handleAwaitingPeriod(
    supabase: any,
    session: any,
    ctx: SessionContext,
    buttonId: string,
): Promise<{ newState: string; action: string }> {
    if (buttonId !== "period_morning" && buttonId !== "period_afternoon") {
        return await handleInvalid(supabase, session, ctx, "awaiting_period");
    }
    const period: "morning" | "afternoon" =
        buttonId === "period_morning" ? "morning" : "afternoon";

    const cached: Slot[] = (session.available_slots || []).map((s: any) => ({
        time: s.time,
        utcStart: new Date(s.utcStart),
    }));
    const filtered = cached.filter((s) =>
        period === "morning" ? isMorningBR(s.utcStart) : !isMorningBR(s.utcStart),
    );

    await markSession(supabase, session.id, {
        selected_period: period,
        invalid_response_count: 0,
    });
    await sendTimeButtons(supabase, session.id, ctx, session.target_date, filtered);
    return { newState: "awaiting_time", action: "period_selected" };
}

async function handleAwaitingTime(
    supabase: any,
    session: any,
    ctx: SessionContext,
    buttonId: string,
): Promise<{ newState: string; action: string }> {
    if (buttonId === "nav_week") {
        // Back to day selection
        await resendDayButtons(supabase, session, ctx);
        await markSession(supabase, session.id, {
            state: "awaiting_day",
            selected_period: null,
            available_slots: null,
            invalid_response_count: 0,
        });
        return { newState: "awaiting_day", action: "nav_back_to_weekday" };
    }

    if (buttonId === "nav_month") {
        const nextDate = addDaysBR(session.target_date, 7);
        const rollover = (session.rollover_weeks || 0) + 1;
        await markSession(supabase, session.id, {
            target_date: nextDate,
            rollover_weeks: rollover,
            selected_period: null,
            available_slots: null,
            invalid_response_count: 0,
        });
        return await advanceToPeriodOrTime(supabase, session.id, ctx, nextDate, rollover);
    }

    const m = buttonId.match(/^time_(\d{2})_(\d{2})$/);
    if (!m) return await handleInvalid(supabase, session, ctx, "awaiting_time");
    const hm = `${m[1]}:${m[2]}`;

    // Create appointment
    const cached: Slot[] = (session.available_slots || []).map((s: any) => ({
        time: s.time,
        utcStart: new Date(s.utcStart),
    }));
    const chosen = cached.find((s) => s.time === hm);
    if (!chosen) return await handleInvalid(supabase, session, ctx, "awaiting_time");

    const appointmentId = await createAppointmentAndUpdateDelivery(
        supabase,
        session,
        ctx,
        chosen,
    );

    if (!appointmentId) {
        // Overlap race — re-present slots (recompute)
        return await advanceToPeriodOrTime(
            supabase,
            session.id,
            ctx,
            session.target_date,
            session.rollover_weeks || 0,
        );
    }

    // Confirmation prompt
    const confirmText =
        `Perfeito, seu agendamento foi realizado com sucesso! ` +
        `Dia ${formatDDMM(session.target_date)} às ${hm}. ` +
        `Aguardamos você aqui na clínica — qualquer dúvida estamos à disposição.`;
    const buttons: MenuButton[] = [
        { id: "final_close", text: "Encerrar" },
        { id: "final_human", text: "Fiquei com dúvida" },
    ];
    const sendRes = await sendMenu({
        supabase,
        userId: session.user_id,
        conversationId: session.conversation_id,
        instanceApikey: ctx.instance.apikey,
        number: ctx.patient.telefone,
        text: confirmText,
        buttons,
        trackSource: "delivery_automation",
        trackId: `confirm:${session.id}`,
    });

    await markSession(supabase, session.id, {
        state: "awaiting_confirm",
        selected_time: hm,
        invalid_response_count: 0,
        last_prompt_message_id: sendRes.messageId,
    });
    return { newState: "awaiting_confirm", action: "appointment_created" };
}

async function handleAwaitingConfirm(
    supabase: any,
    session: any,
    ctx: SessionContext,
    buttonId: string,
): Promise<{ newState: string; action: string }> {
    if (buttonId === "final_close") {
        await supabase
            .from("conversations")
            .update({ status: "resolved" })
            .eq("id", session.conversation_id);
        await markSession(supabase, session.id, {
            state: "completed",
            ended_at: new Date().toISOString(),
        });
        return { newState: "completed", action: "closed_by_client" };
    }

    if (buttonId === "final_human") {
        await sendText({
            supabase,
            userId: session.user_id,
            conversationId: session.conversation_id,
            instanceApikey: ctx.instance.apikey,
            number: ctx.patient.telefone,
            text: "Certo! Em breve um de nossos especialistas entrará em contato para te ajudar.",
        });
        await transferToHuman(supabase, session, ctx);
        await markSession(supabase, session.id, {
            state: "transferred",
            ended_at: new Date().toISOString(),
        });
        return { newState: "transferred", action: "requested_human" };
    }

    return await handleInvalid(supabase, session, ctx, "awaiting_confirm");
}

// ---------------------------------------------------------------------------
// Invalid response handling
// ---------------------------------------------------------------------------

async function handleInvalid(
    supabase: any,
    session: any,
    ctx: SessionContext,
    keepState: string,
): Promise<{ newState: string; action: string }> {
    const count = (session.invalid_response_count || 0) + 1;

    if (count >= 2) {
        await sendText({
            supabase,
            userId: session.user_id,
            conversationId: session.conversation_id,
            instanceApikey: ctx.instance.apikey,
            number: ctx.patient.telefone,
            text: "Vou te transferir para um de nossos especialistas, que em breve entrará em contato.",
        });
        await transferToHuman(supabase, session, ctx);
        await markSession(supabase, session.id, {
            state: "transferred",
            invalid_response_count: count,
            ended_at: new Date().toISOString(),
        });
        return { newState: "transferred", action: "invalid_twice" };
    }

    await sendText({
        supabase,
        userId: session.user_id,
        conversationId: session.conversation_id,
        instanceApikey: ctx.instance.apikey,
        number: ctx.patient.telefone,
        text: "Desculpe, não consegui entender. Por favor selecione uma das opções acima.",
    });
    await markSession(supabase, session.id, {
        invalid_response_count: count,
    });
    return { newState: keepState, action: "invalid_once" };
}

// ---------------------------------------------------------------------------
// Flow helpers
// ---------------------------------------------------------------------------

async function advanceToPeriodOrTime(
    supabase: any,
    sessionId: string,
    ctx: SessionContext,
    targetDate: string,
    rollover: number,
): Promise<{ newState: string; action: string }> {
    const slots = await computeAvailableSlots({
        supabase,
        userId: ctx.delivery.id, // not used by engine but kept for future
        professionalId: ctx.professional.id,
        serviceId: ctx.service.id,
        targetDateYmd: targetDate,
    });

    if (slots.length === 0) {
        // Rollover
        const nextRollover = rollover + 1;
        if (nextRollover > MAX_ROLLOVER_WEEKS) {
            // Give up → transfer
            // Re-load session to pass to transferToHuman
            const { data: session } = await supabase
                .from("delivery_automation_sessions")
                .select("*")
                .eq("id", sessionId)
                .maybeSingle();
            await sendText({
                supabase,
                userId: session.user_id,
                conversationId: session.conversation_id,
                instanceApikey: ctx.instance.apikey,
                number: ctx.patient.telefone,
                text:
                    "Não encontrei horários disponíveis nas próximas semanas. " +
                    "Em breve um de nossos especialistas entrará em contato para te ajudar.",
            });
            await transferToHuman(supabase, session, ctx);
            await markSession(supabase, sessionId, {
                state: "transferred",
                ended_at: new Date().toISOString(),
            });
            return { newState: "transferred", action: "no_slots_max_rollover" };
        }

        const nextDate = addDaysBR(targetDate, 7);
        await markSession(supabase, sessionId, {
            target_date: nextDate,
            rollover_weeks: nextRollover,
        });
        return await advanceToPeriodOrTime(supabase, sessionId, ctx, nextDate, nextRollover);
    }

    const morning = slots.filter((s) => isMorningBR(s.utcStart));
    const afternoon = slots.filter((s) => !isMorningBR(s.utcStart));

    // Persist cached slots as serializable JSON
    const cachePayload = slots.map((s) => ({ time: s.time, utcStart: s.utcStart.toISOString() }));
    await markSession(supabase, sessionId, {
        target_date: targetDate,
        available_slots: cachePayload,
    });

    const { data: session } = await supabase
        .from("delivery_automation_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

    if (morning.length > 0 && afternoon.length > 0) {
        // Ask period
        const weekday = new Date(slots[0].utcStart).getUTCDay() as Weekday;
        const dayName = weekdayNamePt(weekday);
        const promptText = `Certo, na ${dayName} dia ${formatDDMM(targetDate)} você prefere:`;
        const buttons: MenuButton[] = [
            { id: "period_morning", text: "Parte da manhã" },
            { id: "period_afternoon", text: "Parte da tarde" },
        ];
        const sendRes = await sendMenu({
            supabase,
            userId: session.user_id,
            conversationId: session.conversation_id,
            instanceApikey: ctx.instance.apikey,
            number: ctx.patient.telefone,
            text: promptText,
            buttons,
            trackSource: "delivery_automation",
            trackId: `period:${sessionId}`,
        });
        await markSession(supabase, sessionId, {
            state: "awaiting_period",
            last_prompt_message_id: sendRes.messageId,
            invalid_response_count: 0,
        });
        return { newState: "awaiting_period", action: "period_prompt" };
    }

    // Only one period → skip directly to time selection
    const only = morning.length > 0 ? morning : afternoon;
    const period = morning.length > 0 ? "morning" : "afternoon";
    await markSession(supabase, sessionId, {
        selected_period: period,
    });
    await sendTimeButtons(supabase, sessionId, ctx, targetDate, only);
    return { newState: "awaiting_time", action: "time_prompt_auto" };
}

async function sendTimeButtons(
    supabase: any,
    sessionId: string,
    ctx: SessionContext,
    targetDate: string,
    slots: Slot[],
): Promise<void> {
    const trimmed = slots.slice(0, MAX_TIME_BUTTONS);
    const { data: session } = await supabase
        .from("delivery_automation_sessions")
        .select("user_id, conversation_id")
        .eq("id", sessionId)
        .maybeSingle();

    const buttons: MenuButton[] = trimmed.map((s) => ({
        id: `time_${s.time.replace(":", "_")}`,
        text: s.time,
    }));
    buttons.push({ id: "nav_week", text: "Outro dia da semana" });
    buttons.push({ id: "nav_month", text: "Outro dia do mês" });

    const promptText =
        `Perfeito, para o dia ${formatDDMM(targetDate)} temos os seguintes horários disponíveis — qual você prefere?`;

    const sendRes = await sendMenu({
        supabase,
        userId: session.user_id,
        conversationId: session.conversation_id,
        instanceApikey: ctx.instance.apikey,
        number: ctx.patient.telefone,
        text: promptText,
        buttons,
        trackSource: "delivery_automation",
        trackId: `time:${sessionId}`,
    });
    await markSession(supabase, sessionId, {
        state: "awaiting_time",
        last_prompt_message_id: sendRes.messageId,
        invalid_response_count: 0,
    });
}

async function resendDayButtons(supabase: any, session: any, ctx: SessionContext): Promise<void> {
    const { data: professional } = await supabase
        .from("professionals")
        .select("work_days")
        .eq("id", ctx.professional.id)
        .maybeSingle();
    const workDays: number[] = professional?.work_days || [];

    const available: Weekday[] = [];
    for (const d of [1, 2, 3, 4, 5] as Weekday[]) {
        if (workDays.includes(d)) available.push(d);
    }

    const firstName = (ctx.patient.nome || "").split(" ")[0] || "";
    const promptText =
        `Certo${firstName ? `, ${firstName}` : ""} — qual o melhor dia da semana para agendarmos?`;
    const buttons: MenuButton[] = available.map((d) => ({
        id: `day_${d}`,
        text: [
            "", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira",
        ][d],
    }));
    buttons.push({ id: "day_no", text: "Não quero agendar no momento" });

    const sendRes = await sendMenu({
        supabase,
        userId: session.user_id,
        conversationId: session.conversation_id,
        instanceApikey: ctx.instance.apikey,
        number: ctx.patient.telefone,
        text: promptText,
        buttons,
        trackSource: "delivery_automation",
        trackId: `day-again:${session.id}`,
    });
    await markSession(supabase, session.id, {
        last_prompt_message_id: sendRes.messageId,
    });
}

async function createAppointmentAndUpdateDelivery(
    supabase: any,
    session: any,
    ctx: SessionContext,
    slot: Slot,
): Promise<string | null> {
    const startIso = slot.utcStart.toISOString();
    const endDate = new Date(slot.utcStart.getTime() + ctx.service.duration_minutes * 60_000);
    const endIso = endDate.toISOString();

    // Overlap guard via RPC (if it exists in this DB; otherwise rely on slot-engine freshness)
    try {
        const { data: overlap } = await supabase.rpc("check_appointment_overlap", {
            p_professional_id: ctx.professional.id,
            p_start_time: startIso,
            p_end_time: endIso,
            p_exclude_id: null,
        });
        if (overlap === true) {
            console.warn(`[respond] race: slot ${slot.time} now overlapping — recomputing`);
            return null;
        }
    } catch (err) {
        // RPC not available — continue; worst case is a rare DB constraint violation which we catch below.
    }

    // contact_id: patient.contact_id preferred, else session.contact_id
    const contactId = ctx.patient.contact_id || session.contact_id;

    const { data: apt, error: aptErr } = await supabase
        .from("appointments")
        .insert({
            user_id: session.user_id,
            professional_id: ctx.professional.id,
            contact_id: contactId,
            service_id: ctx.service.id,
            start_time: startIso,
            end_time: endIso,
            price: 0,
            description: `Agendado automaticamente via Delivery Automation (${ctx.service.name})`,
            type: "appointment",
            status: "pending",
            service_name: ctx.service.name,
            professional_name: ctx.professional.name,
        })
        .select("id")
        .single();

    if (aptErr) {
        console.error("[respond] appointment insert failed:", aptErr.message);
        return null;
    }

    // Update delivery → 'procedimento_agendado'
    await supabase
        .from("deliveries")
        .update({
            stage: "procedimento_agendado",
            appointment_id: apt.id,
        })
        .eq("id", ctx.delivery.id);

    // Fire-and-forget Google Calendar sync
    supabase.functions
        .invoke("google-calendar-sync", { body: { appointment_id: apt.id } })
        .catch((err: any) => console.warn("[respond] gcal sync fire-and-forget error:", err?.message));

    return apt.id;
}

async function transferToHuman(supabase: any, session: any, ctx: SessionContext): Promise<void> {
    const patch: Record<string, unknown> = {
        status: "pending",
        assigned_agent_id: null,
    };
    if (ctx.humanQueueId) patch.queue_id = ctx.humanQueueId;

    await supabase
        .from("conversations")
        .update(patch)
        .eq("id", session.conversation_id);
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
