import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getWorkHoursForDay } from "../_shared/professional-schedule.ts";
import { TERMINAL_STAGES } from "../_shared/crm-stages.ts";
import { applyCampaignDiscount, type CampaignDiscountInfo } from "../_shared/campaign-discount.ts";
import {
    ConversationResolutionError,
    findActiveCardForChannel,
    resolveConversation,
} from "../_shared/resolve-conversation.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function pad(n: number): string { return String(n).padStart(2, "0"); }

/** UTC → São Paulo (-03:00): "2026-07-28T18:00:00+00:00" → "2026-07-28T15:00:00-03:00" */
function toSaoPaulo(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso as string;
    return d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00";
}

// Same semantics as api-availability
function parseWorkTime(t: any): number | null {
    if (t == null) return null;
    if (typeof t === "string" && t.includes(":")) {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
    }
    const num = parseFloat(t);
    return isNaN(num) ? null : num * 60;
}

const DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/**
 * Validates the professional's work schedule (work_days, work_hours, break) for a
 * local date/time. Returns an error message or null if valid.
 * check_appointment_overlap only catches conflicts with other appointments — without
 * this, bookings could silently land outside the professional's schedule.
 */
function validateWorkSchedule(prof: any, dateStr: string, timeStr: string, duration: number): string | null {
    const dow = new Date(dateStr + "T12:00:00").getDay();
    const workDays: number[] = prof.work_days || [0, 1, 2, 3, 4, 5, 6];
    if (!workDays.includes(dow)) {
        return `${prof.name} não atende na ${DAY_NAMES[dow]} (${dateStr})`;
    }

    const [h, m] = timeStr.split(":").map(Number);
    const start = h * 60 + (m || 0);
    const end = start + duration;

    const wh = getWorkHoursForDay(prof, dow);
    const whStart = parseWorkTime(wh.start) ?? 8 * 60;
    const whEnd = parseWorkTime(wh.end) ?? 20 * 60;
    if (start < whStart || end > whEnd) {
        return `${timeStr} está fora do expediente de ${prof.name} nesse dia`;
    }

    const breakStart = parseWorkTime(wh.break_start);
    const breakEnd = parseWorkTime(wh.break_end);
    if (breakStart !== null && breakEnd !== null && start < breakEnd && end > breakStart) {
        return `${timeStr} cai no intervalo/pausa de ${prof.name}`;
    }

    return null;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
        if (!envApiKey || apiKey !== envApiKey) {
            return new Response(JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const body = await req.json();
        const { action, user_id } = body;

        if (!user_id) {
            return new Response(JSON.stringify({ error: "Missing user_id" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // A conversa carrega contato + conexão. `fetch_appointments` e
        // `create_appointment` exigem conversation_id; reschedule/cancel derivam
        // a conexão do próprio agendamento (appointments.instance_id).
        const conv = (action === "fetch_appointments" || action === "create_appointment")
            ? await resolveConversation(supabase, body.conversation_id, user_id)
            : null;

        // Helper: resolve service_client by application name
        const resolveService = async (serviceName: string) => {
            const { data } = await supabase.from("services_client")
                .select("id, name, price, min_price, duration_minutes, category_id, service_name_id, professionals")
                .eq("user_id", user_id).ilike("name", serviceName).eq("status", true)
                .limit(1).maybeSingle();
            if (!data) throw new Error(`Aplicação "${serviceName}" não encontrada`);
            return data;
        };

        // Helper: find a professional for the service
        const resolveProfessional = async (sc: any, preferredName?: string) => {
            const profIds: string[] = sc.professionals || [];
            if (profIds.length === 0) throw new Error(`Nenhum profissional atrelado ao serviço "${sc.name}"`);

            const { data: profs } = await supabase.from("professionals")
                .select("id, name, work_hours, work_days, use_daily_schedule, work_hours_daily")
                .in("id", profIds);
            if (!profs || profs.length === 0) throw new Error(`Nenhum profissional encontrado para o serviço "${sc.name}"`);

            const names = profs.map((p: any) => p.name).join(", ");

            if (preferredName) {
                const match = profs.find((p: any) => p.name.toLowerCase().includes(preferredName.toLowerCase()));
                if (match) return match;
                throw new Error(`Profissional "${preferredName}" não atende o serviço "${sc.name}". Disponíveis: ${names}`);
            }

            if (profs.length === 1) return profs[0];
            throw new Error(`Serviço "${sc.name}" tem mais de um profissional — informe professional_name. Disponíveis: ${names}`);
        };

        // Helper: campanha ativa da instância onde o contato recebeu envio.
        // A instância vem da conversa → vincula o agendamento à campanha (congela
        // a entrada como 'Agendado') e aplica discount_pct se o serviço estiver nela.
        const resolveCampaignForContact = async (cid: string, instanceId?: string | null): Promise<CampaignDiscountInfo | null> => {
            if (!instanceId) return null;
            try {
                const { data: camps } = await supabase.from("campaigns")
                    .select("id, discount_pct, services")
                    .eq("user_id", user_id)
                    .eq("instance_id", instanceId)
                    .in("status", ["dispatching", "dispatched"])
                    .gt("valid_until", new Date().toISOString())
                    .order("scheduled_at", { ascending: false });

                for (const c of camps || []) {
                    const { data: cc } = await supabase.from("campaign_contacts")
                        .select("id")
                        .eq("campaign_id", c.id)
                        .eq("contact_id", cid)
                        .eq("status", "sent")
                        .limit(1)
                        .maybeSingle();
                    if (cc) return c as CampaignDiscountInfo;
                }
            } catch (err) {
                console.warn("[api-scheduling] resolveCampaignForContact error:", err);
            }
            return null;
        };

        // ══════════════════════════════════════════════
        // ACTION: fetch_appointments
        // ══════════════════════════════════════════════
        if (action === "fetch_appointments") {
            const contactId = conv!.contactId;

            let query = supabase.from("appointments")
                .select("id, service_name, professional_name, start_time, end_time, status, price, type, category_id, service_name_id, service_id")
                .eq("user_id", user_id).eq("contact_id", contactId);

            // Optional status filter (e.g. "pending"); default keeps excluding closed ones
            if (body.status) {
                query = query.eq("status", body.status);
            } else {
                query = query.not("status", "in", "(completed,canceled,no_show)");
            }

            const { data, error } = await query.order("start_time", { ascending: false });

            if (error) throw error;

            return new Response(JSON.stringify({
                conversation_id: conv!.conversationId,
                contact_id: contactId,
                appointments: (data || []).map((a: any) => ({
                    id: a.id,
                    service: a.service_name,
                    professional: a.professional_name,
                    date: toSaoPaulo(a.start_time)?.split("T")[0],
                    start_time: toSaoPaulo(a.start_time),
                    end_time: toSaoPaulo(a.end_time),
                    status: a.status,
                    price: a.price,
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: create_appointment
        // ══════════════════════════════════════════════
        if (action === "create_appointment") {
            const { service_name, date, time, professional_name, description } = body;
            if (!service_name || !date || !time) throw new Error("Missing service_name, date or time");

            const cid = conv!.contactId;
            const campaign = await resolveCampaignForContact(cid, conv!.instanceId);
            const sc = await resolveService(service_name);
            const prof = await resolveProfessional(sc, professional_name);
            const duration = sc.duration_minutes || 30;
            // Preço com desconto de campanha (se o serviço estiver na campanha ativa);
            // a venda criada pelo trigger herda esse valor
            const finalPrice = applyCampaignDiscount(sc.price || 0, campaign, sc.id);

            // Build datetime (input is local BRT → store as UTC+3)
            const startISO = `${date}T${time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + duration * 60000);

            // Validate not in the past
            if (startDate < new Date()) {
                return new Response(JSON.stringify({ error: "Não é possível agendar no passado" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Validate professional work schedule (work_days/work_hours/break)
            const scheduleError = validateWorkSchedule(prof, date, time, duration);
            if (scheduleError) {
                return new Response(JSON.stringify({ error: `${scheduleError}. Consulte a disponibilidade (api-availability) para horários válidos.` }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Check overlap
            const { data: overlap } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: prof.id,
                p_start_time: startDate.toISOString(),
                p_end_time: endDate.toISOString(),
                p_exclude_id: null,
            });
            if (overlap) {
                return new Response(JSON.stringify({ error: "Horário indisponível (conflito com outro agendamento)" }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const payload = {
                user_id,
                professional_id: prof.id,
                contact_id: cid,
                service_id: sc.id,
                category_id: sc.category_id,
                service_name_id: sc.service_name_id,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                price: finalPrice,
                description: description || null,
                type: "appointment",
                campaign_id: campaign?.id ?? null,
                instance_id: conv!.instanceId,
                created_via: "ia",
            };

            const { data: created, error } = await supabase.from("appointments").insert(payload).select().single();
            if (error) throw error;

            // Google Calendar sync (fire-and-forget)
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "sync_appointment", appointment_id: created.id, user_id }),
                }).catch(() => {});
            } catch (_) {}

            // CRM sync: move/create card to Agendado + add service — o card é do
            // funil da conexão desta conversa
            try {
                const activeCard = await findActiveCardForChannel(supabase, conv!);

                if (activeCard) {
                    const terminals = TERMINAL_STAGES;
                    if (terminals.includes(activeCard.stage)) {
                        // Terminal → create new card
                        const { data: newCard } = await supabase.from("crm_client").insert({
                            user_id, contact_id: cid, stage: "Agendado",
                            instance_id: conv!.instanceId,
                            instagram_instance_id: conv!.instagramInstanceId,
                            stage_changed_at: new Date().toISOString(), value: 0,
                            professional_id: prof.id, priority: "medium", is_active: true,
                        }).select().single();
                        if (newCard) {
                            await supabase.from("crm_client_services").insert({
                                crm_client_id: newCard.id, service_client_id: sc.id,
                                service_name: sc.name, quantity: 1, unit_price: finalPrice, min_price: sc.min_price || 0,
                            });
                            await supabase.from("crm_client").update({ value: finalPrice }).eq("id", newCard.id);
                        }
                    } else {
                        // Move to Agendado
                        if (activeCard.stage !== "Agendado") {
                            await supabase.from("crm_client").update({
                                stage: "Agendado", stage_changed_at: new Date().toISOString(),
                            }).eq("id", activeCard.id);
                        }
                        // Add service if not duplicate
                        const { data: existingSvc } = await supabase.from("crm_client_services")
                            .select("id").eq("crm_client_id", activeCard.id).eq("service_client_id", sc.id).maybeSingle();
                        if (!existingSvc) {
                            await supabase.from("crm_client_services").insert({
                                crm_client_id: activeCard.id, service_client_id: sc.id,
                                service_name: sc.name, quantity: 1, unit_price: finalPrice, min_price: sc.min_price || 0,
                            });
                            // Recalc value
                            const { data: allSvcs } = await supabase.from("crm_client_services")
                                .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                            const total = (allSvcs || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                        }
                    }
                } else {
                    // No card → create
                    const { data: newCard } = await supabase.from("crm_client").insert({
                        user_id, contact_id: cid, stage: "Agendado",
                        instance_id: conv!.instanceId,
                        instagram_instance_id: conv!.instagramInstanceId,
                        stage_changed_at: new Date().toISOString(), value: finalPrice,
                        professional_id: prof.id, priority: "medium", is_active: true,
                    }).select().single();
                    if (newCard) {
                        await supabase.from("crm_client_services").insert({
                            crm_client_id: newCard.id, service_client_id: sc.id,
                            service_name: sc.name, quantity: 1, unit_price: finalPrice, min_price: sc.min_price || 0,
                        });
                    }
                }
            } catch (crmErr) {
                console.warn("[api-scheduling] CRM sync error:", crmErr);
            }

            return new Response(JSON.stringify({
                success: true,
                appointment: {
                    id: created.id,
                    service: created.service_name,
                    professional: prof.name,
                    date,
                    start_time: toSaoPaulo(created.start_time),
                    end_time: toSaoPaulo(created.end_time),
                    price: created.price,
                    status: created.status,
                },
            }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: reschedule_appointment
        // ══════════════════════════════════════════════
        if (action === "reschedule_appointment") {
            const { appointment_id, new_date, new_time } = body;
            if (!appointment_id || !new_date || !new_time) throw new Error("Missing appointment_id, new_date or new_time");

            // Fetch existing to get duration
            const { data: existing } = await supabase.from("appointments")
                .select("start_time, end_time, professional_id")
                .eq("id", appointment_id).single();
            if (!existing) throw new Error("Agendamento não encontrado");

            const durationMs = new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime();
            const durationMin = durationMs / 60000;

            const startISO = `${new_date}T${new_time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + durationMin * 60000);

            if (startDate < new Date()) {
                return new Response(JSON.stringify({ error: "Não é possível reagendar para o passado" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Validate professional work schedule at the new date/time
            if (existing.professional_id) {
                const { data: profRec } = await supabase.from("professionals")
                    .select("id, name, work_hours, work_days, use_daily_schedule, work_hours_daily")
                    .eq("id", existing.professional_id).maybeSingle();
                if (profRec) {
                    const scheduleError = validateWorkSchedule(profRec, new_date, new_time, durationMin);
                    if (scheduleError) {
                        return new Response(JSON.stringify({ error: `${scheduleError}. Consulte a disponibilidade (api-availability) para horários válidos.` }),
                            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                    }
                }
            }

            // Check overlap
            const { data: overlap } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: existing.professional_id,
                p_start_time: startDate.toISOString(),
                p_end_time: endDate.toISOString(),
                p_exclude_id: appointment_id,
            });
            if (overlap) {
                return new Response(JSON.stringify({ error: "Novo horário indisponível (conflito)" }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const { data: updated, error } = await supabase.from("appointments").update({
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "rescheduled",
            }).eq("id", appointment_id).select().single();
            if (error) throw error;

            // Google Calendar sync
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "sync_appointment", appointment_id, user_id }),
                }).catch(() => {});
            } catch (_) {}

            // CRM: move card to Agendado — funil da conexão do agendamento
            if (updated.contact_id) {
                try {
                    const activeCard = await findActiveCardForChannel(supabase, {
                        contactId: updated.contact_id,
                        instanceId: updated.instance_id ?? null,
                        instagramInstanceId: null,
                    });
                    if (activeCard && activeCard.stage !== "Agendado") {
                        await supabase.from("crm_client").update({
                            stage: "Agendado", stage_changed_at: new Date().toISOString(),
                        }).eq("id", activeCard.id);
                    }
                } catch (crmErr) {
                    console.warn("[api-scheduling] CRM reschedule sync error:", crmErr);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                appointment: {
                    id: updated.id,
                    service: updated.service_name,
                    professional: updated.professional_name,
                    date: new_date,
                    start_time: toSaoPaulo(updated.start_time),
                    end_time: toSaoPaulo(updated.end_time),
                    status: updated.status,
                },
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: cancel_appointment
        // ══════════════════════════════════════════════
        if (action === "cancel_appointment") {
            const { appointment_id } = body;
            if (!appointment_id) throw new Error("Missing appointment_id");

            const { data: updated, error } = await supabase.from("appointments")
                .update({ status: "canceled" }).eq("id", appointment_id).select().single();
            if (error) throw error;

            // Google Calendar: delete event
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "delete_appointment", appointment_id, user_id }),
                }).catch(() => {});
            } catch (_) {}

            // CRM: create Perdido card for the canceled service
            if (updated.contact_id && updated.service_id) {
                try {
                    await supabase.from("crm_client").insert({
                        user_id, contact_id: updated.contact_id, stage: "Perdido",
                        instance_id: updated.instance_id ?? null,
                        stage_changed_at: new Date().toISOString(), value: updated.price || 0,
                        loss_reason: "canceled", loss_reason_other: "Cliente cancelou o agendamento",
                        is_active: false,
                    });
                    // Remove service from active deal — funil da conexão do agendamento
                    const activeCard = await findActiveCardForChannel(supabase, {
                        contactId: updated.contact_id,
                        instanceId: updated.instance_id ?? null,
                        instagramInstanceId: null,
                    });
                    if (activeCard) {
                        await supabase.from("crm_client_services").delete()
                            .eq("crm_client_id", activeCard.id).eq("service_client_id", updated.service_id);
                        const { data: remaining } = await supabase.from("crm_client_services")
                            .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                        if (remaining && remaining.length > 0) {
                            const total = remaining.reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                        } else {
                            await supabase.from("crm_client").update({ is_active: false }).eq("id", activeCard.id);
                        }
                    }
                } catch (crmErr) {
                    console.warn("[api-scheduling] CRM cancel sync error:", crmErr);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                appointment: { id: updated.id, status: "canceled" },
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        throw new Error(`Invalid action: "${action}". Valid: fetch_appointments, create_appointment, reschedule_appointment, cancel_appointment`);

    } catch (error) {
        const status = error instanceof ConversationResolutionError ? error.status : 400;
        return new Response(JSON.stringify({ error: error.message }),
            { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
