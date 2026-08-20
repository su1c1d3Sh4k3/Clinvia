import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    pickRecurrenceInstance,
    isMetaInstance,
    type AutomationInstance,
} from "../_shared/automation-instance.ts";
import {
    clampDispatchHour,
    clampRecurrenceDurationDays,
    randomDispatchTimeUtc,
} from "../_shared/recurrence-schedule.ts";
import {
    collectDueApproaches,
    groupDueApproaches,
    buildRecurrenceVars,
    buildRecurrenceCampaignName,
    buildRecurrenceObjective,
    RECURRENCE_STAGE_PROMPTS,
    toDispatchMessage,
    deriveApproachOutcome,
    type RecurrenceTrackingRow,
    type DueApproach,
} from "../_shared/recurrence-campaign.ts";

/**
 * recurrence-campaign-generator (pg_cron diário 05:00 BRT)
 *
 * R7-R13: gera as campanhas diárias de recorrência reutilizando o pipeline
 * inteiro de campanhas (campaign-dispatch-worker, takeover, tag, campaign_prompt,
 * mesmo payload n8n):
 *  1. Writeback R12: approach_N_status ← desfecho em campaign_contacts.
 *  2. Coleta abordagens vencendo hoje (recurrence_tracking, excluindo
 *     scheduled=true e já vinculadas), agrupa por (serviço, msg N).
 *  3. Cria campanhas "Recorrência - <serviço> - Msg<N> - <dd/MM/yyyy>":
 *     instância R14 (is_recurrence_primary → Meta → mais antiga), scheduled_at
 *     aleatório na janela [X:00, X+1:00) BRT (R18), desconto da mensagem,
 *     entries com vars snapshot, ai_prompt pelo mesmo gerador do campaign-manage.
 *  4. Gate R9: Meta sem template APPROVED ⇒ campanha nasce status 'blocked'
 *     (blocked_reason 'template_not_approved') e as abordagens seguem pendentes —
 *     entram na campanha do dia em que o template aprovar.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json; charset=utf-8",
};

function getSupabase() {
    return createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
}

function todayBRT(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

// ── Writeback R12 ────────────────────────────────────────────────────────────

async function writebackOutcomes(supabase: any) {
    const { data: rows } = await supabase
        .from("recurrence_tracking")
        .select(
            "id, contact_id, approach_1_status, approach_1_campaign_id, approach_2_status, approach_2_campaign_id, approach_3_status, approach_3_campaign_id",
        )
        .or(
            "approach_1_campaign_id.not.is.null,approach_2_campaign_id.not.is.null,approach_3_campaign_id.not.is.null",
        )
        .limit(3000);

    const pending: Array<{ trackingId: string; n: number; campaignId: string; contactId: string }> = [];
    for (const row of rows || []) {
        for (const n of [1, 2, 3]) {
            const campaignId = row[`approach_${n}_campaign_id`];
            const status = row[`approach_${n}_status`];
            // Reprocessa desfechos não-finais (sent/delivered podem evoluir)
            if (campaignId && row.contact_id && !["scheduled", "responded", "failed"].includes(status)) {
                pending.push({ trackingId: row.id, n, campaignId, contactId: row.contact_id });
            }
        }
    }
    if (!pending.length) return 0;

    const campaignIds = [...new Set(pending.map((p) => p.campaignId))];
    const ccByKey = new Map<string, any>();
    for (let i = 0; i < campaignIds.length; i += 100) {
        const { data: ccs } = await supabase
            .from("campaign_contacts")
            .select("campaign_id, contact_id, status, message_status, frozen_reason, frozen_responded, frozen_scheduled")
            .in("campaign_id", campaignIds.slice(i, i + 100));
        for (const cc of ccs || []) {
            if (cc.contact_id) ccByKey.set(`${cc.campaign_id}|${cc.contact_id}`, cc);
        }
    }

    let updated = 0;
    for (const p of pending) {
        const cc = ccByKey.get(`${p.campaignId}|${p.contactId}`);
        const outcome = cc ? deriveApproachOutcome(cc) : null;
        if (!outcome) continue;
        const { error } = await supabase
            .from("recurrence_tracking")
            .update({ [`approach_${p.n}_status`]: outcome, updated_at: new Date().toISOString() })
            .eq("id", p.trackingId);
        if (!error) updated++;
    }
    return updated;
}

// ── Geração por owner ────────────────────────────────────────────────────────

async function findOrCreateTag(supabase: any, ownerId: string, name: string): Promise<string | null> {
    const { data: existing } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", ownerId)
        .eq("name", name)
        .limit(1)
        .maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase
        .from("tags")
        .insert({ user_id: ownerId, name, color: "#8b5cf6", is_active: true })
        .select("id")
        .single();
    if (error) {
        console.warn(`[recurrence-generator] tag create failed (${name}):`, error.message);
        return null;
    }
    return created?.id ?? null;
}

async function getClinicName(supabase: any, ownerId: string): Promise<string> {
    const { data: ia } = await supabase
        .from("ia_config")
        .select("name")
        .eq("user_id", ownerId)
        .maybeSingle();
    if (ia?.name?.trim()) return ia.name.trim();
    const { data: profile } = await supabase
        .from("profiles")
        .select("company_name")
        .eq("id", ownerId)
        .maybeSingle();
    return profile?.company_name?.trim() || "nossa clínica";
}

async function getProfessionalNames(
    supabase: any,
    appointmentIds: string[],
): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    if (!appointmentIds.length) return map;
    const { data: appts } = await supabase
        .from("appointments")
        .select("id, professional_id")
        .in("id", appointmentIds);
    const profIds = [...new Set((appts || []).map((a: any) => a.professional_id).filter(Boolean))];
    if (!profIds.length) return map;
    const { data: profs } = await supabase
        .from("professionals")
        .select("id, name")
        .in("id", profIds);
    const nameById = new Map((profs || []).map((p: any) => [p.id, p.name]));
    for (const a of appts || []) {
        const name = a.professional_id ? nameById.get(a.professional_id) : null;
        if (name) map[a.id] = name;
    }
    return map;
}

async function processOwner(
    supabase: any,
    ownerId: string,
    rows: RecurrenceTrackingRow[],
    today: string,
): Promise<{ created: number; blocked: number; skippedGroups: number }> {
    const result = { created: 0, blocked: 0, skippedGroups: 0 };

    const instance: AutomationInstance | null = await pickRecurrenceInstance(supabase, ownerId);
    if (!instance) {
        console.log(`[recurrence-generator] Owner ${ownerId}: no connected instance — skipped`);
        return result;
    }
    const isMeta = isMetaInstance(instance);

    const dues = collectDueApproaches(rows, today);
    if (!dues.length) return result;

    // Abordagens anteriores também vencidas: marca 'skipped' (nunca 2 msgs no dia)
    for (const due of dues) {
        for (const n of due.skippedNumbers) {
            await supabase
                .from("recurrence_tracking")
                .update({ [`approach_${n}_status`]: "skipped", updated_at: new Date().toISOString() })
                .eq("id", due.trackingId);
        }
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("recurrence_dispatch_hour, recurrence_campaign_duration_days")
        .eq("id", ownerId)
        .maybeSingle();
    const hour = clampDispatchHour(profile?.recurrence_dispatch_hour);
    const durationDays = clampRecurrenceDurationDays(profile?.recurrence_campaign_duration_days);
    const clinicName = await getClinicName(supabase, ownerId);
    const professionalByAppointment = await getProfessionalNames(
        supabase,
        [...new Set(dues.map((d) => d.appointmentId).filter(Boolean))] as string[],
    );

    const groups = groupDueApproaches(dues);

    for (const [key, groupDues] of groups) {
        const [serviceClientId, msgStr] = key.split("|");
        const msgNumber = Number(msgStr) as 1 | 2 | 3;
        try {
            const { data: sc } = await supabase
                .from("services_client")
                .select("id, name, price, msg_recurrence_1, msg_recurrence_2, msg_recurrence_3, recurrence_discount_pct_1, recurrence_discount_pct_2, recurrence_discount_pct_3")
                .eq("id", serviceClientId)
                .maybeSingle();
            const messageText = sc?.[`msg_recurrence_${msgNumber}`]?.trim();
            if (!sc || !messageText) {
                result.skippedGroups++;
                continue;
            }

            // Gate R9: Meta exige template APPROVED vinculado (Fase 2)
            let template: any = null;
            let blocked = false;
            if (isMeta) {
                const { data: tpl } = await supabase
                    .from("message_templates")
                    .select("id, name, status, variable_map")
                    .eq("service_client_id", serviceClientId)
                    .eq("recurrence_msg_number", msgNumber)
                    .eq("instance_id", instance.id)
                    .maybeSingle();
                template = tpl;
                blocked = !tpl || tpl.status !== "APPROVED";
            }

            if (blocked) {
                // Evita empilhar bloqueadas: 1 campanha 'blocked' por (serviço, msg)
                const { data: existingBlocked } = await supabase
                    .from("campaigns")
                    .select("id")
                    .eq("user_id", ownerId)
                    .eq("recurrence_service_client_id", serviceClientId)
                    .eq("recurrence_msg_number", msgNumber)
                    .eq("status", "blocked")
                    .limit(1)
                    .maybeSingle();
                if (existingBlocked) {
                    result.skippedGroups++;
                    continue;
                }
            }

            const serviceName = groupDues[0].serviceName;
            const name = buildRecurrenceCampaignName(serviceName, msgNumber, today);
            const scheduledAt = randomDispatchTimeUtc(today, hour);
            const validUntil = new Date(
                new Date(scheduledAt).getTime() + durationDays * 24 * 60 * 60 * 1000,
            ).toISOString();
            const discountPct = sc[`recurrence_discount_pct_${msgNumber}`] ?? null;
            const initialMessage = toDispatchMessage(messageText);
            // Objetivo fixo por etapa (Prévia/Vencimento/Pós) — placeholders <var>
            // interpolados por contato no payload do n8n via raw_data da entry
            const objective = buildRecurrenceObjective(msgNumber);
            const services = [{ id: sc.id, name: `${serviceName} — ${sc.name}`, price: sc.price }];

            const tagId = await findOrCreateTag(supabase, ownerId, name);

            const { data: campaign, error: campErr } = await supabase
                .from("campaigns")
                .insert({
                    user_id: ownerId,
                    instance_id: instance.id,
                    name,
                    source_type: "recurrence",
                    source_config: {},
                    scheduled_at: scheduledAt,
                    valid_until: validUntil,
                    services,
                    discount_pct: discountPct,
                    initial_message: initialMessage,
                    variable_map: isMeta ? template?.variable_map || [] : [],
                    objective,
                    ai_prompt: RECURRENCE_STAGE_PROMPTS[msgNumber],
                    ia_enabled: true,
                    tag_id: tagId,
                    template_version: 1,
                    status: blocked ? "blocked" : "scheduled",
                    blocked_reason: blocked ? "template_not_approved" : null,
                    campaign_type: "promotion",
                    template_mode: isMeta ? "existing" : "none",
                    template_id: !blocked ? template?.id ?? null : null,
                    template_name: !blocked ? template?.name ?? null : null,
                    recurrence_date: today,
                    recurrence_service_client_id: serviceClientId,
                    recurrence_msg_number: msgNumber,
                })
                .select("id")
                .single();
            if (campErr) throw new Error(campErr.message);

            // Entries com vars snapshot (mesmo caminho do campaign-dispatch)
            const entryRows = groupDues.map((due: DueApproach) => ({
                campaign_id: campaign.id,
                user_id: ownerId,
                contact_id: due.contactId,
                raw_data: buildRecurrenceVars(due, {
                    clinicName,
                    price: sc.price,
                    professionalByAppointment,
                    todayISO: today,
                }),
                status: "pending",
            }));
            for (let i = 0; i < entryRows.length; i += 500) {
                const { error } = await supabase
                    .from("campaign_contacts")
                    .insert(entryRows.slice(i, i + 500));
                if (error) console.warn(`[recurrence-generator] entries insert error (${name}):`, error.message);
            }

            if (blocked) {
                // Abordagens seguem pendentes (sem campaign_id): entram na
                // campanha do dia em que o template aprovar (R9)
                result.blocked++;
                console.log(`[recurrence-generator] Campaign BLOCKED (${name}) — template not approved`);
                continue;
            }

            // Vincula abordagem → campanha (sai do radar do gerador)
            for (const due of groupDues) {
                await supabase
                    .from("recurrence_tracking")
                    .update({
                        [`approach_${msgNumber}_campaign_id`]: campaign.id,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", due.trackingId);
            }

            result.created++;
            console.log(`[recurrence-generator] Campaign created: ${name} (${entryRows.length} contacts)`);
        } catch (err: any) {
            console.error(`[recurrence-generator] group ${key} failed:`, err?.message || err);
        }
    }

    return result;
}

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = getSupabase();
        const today = todayBRT();

        const writebacks = await writebackOutcomes(supabase);

        const { data: candidates } = await supabase
            .from("recurrence_tracking")
            .select("*")
            .eq("scheduled", false)
            .or(
                [
                    `and(approach_1_status.eq.pendente,approach_1_date.lte.${today})`,
                    `and(approach_2_status.eq.pendente,approach_2_date.lte.${today})`,
                    `and(approach_3_status.eq.pendente,approach_3_date.lte.${today})`,
                ].join(","),
            )
            .limit(5000);

        const byOwner = new Map<string, RecurrenceTrackingRow[]>();
        for (const row of (candidates || []) as RecurrenceTrackingRow[]) {
            const list = byOwner.get(row.user_id) || [];
            list.push(row);
            byOwner.set(row.user_id, list);
        }

        const totals = { owners: byOwner.size, created: 0, blocked: 0, skippedGroups: 0, writebacks };
        for (const [ownerId, rows] of byOwner) {
            const r = await processOwner(supabase, ownerId, rows, today);
            totals.created += r.created;
            totals.blocked += r.blocked;
            totals.skippedGroups += r.skippedGroups;
        }

        console.log(`[recurrence-generator] Done:`, JSON.stringify(totals));
        return new Response(JSON.stringify({ success: true, ...totals }), { headers: corsHeaders });
    } catch (error: any) {
        console.error("[recurrence-generator] Fatal error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: corsHeaders,
        });
    }
});
