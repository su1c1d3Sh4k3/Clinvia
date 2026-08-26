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
import { isMetaInstance, pickAutomationInstance, type AutomationInstance } from "../_shared/automation-instance.ts";
import {
    buildTemplateParameters,
    ensureSystemTemplates,
    getSystemTemplateStatuses,
    getSystemTemplateVariableMaps,
    sendMetaTemplate,
    logTemplateSend,
    SYSTEM_TEMPLATE_NAMES,
    TPL_CONFIRM_MULTI,
    TPL_CONFIRM_SINGLE,
    TPL_FEEDBACK,
    TPL_REMINDER,
} from "../_shared/system-templates.ts";
import {
    isUazapiMessageEnabled,
    loadUazapiAutomationMessages,
    renderUazapiMessage,
    type UazapiAutomationMessage,
} from "../_shared/uazapi-automation-messages.ts";

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
        // Confirmações funcionam independente da IA (decisão do usuário) e não
        // dependem de ia_config existir: iteramos os users com agendamentos nas
        // janelas relevantes (24h antes, 2h antes, ~24h depois) + sessões abertas.
        const windowFrom = new Date(now.getTime() - 30 * 3600_000);
        const windowTo = new Date(now.getTime() + 26 * 3600_000);
        const { data: aptUsers } = await supabase
            .from("appointments")
            .select("user_id")
            .eq("type", "appointment")
            .gte("start_time", windowFrom.toISOString())
            .lte("start_time", windowTo.toISOString());

        const userIds = new Set<string>((aptUsers || []).map((a: any) => a.user_id));

        // Users com sessões não-terminais (sweep de timeout de feedback)
        const { data: sessUsers } = await supabase
            .from("appointment_confirmation_sessions")
            .select("user_id")
            .not("state", "in", "(completed,transferred,failed)");
        for (const s of sessUsers || []) userIds.add(s.user_id);

        if (!userIds.size) {
            return json({ success: true, sent: 0, message: "no users with appointments in window" });
        }

        // Nome da clínica: ia_config.name → fallback profiles.company_name
        const idList = [...userIds];
        const nameByUser = new Map<string, string>();
        const { data: profRows } = await supabase
            .from("profiles").select("id, company_name").in("id", idList);
        for (const p of profRows || []) {
            if (p.company_name) nameByUser.set(p.id, p.company_name);
        }
        const { data: cfgRows } = await supabase
            .from("ia_config").select("user_id, name").in("user_id", idList);
        for (const c of cfgRows || []) {
            if (c.name) nameByUser.set(c.user_id, c.name);
        }

        for (const cronUserId of idList) {
            try {
                // Pick automation instance (primária → Meta → qualquer conectada)
                const instance = await pickAutomationInstance(supabase, cronUserId);
                if (!instance) continue;

                const isMeta = isMetaInstance(instance);
                if (!isMeta && !instance.apikey) continue;

                // Meta: garante templates de sistema criados e carrega statuses
                let templateStatuses = new Map<string, string>();
                let variableMaps = new Map<string, string[]>();
                if (isMeta) {
                    try {
                        templateStatuses = await ensureSystemTemplates(supabase, cronUserId, instance.id);
                    } catch (err) {
                        console.error(`[ac-cron] ensureSystemTemplates failed for ${cronUserId}:`, err);
                        templateStatuses = await getSystemTemplateStatuses(supabase, {
                            id: instance.id,
                            meta_waba_id: instance.meta_waba_id,
                        });
                    }
                    variableMaps = await getSystemTemplateVariableMaps(supabase, {
                        id: instance.id,
                        meta_waba_id: instance.meta_waba_id,
                    });
                }

                // Switches liga/desliga por template — Meta only (ausência de linha = ligado)
                const templateEnabled = new Map<string, boolean>();
                if (isMeta) {
                    const { data: settingRows } = await supabase
                        .from("automation_template_settings")
                        .select("template_name, enabled")
                        .eq("user_id", cronUserId)
                        .in("template_name", SYSTEM_TEMPLATE_NAMES);
                    for (const s of settingRows || []) {
                        templateEnabled.set(s.template_name, s.enabled !== false);
                    }
                }

                // UAZAPI: mensagens editadas + switches independentes
                const uazapiMessages = isMeta
                    ? new Map<string, UazapiAutomationMessage>()
                    : await loadUazapiAutomationMessages(supabase, cronUserId);

                const ctx: CronContext = {
                    supabase,
                    userId: cronUserId,
                    instance,
                    isMeta,
                    templateStatuses,
                    variableMaps,
                    templateEnabled,
                    uazapiMessages,
                    clinicName: nameByUser.get(cronUserId) || "a clínica",
                    now,
                };

                // Prioridade de envio: mensagens automáticas > monitoramento > campanhas.
                // Hold pausa o campaign-dispatch nesta instância enquanto os fluxos
                // rodam (expira em 5min sozinho — crash safety); limpo no finally.
                await supabase
                    .from("instances")
                    .update({ automation_hold_until: new Date(now.getTime() + 5 * 60_000).toISOString() })
                    .eq("id", instance.id);

                try {
                    // Meta: planner materializa a fila (Agendadas do painel + retry 3x)
                    if (isMeta) await planQueue(ctx);

                    const r1 = await processConfirm24h(ctx);
                    const r2 = await processReminder2h(ctx);
                    const r3 = await processFeedback24h(ctx);
                    await processFeedbackTimeout(ctx);

                    totalSent += r1.sent + r2.sent + r3.sent;
                    totalErrors += r1.errors + r2.errors + r3.errors;
                } finally {
                    await supabase
                        .from("instances")
                        .update({ automation_hold_until: null })
                        .eq("id", instance.id);
                }
            } catch (err) {
                console.error(`[ac-cron] error for user ${cronUserId}:`, err);
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
    instance: AutomationInstance;
    isMeta: boolean;
    templateStatuses: Map<string, string>;
    variableMaps: Map<string, string[]>;
    templateEnabled: Map<string, boolean>;
    uazapiMessages: Map<string, UazapiAutomationMessage>;
    clinicName: string;
    now: Date;
}

/** Switch liga/desliga por provedor (default: ligado). Meta e UAZAPI são independentes. */
function isTemplateEnabled(ctx: CronContext, tplName: string): boolean {
    return ctx.isMeta
        ? ctx.templateEnabled.get(tplName) !== false
        : isUazapiMessageEnabled(ctx.uazapiMessages, tplName);
}

// ---------------------------------------------------------------------------
// Fila materializada (automation_send_queue) — SÓ Meta (decisão do usuário).
// Planner projeta os envios futuros ('scheduled'); os senders processam a fila
// com até 3 tentativas (30min entre elas) → 'sent' | 'failed' (Rejeitada) |
// 'canceled' (agendamento cancelado antes do envio) | 'skipped' (sem número).
// Template desligado NÃO entra na fila (não conta como Agendada).
// ---------------------------------------------------------------------------

const QUEUE_MAX_ATTEMPTS = 3;
const QUEUE_RETRY_DELAY_MS = 30 * 60_000;

interface QueueTarget {
    contactId: string;
    dateBR: string;
    row?: any; // linha da automation_send_queue (modo Meta)
}

async function updateQueueRow(supabase: any, id: string, patch: Record<string, unknown>): Promise<void> {
    try {
        await supabase
            .from("automation_send_queue")
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", id);
    } catch (err) {
        console.error("[ac-cron] updateQueueRow error:", err);
    }
}

async function queueAttemptFailed(supabase: any, row: any, errorMsg: string): Promise<void> {
    const attempts = (row.attempts || 0) + 1;
    const failedFinal = attempts >= QUEUE_MAX_ATTEMPTS;
    await updateQueueRow(supabase, row.id, {
        attempts,
        last_error: String(errorMsg).slice(0, 500),
        status: failedFinal ? "failed" : "scheduled",
        next_attempt_at: failedFinal ? null : new Date(Date.now() + QUEUE_RETRY_DELAY_MS).toISOString(),
    });
}

/** Linhas da fila prontas para envio; marca como 'failed' as que perderam a janela. */
async function fetchDueQueueTargets(
    ctx: CronContext,
    flowType: string,
    opts: { expireAfterMs?: number; expireIfDayArrived?: boolean },
): Promise<QueueTarget[]> {
    const { supabase, userId, now } = ctx;
    const { data: rows } = await supabase
        .from("automation_send_queue")
        .select("*")
        .eq("user_id", userId)
        .eq("flow_type", flowType)
        .eq("status", "scheduled")
        .lte("scheduled_for", now.toISOString())
        .order("scheduled_for", { ascending: true });

    const todayYmd = utcToBrasiliaParts(now).ymd;
    const due: QueueTarget[] = [];
    for (const row of rows || []) {
        // confirm_24h só faz sentido na véspera ("amanhã às..."); no dia = janela perdida
        const dayArrived = !!opts.expireIfDayArrived && row.appointment_date <= todayYmd;
        const msExpired = opts.expireAfterMs != null &&
            now.getTime() > new Date(row.scheduled_for).getTime() + opts.expireAfterMs;
        if (dayArrived || msExpired) {
            await updateQueueRow(supabase, row.id, {
                status: "failed",
                last_error: row.last_error || "janela de envio perdida (não enviada a tempo)",
            });
            continue;
        }
        if (row.next_attempt_at && new Date(row.next_attempt_at).getTime() > now.getTime()) continue;
        due.push({ contactId: row.contact_id, dateBR: row.appointment_date, row });
    }
    return due;
}

/** Projeta envios futuros na fila + sweep de cancelamento. Roda a cada ciclo (Meta). */
async function planQueue(ctx: CronContext): Promise<void> {
    const { supabase, userId, now } = ctx;
    try {
        const todayYmd = utcToBrasiliaParts(now).ymd;
        type Plan = {
            flow: string;
            groups: Map<string, any[]>;
            tplFor: (g: any[]) => string;
            schedFor: (g: any[]) => Date;
        };
        const plans: Plan[] = [];

        // confirm_24h: agendamentos de dias FUTUROS (BRT) nas próximas 50h; envio = start−24h
        const { data: confApts } = await supabase
            .from("appointments")
            .select("id, contact_id, start_time")
            .eq("user_id", userId)
            .eq("type", "appointment")
            .in("status", ["pending", "confirmed", "rescheduled"])
            .gte("start_time", now.toISOString())
            .lte("start_time", new Date(now.getTime() + 50 * 3600_000).toISOString());
        const confGroups = groupByContactAndDay(confApts || []);
        for (const key of [...confGroups.keys()]) {
            const dateBR = key.split("__")[1];
            if (dateBR <= todayYmd) confGroups.delete(key); // confirmação é sempre na véspera
        }
        plans.push({
            flow: "confirm_24h",
            groups: confGroups,
            tplFor: (g) => (g.length > 1 ? TPL_CONFIRM_MULTI : TPL_CONFIRM_SINGLE),
            schedFor: (g) => new Date(new Date(g[0].start_time).getTime() - 24 * 3600_000),
        });

        // reminder_2h: agendamentos das próximas 26h; envio = start−2h
        const { data: remApts } = await supabase
            .from("appointments")
            .select("id, contact_id, start_time")
            .eq("user_id", userId)
            .eq("type", "appointment")
            .in("status", ["pending", "confirmed", "rescheduled"])
            .gte("start_time", now.toISOString())
            .lte("start_time", new Date(now.getTime() + 26 * 3600_000).toISOString());
        plans.push({
            flow: "reminder_2h",
            groups: groupByContactAndDay(remApts || []),
            tplFor: () => TPL_REMINDER,
            schedFor: (g) => new Date(new Date(g[0].start_time).getTime() - 2 * 3600_000),
        });

        // feedback_24h: atendimentos encerrados nas últimas 48h; envio = end+24h
        const { data: fbApts } = await supabase
            .from("appointments")
            .select("id, contact_id, start_time, end_time")
            .eq("user_id", userId)
            .eq("type", "appointment")
            .in("status", ["confirmed", "completed", "waiting"])
            .gte("end_time", new Date(now.getTime() - 48 * 3600_000).toISOString())
            .lte("end_time", now.toISOString());
        plans.push({
            flow: "feedback_24h",
            groups: groupByContactAndDay(fbApts || []),
            tplFor: () => TPL_FEEDBACK,
            schedFor: (g) => new Date(new Date(g[0].end_time || g[0].start_time).getTime() + 24 * 3600_000),
        });

        // Linhas existentes no horizonte (diff + sweep de cancelamento)
        const { data: existingRows } = await supabase
            .from("automation_send_queue")
            .select("id, flow_type, contact_id, appointment_date, status, template_name, appointment_ids, scheduled_for")
            .eq("user_id", userId)
            .gte("scheduled_for", new Date(now.getTime() - 48 * 3600_000).toISOString());
        const rowByKey = new Map<string, any>();
        for (const r of existingRows || []) {
            rowByKey.set(`${r.flow_type}__${r.contact_id}__${r.appointment_date}`, r);
        }

        const plannedKeys = new Set<string>();
        const inserts: any[] = [];

        for (const plan of plans) {
            for (const [key, group] of plan.groups) {
                const [contactId, dateBR] = key.split("__");
                const tplName = plan.tplFor(group);
                if (!isTemplateEnabled(ctx, tplName)) continue; // desligado ≠ Agendada
                const mapKey = `${plan.flow}__${contactId}__${dateBR}`;
                plannedKeys.add(mapKey);
                const schedDate = plan.schedFor(group);
                const ids = group.map((a: any) => a.id).sort();
                const row = rowByKey.get(mapKey);
                if (!row) {
                    inserts.push({
                        user_id: userId,
                        flow_type: plan.flow,
                        template_name: tplName,
                        contact_id: contactId,
                        appointment_ids: ids,
                        appointment_date: dateBR,
                        scheduled_for: schedDate.toISOString(),
                    });
                } else if (row.status === "scheduled") {
                    // Replaneja enquanto não enviada (novo agendamento no dia,
                    // reagendamento muda horário, single→multi etc.)
                    const sameIds = JSON.stringify([...(row.appointment_ids || [])].sort()) === JSON.stringify(ids);
                    const sameSched = Math.abs(new Date(row.scheduled_for).getTime() - schedDate.getTime()) < 1000;
                    if (row.template_name !== tplName || !sameIds || !sameSched) {
                        await updateQueueRow(supabase, row.id, {
                            template_name: tplName,
                            appointment_ids: ids,
                            scheduled_for: schedDate.toISOString(),
                        });
                    }
                }
            }
        }

        if (inserts.length) {
            await supabase
                .from("automation_send_queue")
                .upsert(inserts, { onConflict: "user_id,flow_type,contact_id,appointment_date", ignoreDuplicates: true });
        }

        // Sweep: linhas 'scheduled' que saíram do plano — se nenhum appointment
        // do grupo continua válido → cancelada (não conta como Agendada).
        // Se ainda houver appointment válido (só saiu da janela), a expiração
        // do sender resolve (failed).
        const unplanned = (existingRows || []).filter((r: any) =>
            r.status === "scheduled" && !plannedKeys.has(`${r.flow_type}__${r.contact_id}__${r.appointment_date}`));
        if (unplanned.length) {
            const allIds = [...new Set(unplanned.flatMap((r: any) => r.appointment_ids || []))];
            let statusById = new Map<string, string>();
            if (allIds.length) {
                const { data: apts } = await supabase
                    .from("appointments")
                    .select("id, status")
                    .in("id", allIds);
                statusById = new Map((apts || []).map((a: any) => [a.id, a.status]));
            }
            const validByFlow: Record<string, string[]> = {
                confirm_24h: ["pending", "confirmed", "rescheduled"],
                reminder_2h: ["pending", "confirmed", "rescheduled"],
                feedback_24h: ["confirmed", "completed", "waiting"],
            };
            for (const r of unplanned) {
                const stillValid = (r.appointment_ids || []).some((id: string) =>
                    (validByFlow[r.flow_type] || []).includes(statusById.get(id) || ""));
                if (!stillValid) {
                    await updateQueueRow(supabase, r.id, {
                        status: "canceled",
                        last_error: "agendamento cancelado antes do envio",
                    });
                }
            }
        }
    } catch (err) {
        console.error("[ac-cron] planQueue error:", err);
    }
}

async function processConfirm24h(ctx: CronContext): Promise<{ sent: number; errors: number }> {
    const { supabase, userId, now } = ctx;

    let targets: QueueTarget[];
    if (ctx.isMeta) {
        // Meta: fila materializada (planner já projetou); expira quando o dia chega
        targets = await fetchDueQueueTargets(ctx, "confirm_24h", { expireIfDayArrived: true });
    } else {
        // UAZAPI: varredura por janela (comportamento original, fora da fila)
        const from = new Date(now.getTime() + 23 * 3600_000);
        const to = new Date(now.getTime() + 25 * 3600_000);
        const { data: windowAppointments } = await supabase
            .from("appointments")
            .select("id, contact_id, start_time, service_name, professional_name")
            .eq("user_id", userId)
            .eq("type", "appointment")
            .in("status", ["pending", "confirmed", "rescheduled"])
            .gte("start_time", from.toISOString())
            .lte("start_time", to.toISOString());

        const contactDays = new Map<string, QueueTarget>();
        for (const apt of windowAppointments || []) {
            if (!apt.contact_id) continue;
            const dateBR = utcToBrasiliaParts(new Date(apt.start_time)).ymd;
            const key = `${apt.contact_id}__${dateBR}`;
            if (!contactDays.has(key)) contactDays.set(key, { contactId: apt.contact_id, dateBR });
        }
        targets = [...contactDays.values()];
    }

    if (!targets.length) return { sent: 0, errors: 0 };

    let sent = 0, errors = 0;

    for (const target of targets) {
        const { contactId, dateBR, row } = target;
        try {
            // Check if already sent
            const { data: existing } = await supabase
                .from("appointment_confirmation_sessions")
                .select("id, created_at, last_prompt_message_id")
                .eq("contact_id", contactId)
                .eq("flow_type", "confirm_24h")
                .eq("appointment_date", dateBR)
                .maybeSingle();
            if (existing) {
                if (row) {
                    await updateQueueRow(supabase, row.id, {
                        status: "sent",
                        sent_at: existing.created_at,
                        message_id: existing.last_prompt_message_id,
                    });
                }
                continue;
            }

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
            if (!group.length) {
                if (row) await updateQueueRow(supabase, row.id, { status: "canceled", last_error: "agendamento cancelado antes do envio" });
                continue;
            }

            const { data: contact } = await supabase
                .from("contacts")
                .select("id, push_name, number, instance_id")
                .eq("id", contactId)
                .single();
            if (!contact?.number) {
                if (row) await updateQueueRow(supabase, row.id, { status: "skipped", last_error: "contato sem número de WhatsApp" });
                continue;
            }

            // Switch liga/desliga (independente por provedor)
            const tplName = group.length === 1 ? TPL_CONFIRM_SINGLE : TPL_CONFIRM_MULTI;
            if (!isTemplateEnabled(ctx, tplName)) {
                console.log(`[ac-cron] ${tplName} disabled by user — skipping confirm_24h for ${contactId}`);
                if (row) await updateQueueRow(supabase, row.id, { status: "skipped", last_error: "template desativado pelo cliente", template_name: tplName });
                continue;
            }

            const { conversationId } = await resolveConversation(supabase, userId, ctx.instance.id, contact);

            const firstName = (contact.push_name || "").split(" ")[0] || "cliente";

            let sendRes: { messageId: string | null };
            if (ctx.isMeta) {
                // Meta: template obrigatório — só envia se APPROVED (sem fallback)
                if (ctx.templateStatuses.get(tplName) !== "APPROVED") {
                    console.log(`[ac-cron] template ${tplName} not APPROVED — skipping confirm_24h for ${contactId}`);
                    if (row) await queueAttemptFailed(supabase, row, `template ${tplName} não aprovado na Meta`);
                    continue;
                }
                const a = group[0];
                const values: Record<string, string> = group.length === 1
                    ? {
                        nome_cliente: firstName,
                        horario: formatTimeBR(a.start_time),
                        clinica: ctx.clinicName,
                        servico: a.service_name || "atendimento",
                        profissional: a.professional_name || "nosso profissional",
                    }
                    : {
                        nome_cliente: firstName,
                        clinica: ctx.clinicName,
                        agendamentos: group.map((g: any) =>
                            `${formatTimeBR(g.start_time)} — ${g.service_name} com ${g.professional_name}`
                        ).join("; "),
                    };
                const parameters = buildTemplateParameters(tplName, ctx.variableMaps, values);
                sendRes = await sendMetaTemplate({
                    conversationId,
                    templateName: tplName,
                    parameters,
                    bodyPreview: buildConfirmMessage(firstName, group, ctx.clinicName),
                });
                await logTemplateSend(supabase, {
                    userId, templateName: tplName, conversationId,
                    contactId, sentVia: "automation",
                });
            } else {
                const a = group[0];
                const msgText = renderUazapiMessage(ctx.uazapiMessages, tplName, group.length === 1
                    ? {
                        nome_cliente: firstName,
                        horario: formatTimeBR(a.start_time),
                        clinica: ctx.clinicName,
                        servico: a.service_name || "atendimento",
                        profissional: a.professional_name || "nosso profissional",
                    }
                    : {
                        nome_cliente: firstName,
                        clinica: ctx.clinicName,
                        agendamentos: group.map((g: any) =>
                            `• ${formatTimeBR(g.start_time)} — ${g.service_name} com ${g.professional_name}`
                        ).join("\n"),
                    });

                const buttons: MenuButton[] = [
                    { id: "ac_confirm", text: "Sim, pode confirmar" },
                    { id: "ac_reschedule", text: "Vou precisar reagendar" },
                    { id: "ac_cancel", text: "Não vou poder ir" },
                ];

                sendRes = await sendMenu({
                    supabase,
                    userId,
                    conversationId,
                    instanceApikey: ctx.instance.apikey!,
                    number: contact.number,
                    text: msgText,
                    buttons,
                    trackSource: "appointment_confirmation",
                    trackId: `confirm_24h:${contactId}`,
                });
            }

            // Cliente permanece na etapa/fila atual (ex.: Agendado); o intercept
            // por sessão ativa já bloqueia a IA durante o fluxo de confirmação.

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

            if (row) {
                await updateQueueRow(supabase, row.id, {
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    message_id: sendRes.messageId,
                    template_name: tplName,
                    appointment_ids: group.map((a: any) => a.id),
                });
            }

            sent++;
            if (STAGGER_MS > 0) await sleep(STAGGER_MS);
        } catch (err) {
            console.error("[ac-cron] confirm_24h error:", err);
            errors++;
            if (row) await queueAttemptFailed(supabase, row, String((err as any)?.message || err));
        }
    }

    return { sent, errors };
}

// ---------------------------------------------------------------------------
// Flow 2: 2h before — Reminder text (no buttons)
// ---------------------------------------------------------------------------

async function processReminder2h(ctx: CronContext): Promise<{ sent: number; errors: number }> {
    const { supabase, userId, now } = ctx;

    let targets: QueueTarget[];
    if (ctx.isMeta) {
        // Meta: fila; expira quando chega o horário do atendimento (scheduled_for = start−2h)
        targets = await fetchDueQueueTargets(ctx, "reminder_2h", { expireAfterMs: 2 * 3600_000 });
    } else {
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

        const contactDays = new Map<string, QueueTarget>();
        for (const apt of windowAppointments || []) {
            if (!apt.contact_id) continue;
            const dateBR = utcToBrasiliaParts(new Date(apt.start_time)).ymd;
            const key = `${apt.contact_id}__${dateBR}`;
            if (!contactDays.has(key)) contactDays.set(key, { contactId: apt.contact_id, dateBR });
        }
        targets = [...contactDays.values()];
    }

    if (!targets.length) return { sent: 0, errors: 0 };

    let sent = 0, errors = 0;

    for (const target of targets) {
        const { contactId, dateBR, row } = target;
        try {
            const { data: existing } = await supabase
                .from("appointment_confirmation_sessions")
                .select("id, created_at, last_prompt_message_id")
                .eq("contact_id", contactId)
                .eq("flow_type", "reminder_2h")
                .eq("appointment_date", dateBR)
                .maybeSingle();
            if (existing) {
                if (row) {
                    await updateQueueRow(supabase, row.id, {
                        status: "sent",
                        sent_at: existing.created_at,
                        message_id: existing.last_prompt_message_id,
                    });
                }
                continue;
            }

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
            if (!group.length) {
                if (row) await updateQueueRow(supabase, row.id, { status: "canceled", last_error: "agendamento cancelado antes do envio" });
                continue;
            }

            const { data: contact } = await supabase
                .from("contacts")
                .select("id, push_name, number, instance_id")
                .eq("id", contactId)
                .single();
            if (!contact?.number) {
                if (row) await updateQueueRow(supabase, row.id, { status: "skipped", last_error: "contato sem número de WhatsApp" });
                continue;
            }

            if (!isTemplateEnabled(ctx, TPL_REMINDER)) {
                console.log(`[ac-cron] ${TPL_REMINDER} disabled by user — skipping reminder_2h for ${contactId}`);
                if (row) await updateQueueRow(supabase, row.id, { status: "skipped", last_error: "template desativado pelo cliente" });
                continue;
            }

            const { conversationId } = await resolveConversation(supabase, userId, ctx.instance.id, contact);

            const firstName = (contact.push_name || "").split(" ")[0] || "cliente";

            let reminderMsgId: string | null = null;
            if (ctx.isMeta) {
                if (ctx.templateStatuses.get(TPL_REMINDER) !== "APPROVED") {
                    console.log(`[ac-cron] template ${TPL_REMINDER} not APPROVED — skipping reminder_2h for ${contactId}`);
                    if (row) await queueAttemptFailed(supabase, row, `template ${TPL_REMINDER} não aprovado na Meta`);
                    continue;
                }
                const times = group.map((g: any) => formatTimeBR(g.start_time)).join(" e ");
                const res = await sendMetaTemplate({
                    conversationId,
                    templateName: TPL_REMINDER,
                    parameters: buildTemplateParameters(TPL_REMINDER, ctx.variableMaps, {
                        nome_cliente: firstName,
                        horarios: times,
                        clinica: ctx.clinicName,
                    }),
                    bodyPreview: buildReminderMessage(firstName, group),
                });
                reminderMsgId = res?.messageId ?? null;
                await logTemplateSend(supabase, {
                    userId, templateName: TPL_REMINDER, conversationId,
                    contactId, sentVia: "automation",
                });
            } else {
                const msgText = renderUazapiMessage(ctx.uazapiMessages, TPL_REMINDER, {
                    nome_cliente: firstName,
                    horarios: group.map((g: any) => formatTimeBR(g.start_time)).join(" e "),
                    clinica: ctx.clinicName,
                });
                await sendText({
                    supabase,
                    userId,
                    conversationId,
                    instanceApikey: ctx.instance.apikey!,
                    number: contact.number,
                    text: msgText,
                });
            }

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
                last_prompt_message_id: reminderMsgId,
            });

            if (row) {
                await updateQueueRow(supabase, row.id, {
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    message_id: reminderMsgId,
                    appointment_ids: group.map((a: any) => a.id),
                });
            }

            sent++;
            if (STAGGER_MS > 0) await sleep(STAGGER_MS);
        } catch (err) {
            console.error("[ac-cron] reminder_2h error:", err);
            errors++;
            if (row) await queueAttemptFailed(supabase, row, String((err as any)?.message || err));
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
        .in("status", ["confirmed", "completed", "waiting"])
        .gte("end_time", from.toISOString())
        .lte("end_time", to.toISOString());

    // Update confirmed/waiting → completed for ALL found (roda nos 2 modos —
    // auto-complete independe da fila/switch de template)
    for (const apt of windowAppointments || []) {
        if (apt.status === "confirmed" || apt.status === "waiting") {
            await supabase.from("appointments")
                .update({ status: "completed" })
                .eq("id", apt.id);
        }
    }

    let targets: QueueTarget[];
    if (ctx.isMeta) {
        // Meta: fila; expira 24h após o horário previsto de envio
        targets = await fetchDueQueueTargets(ctx, "feedback_24h", { expireAfterMs: 24 * 3600_000 });
    } else {
        const contactDays = new Map<string, QueueTarget>();
        for (const apt of windowAppointments || []) {
            if (!apt.contact_id) continue;
            const dateBR = utcToBrasiliaParts(new Date(apt.start_time)).ymd;
            const key = `${apt.contact_id}__${dateBR}`;
            if (!contactDays.has(key)) contactDays.set(key, { contactId: apt.contact_id, dateBR });
        }
        targets = [...contactDays.values()];
    }

    if (!targets.length) return { sent: 0, errors: 0 };

    let sent = 0, errors = 0;

    for (const target of targets) {
        const { contactId, dateBR, row } = target;
        try {
            const { data: existing } = await supabase
                .from("appointment_confirmation_sessions")
                .select("id, created_at, last_prompt_message_id")
                .eq("contact_id", contactId)
                .eq("flow_type", "feedback_24h")
                .eq("appointment_date", dateBR)
                .maybeSingle();
            if (existing) {
                if (row) {
                    await updateQueueRow(supabase, row.id, {
                        status: "sent",
                        sent_at: existing.created_at,
                        message_id: existing.last_prompt_message_id,
                    });
                }
                continue;
            }

            if (!isTemplateEnabled(ctx, TPL_FEEDBACK)) {
                console.log(`[ac-cron] ${TPL_FEEDBACK} disabled by user — skipping feedback_24h for ${contactId}`);
                if (row) await updateQueueRow(supabase, row.id, { status: "skipped", last_error: "template desativado pelo cliente" });
                continue;
            }

            // Fetch ALL appointments for this contact on this day and mark completed
            const dayStart = `${dateBR}T00:00:00-03:00`;
            const dayEnd = `${dateBR}T23:59:59-03:00`;
            const { data: allDayAppointments } = await supabase
                .from("appointments")
                .select("id, contact_id, start_time, end_time, status, service_name, professional_name")
                .eq("user_id", userId)
                .eq("contact_id", contactId)
                .eq("type", "appointment")
                .in("status", ["confirmed", "completed", "waiting"])
                .gte("start_time", dayStart)
                .lte("start_time", dayEnd)
                .order("start_time", { ascending: true });

            const group = (allDayAppointments || []).map((a: any) => ({ ...a, _dateBR: dateBR }));
            if (!group.length) {
                if (row) await updateQueueRow(supabase, row.id, { status: "canceled", last_error: "agendamento cancelado antes do envio" });
                continue;
            }

            // Also mark any remaining confirmed/waiting as completed
            for (const apt of group) {
                if (apt.status === "confirmed" || apt.status === "waiting") {
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
            if (!contact?.number) {
                if (row) await updateQueueRow(supabase, row.id, { status: "skipped", last_error: "contato sem número de WhatsApp" });
                continue;
            }

            const { conversationId } = await resolveConversation(supabase, userId, ctx.instance.id, contact);

            const firstName = (contact.push_name || "").split(" ")[0] || "cliente";

            let sendRes: { messageId: string | null };
            if (ctx.isMeta) {
                if (ctx.templateStatuses.get(TPL_FEEDBACK) !== "APPROVED") {
                    console.log(`[ac-cron] template ${TPL_FEEDBACK} not APPROVED — skipping feedback_24h for ${contactId}`);
                    if (row) await queueAttemptFailed(supabase, row, `template ${TPL_FEEDBACK} não aprovado na Meta`);
                    continue;
                }
                sendRes = await sendMetaTemplate({
                    conversationId,
                    templateName: TPL_FEEDBACK,
                    parameters: buildTemplateParameters(TPL_FEEDBACK, ctx.variableMaps, {
                        nome_cliente: firstName,
                        clinica: ctx.clinicName,
                    }),
                    bodyPreview: `Como vai ${firstName}, espero que esteja bem, estou passando para pedir seu feedback sobre seu atendimento aqui na clínica ontem, se puder por gentileza nos dar seu feedback:`,
                });
                await logTemplateSend(supabase, {
                    userId, templateName: TPL_FEEDBACK, conversationId,
                    contactId, sentVia: "automation",
                });
            } else {
                const msgText = renderUazapiMessage(ctx.uazapiMessages, TPL_FEEDBACK, {
                    nome_cliente: firstName,
                    clinica: ctx.clinicName,
                });
                const buttons: MenuButton[] = [
                    { id: "ac_fb_5", text: "Excelente" },
                    { id: "ac_fb_4", text: "Muito bom" },
                    { id: "ac_fb_3", text: "Regular" },
                    { id: "ac_fb_2", text: "Precisa melhorar" },
                    { id: "ac_fb_1", text: "Insatisfeito" },
                ];

                sendRes = await sendMenu({
                    supabase,
                    userId,
                    conversationId,
                    instanceApikey: ctx.instance.apikey!,
                    number: contact.number,
                    text: msgText,
                    buttons,
                    trackSource: "appointment_confirmation",
                    trackId: `feedback_24h:${contactId}`,
                });
            }

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

            // Card CRM em "Pesquisa de Satisfação" enquanto aguarda a resposta.
            // Se ainda houver card ativo (ex.: sem auto_complete), move-o; senão cria.
            try {
                const { data: activeCard } = await supabase
                    .from("crm_client")
                    .select("id, stage")
                    .eq("contact_id", contactId)
                    .eq("user_id", userId)
                    .eq("is_active", true)
                    .maybeSingle();

                if (activeCard) {
                    if (activeCard.stage !== "Pesquisa de Satisfação") {
                        await supabase
                            .from("crm_client")
                            .update({
                                stage: "Pesquisa de Satisfação",
                                stage_changed_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                            })
                            .eq("id", activeCard.id);
                    }
                } else {
                    await supabase.from("crm_client").insert({
                        user_id: userId,
                        contact_id: contactId,
                        stage: "Pesquisa de Satisfação",
                        stage_changed_at: new Date().toISOString(),
                        value: 0,
                        priority: "medium",
                        is_active: true,
                    });
                }
            } catch (crmErr) {
                console.error("[ac-cron] feedback_24h CRM card error:", crmErr);
            }

            if (row) {
                await updateQueueRow(supabase, row.id, {
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    message_id: sendRes.messageId,
                    appointment_ids: group.map((a: any) => a.id),
                });
            }

            sent++;
            if (STAGGER_MS > 0) await sleep(STAGGER_MS);
        } catch (err) {
            console.error("[ac-cron] feedback_24h error:", err);
            if (row) await queueAttemptFailed(supabase, row, String((err as any)?.message || err));
            errors++;
        }
    }

    return { sent, errors };
}

// ---------------------------------------------------------------------------
// Flow 4: feedback timeout — 24h sem resposta → card vai para Finalizado
// ---------------------------------------------------------------------------

async function processFeedbackTimeout(ctx: CronContext): Promise<void> {
    const { supabase, userId, now } = ctx;
    const cutoff = new Date(now.getTime() - 24 * 3600_000).toISOString();

    const { data: staleSessions } = await supabase
        .from("appointment_confirmation_sessions")
        .select("id, contact_id, conversation_id")
        .eq("user_id", userId)
        .eq("flow_type", "feedback_24h")
        .in("state", ["awaiting_feedback_rating", "awaiting_feedback_detail"])
        .lt("created_at", cutoff);

    for (const session of staleSessions || []) {
        try {
            await supabase
                .from("appointment_confirmation_sessions")
                .update({ state: "completed", ended_at: new Date().toISOString() })
                .eq("id", session.id);

            // Finaliza o card de Pesquisa de Satisfação sem resposta
            const { data: card } = await supabase
                .from("crm_client")
                .select("id, stage")
                .eq("contact_id", session.contact_id)
                .eq("user_id", userId)
                .eq("is_active", true)
                .eq("stage", "Pesquisa de Satisfação")
                .maybeSingle();

            if (card) {
                // Resolve a conversa antes (trigger de fila só afeta pending/open)
                await supabase
                    .from("conversations")
                    .update({ status: "resolved", updated_at: new Date().toISOString() })
                    .eq("id", session.conversation_id)
                    .in("status", ["pending", "open"]);

                await supabase
                    .from("crm_client")
                    .update({
                        stage: "Finalizado",
                        is_active: false,
                        stage_changed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", card.id);
            }
            console.log(`[ac-cron] feedback timeout: session ${session.id} finalized`);
        } catch (err) {
            console.error("[ac-cron] feedback timeout error:", err);
        }
    }
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

// Fila da conversa nova (regra padrão 9ca9233, igual campaign-dispatch):
// ia_config.ia_on && instances.ia_on_wpp → 'Atendimento IA',
// senão 'Atendimento Humano'. Conversa SEM fila é proibida (user rule) —
// ficava invisível nos agrupamentos por fila do inbox.
const defaultQueueCache = new Map<string, string | null>();

async function resolveDefaultQueueId(
    supabase: any,
    userId: string,
    instanceId: string,
): Promise<string | null> {
    const cacheKey = `${userId}:${instanceId}`;
    if (defaultQueueCache.has(cacheKey)) return defaultQueueCache.get(cacheKey) ?? null;

    const [iaCfgRes, instRes] = await Promise.all([
        supabase.from("ia_config").select("ia_on").eq("user_id", userId).maybeSingle(),
        supabase.from("instances").select("ia_on_wpp").eq("id", instanceId).maybeSingle(),
    ]);
    const iaOn = iaCfgRes.data?.ia_on === true && instRes.data?.ia_on_wpp === true;
    const queueName = iaOn ? "Atendimento IA" : "Atendimento Humano";

    const { data: queue } = await supabase
        .from("queues")
        .select("id")
        .eq("user_id", userId)
        .eq("name", queueName)
        .limit(1)
        .maybeSingle();
    defaultQueueCache.set(cacheKey, queue?.id ?? null);
    return queue?.id ?? null;
}

async function resolveConversation(
    supabase: any,
    userId: string,
    instanceId: string,
    contact: { id: string; number: string; push_name: string | null; instance_id: string | null },
): Promise<{ conversationId: string }> {
    // Find existing open/pending conversation NA MESMA instância do envio —
    // meta-send-message usa a instância da conversa; reutilizar conversa de
    // outra instância (ex.: UAZAPI antiga) quebrava com
    // "Instance is not a Meta Cloud API instance"
    const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, status")
        .eq("contact_id", contact.id)
        .eq("user_id", userId)
        .eq("instance_id", instanceId)
        .in("status", ["pending", "open"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingConv?.id) {
        return { conversationId: existingConv.id };
    }

    // Create new conversation (never reopen resolved)
    const queueId = await resolveDefaultQueueId(supabase, userId, instanceId);
    const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
            contact_id: contact.id,
            user_id: userId,
            instance_id: instanceId,
            status: "pending",
            queue_id: queueId,
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
