import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getWorkHoursForDay } from "../_shared/professional-schedule.ts";
import { isProfessionalDayBlocked } from "../_shared/day-blocks.ts";
import { TERMINAL_STAGES } from "../_shared/crm-stages.ts";
import { applyCampaignDiscount, type CampaignDiscountInfo } from "../_shared/campaign-discount.ts";
import { findActiveCardForChannel } from "../_shared/resolve-conversation.ts";
import {
    apiError,
    describeDbError,
    readJsonBody,
    unknownAction,
} from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ACTIONS = [
    "get_services", "get_prof_list", "get_slots",
    "create_booking", "get_pending", "cancel_booking", "reschedule_booking",
];

function pad(n: number): string { return String(n).padStart(2, "0"); }

/**
 * Esta API é a única lida por um PACIENTE (src/pages/PublicBooking.tsx mostra
 * `error` em tela). Então `error`/`message` sempre trazem texto humano e o
 * motivo técnico (Postgres, etc.) vai só em `details`, para o suporte.
 */
function patientError(
    status: number,
    code: string,
    message: string,
    technicalDetail?: unknown,
): Response {
    return apiError(corsHeaders, {
        status,
        code,
        message,
        details: technicalDetail ? String(technicalDetail) : undefined,
    });
}

/** Falha de banco: o paciente lê a orientação, o suporte lê o motivo. */
function patientDbError(code: string, operation: string, error: unknown, advice: string): Response {
    console.error("[api-public-booking]", describeDbError(operation, error));
    return patientError(500, code, advice, (error as any)?.message ?? error);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { action, user_id, contact_id, service_id, professional_id, date, time, appointment_id, instance_id } = body!;

        if (!user_id) {
            return patientError(400, "booking_link_invalid",
                "Este link de agendamento está incompleto (falta a identificação da clínica). Peça um link novo à clínica.");
        }
        if (!action) {
            return unknownAction(corsHeaders, action, VALID_ACTIONS);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // O token do link (payload `d`) carrega a conexão: sem ela não dá pra saber
        // em qual funil do CRM o agendamento entra.
        if (action === "create_booking" && !instance_id) {
            return patientError(400, "booking_link_without_connection",
                "Este link de agendamento foi gerado sem a conexão de WhatsApp da clínica, então o agendamento não pode ser registrado. Peça um link novo à clínica.");
        }

        /** 400 dizendo qual campo de data/hora veio no formato errado. */
        const checkDateTime = (): Response | null => {
            if (date !== undefined && date !== null && !DATE_RE.test(String(date))) {
                return patientError(400, "invalid_date_format",
                    `A data informada ("${date}") não está no formato esperado. Use AAAA-MM-DD (ex.: 2026-08-30).`);
            }
            if (time !== undefined && time !== null && !TIME_RE.test(String(time))) {
                return patientError(400, "invalid_time_format",
                    `O horário informado ("${time}") não está no formato esperado. Use HH:MM em 24 horas (ex.: 14:30).`);
            }
            return null;
        };

        // Campanha ativa da instância do link onde o contato recebeu envio.
        const resolveActiveCampaign = async (): Promise<CampaignDiscountInfo | null> => {
            if (!instance_id || !contact_id) return null;
            try {
                const { data: camps, error: campErr } = await supabase.from("campaigns")
                    .select("id, discount_pct, services")
                    .eq("user_id", user_id)
                    .eq("instance_id", instance_id)
                    .in("status", ["dispatching", "dispatched"])
                    .gt("valid_until", new Date().toISOString())
                    .order("scheduled_at", { ascending: false });
                // desconto é bônus: se falhar, segue com o preço cheio — mas o motivo fica no log
                if (campErr) {
                    console.warn("[api-public-booking]", describeDbError("buscar as campanhas ativas da conexão para aplicar desconto", campErr));
                    return null;
                }
                for (const c of camps || []) {
                    const { data: cc, error: ccErr } = await supabase.from("campaign_contacts")
                        .select("id")
                        .eq("campaign_id", c.id)
                        .eq("contact_id", contact_id)
                        .eq("status", "sent")
                        .limit(1)
                        .maybeSingle();
                    if (ccErr) {
                        console.warn("[api-public-booking]", describeDbError(`verificar se o contato recebeu a campanha ${c.id}`, ccErr));
                        continue;
                    }
                    if (cc) return c as CampaignDiscountInfo;
                }
            } catch (err) {
                console.warn("[api-public-booking] resolveActiveCampaign error:", err);
            }
            return null;
        };

        // ── get_services: categories + service_names + applications ──
        // Exibe APENAS a categoria Avaliação + serviços comprados e ainda não agendados (sem preços)
        if (action === "get_services") {
            const { data: sc, error: scErr } = await supabase.from("services_client")
                .select("id, name, description, duration_minutes, category_id, service_name_id, professionals")
                .eq("user_id", user_id).eq("status", true);
            if (scErr) {
                return patientDbError("services_read_failed", "carregar os serviços da clínica", scErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            const allCatIds = [...new Set((sc || []).map((s: any) => s.category_id))];
            const { data: allCats, error: catErr } = await supabase.from("services_category")
                .select("id, name, category_type").in("id", allCatIds).order("name");
            if (catErr) {
                return patientDbError("service_categories_read_failed", "carregar as categorias de serviço", catErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            // Categoria(s) "Avaliação" — sempre visível(is)
            const normalize = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const avaliacaoCatIds = new Set((allCats || [])
                .filter((c: any) => normalize(c.name) === "avaliacao")
                .map((c: any) => c.id));

            // Compras pendentes do contato (venda sem agendamento vinculado)
            const purchasedServiceIds = new Set<string>();
            if (contact_id) {
                const { data: pendingSales, error: salesErr } = await supabase.from("sales")
                    .select("service_client_id")
                    .eq("contact_id", contact_id)
                    .is("appointment_id", null)
                    .not("service_client_id", "is", null);
                if (salesErr) {
                    return patientDbError("purchased_services_read_failed", "buscar os serviços já comprados pelo contato", salesErr,
                        "Não conseguimos verificar os serviços que você já comprou. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                for (const s of pendingSales || []) purchasedServiceIds.add(s.service_client_id);
            }

            // Serviços da campanha ativa do link (se houver) também entram no catálogo
            const campaign = await resolveActiveCampaign();
            const campaignServiceIds = new Set<string>(
                (campaign?.services || []).map((s: any) => s?.id).filter(Boolean)
            );

            const visibleApps = (sc || []).filter((s: any) =>
                avaliacaoCatIds.has(s.category_id) || purchasedServiceIds.has(s.id) || campaignServiceIds.has(s.id));

            const catIds = [...new Set(visibleApps.map((s: any) => s.category_id))];
            const snIds = [...new Set(visibleApps.map((s: any) => s.service_name_id))];

            const cats = (allCats || []).filter((c: any) => catIds.includes(c.id));
            const { data: sns, error: snErr } = await supabase.from("service_name")
                .select("id, name, category_id").in("id", snIds).order("name");
            if (snErr) {
                return patientDbError("service_names_read_failed", "carregar os nomes dos serviços", snErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            return new Response(JSON.stringify({
                categories: cats,
                service_names: sns || [],
                applications: visibleApps.map((s: any) => ({
                    id: s.id, name: s.name, description: s.description, duration_minutes: s.duration_minutes,
                    category_id: s.category_id, service_name_id: s.service_name_id, professionals: s.professionals || [],
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_prof_list: all professionals ──
        if (action === "get_prof_list") {
            const { data: profs, error: profErr } = await supabase.from("professionals")
                .select("id, name, responsavel:responsaveis(role, photo_url)")
                .eq("user_id", user_id)
                .eq("active", true);
            if (profErr) {
                return patientDbError("professionals_read_failed", "carregar os profissionais da clínica", profErr,
                    "Não conseguimos carregar a lista de profissionais agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            // Foto e cargo são do profissional dono da sala; sala avulsa aparece sem eles.
            const profList = (profs || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                photo_url: p.responsavel?.photo_url ?? null,
                role: p.responsavel?.role ?? null,
            }));
            return new Response(JSON.stringify({ professionals: profList }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_slots: available time slots for a professional on a date ──
        if (action === "get_slots") {
            const missingSlots = [
                [professional_id, "o profissional", "professional_id"],
                [service_id, "o serviço", "service_id"],
                [date, "a data", "date"],
            ].filter(([v]) => !v);
            if (missingSlots.length > 0) {
                return patientError(400, "missing_fields",
                    `Não dá para consultar os horários: falta escolher ${missingSlots.map(([, label]) => label).join(", ")}. Volte e complete a seleção.`,
                    `Campos ausentes: ${missingSlots.map(([, , field]) => field).join(", ")}`);
            }
            const badDateTime = checkDateTime();
            if (badDateTime) return badDateTime;

            // Get service duration
            const { data: svc, error: svcErr } = await supabase.from("services_client")
                .select("duration_minutes").eq("id", service_id).maybeSingle();
            if (svcErr) {
                return patientDbError("service_read_failed", "buscar a duração do serviço escolhido", svcErr,
                    "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!svc) {
                return patientError(404, "service_not_found",
                    "O serviço escolhido não está mais disponível na clínica. Volte e escolha outro serviço.",
                    `service_id=${service_id}`);
            }
            const duration = svc.duration_minutes || 30;

            // Get professional work settings
            const { data: prof, error: profErr } = await supabase.from("professionals")
                .select("work_hours, work_days, use_daily_schedule, work_hours_daily").eq("id", professional_id).eq("active", true).maybeSingle();
            if (profErr) {
                return patientDbError("professional_read_failed", "buscar os horários de trabalho do profissional", profErr,
                    "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!prof) {
                return patientError(404, "professional_not_found",
                    "O profissional escolhido não está mais cadastrado na clínica. Volte e escolha outro profissional.",
                    `professional_id=${professional_id}`);
            }

            // Agenda fechada nesse dia (cadeado da agenda)
            if (await isProfessionalDayBlocked(supabase, professional_id, date)) {
                return new Response(JSON.stringify({ slots: [] }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const workDays: number[] = prof.work_days || [1, 2, 3, 4, 5];
            const reqDate = new Date(date + "T12:00:00");
            const wh = getWorkHoursForDay(prof, reqDate.getDay());
            if (!workDays.includes(reqDate.getDay())) {
                return new Response(JSON.stringify({ slots: [] }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const parseT = (t: any): number => {
                if (!t) return 0;
                if (typeof t === "string" && t.includes(":")) { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
                return parseFloat(t) * 60 || 0;
            };

            const whStart = parseT(wh.start) || 8 * 60;
            const whEnd = parseT(wh.end) || 20 * 60;
            const brkStart = wh.break_start ? parseT(wh.break_start) : null;
            const brkEnd = wh.break_end ? parseT(wh.break_end) : null;

            // Existing appointments
            const { data: apts, error: aptsErr } = await supabase.from("appointments")
                .select("start_time, end_time").eq("professional_id", professional_id).neq("status", "canceled")
                .gte("start_time", `${date}T00:00:00`).lte("start_time", `${date}T23:59:59`);
            if (aptsErr) {
                // sem a agenda ocupada, oferecer horários livres agendaria em cima de outro paciente
                return patientDbError("appointments_read_failed", "buscar os agendamentos já marcados do profissional nesta data", aptsErr,
                    "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            const busy = (apts || []).map((a: any) => {
                const s = new Date(a.start_time); const e = new Date(a.end_time);
                return { start: s.getHours() * 60 + s.getMinutes(), end: e.getHours() * 60 + e.getMinutes() };
            });

            const available: string[] = [];
            for (let m = whStart; m + duration <= whEnd; m += 10) {
                if (brkStart !== null && brkEnd !== null && m < brkEnd && m + duration > brkStart) continue;
                let conflict = false;
                for (const b of busy) { if (m < b.end && m + duration > b.start) { conflict = true; break; } }
                if (!conflict) available.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
            }

            return new Response(JSON.stringify({ slots: available }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── create_booking: create appointment ──
        if (action === "create_booking") {
            const missingBooking = [
                [contact_id, "o seu cadastro (link incompleto)", "contact_id"],
                [service_id, "o serviço", "service_id"],
                [professional_id, "o profissional", "professional_id"],
                [date, "a data", "date"],
                [time, "o horário", "time"],
            ].filter(([v]) => !v);
            if (missingBooking.length > 0) {
                return patientError(400, "missing_fields",
                    `Não dá para concluir o agendamento: falta ${missingBooking.map(([, label]) => label).join(", ")}. Volte e complete a seleção.`,
                    `Campos ausentes: ${missingBooking.map(([, , field]) => field).join(", ")}`);
            }
            const badBookingDateTime = checkDateTime();
            if (badBookingDateTime) return badBookingDateTime;

            const [{ data: svc, error: svcErr }, { data: prof, error: profErr }] = await Promise.all([
                supabase.from("services_client").select("name, price, duration_minutes, category_id, service_name_id").eq("id", service_id).maybeSingle(),
                supabase.from("professionals").select("name").eq("id", professional_id).eq("active", true).maybeSingle(),
            ]);
            if (svcErr) {
                return patientDbError("service_read_failed", "buscar o serviço escolhido", svcErr,
                    "Não conseguimos concluir o agendamento agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (profErr) {
                return patientDbError("professional_read_failed", "buscar o profissional escolhido", profErr,
                    "Não conseguimos concluir o agendamento agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!svc) {
                return patientError(404, "service_not_found",
                    "O serviço escolhido não está mais disponível na clínica. Volte e escolha outro serviço.",
                    `service_id=${service_id}`);
            }
            if (!prof) {
                return patientError(404, "professional_not_found",
                    "O profissional escolhido não está mais cadastrado na clínica. Volte e escolha outro profissional.",
                    `professional_id=${professional_id}`);
            }

            const duration = svc.duration_minutes || 30;
            const startISO = `${date}T${time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + duration * 60000);

            if (startDate < new Date()) {
                return patientError(400, "date_in_the_past",
                    `Não é possível agendar para ${date} às ${time} porque esse horário já passou. Escolha uma data e um horário futuros.`,
                    `Agora em Brasília: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
            }

            // Agenda fechada nesse dia (cadeado da agenda)
            if (await isProfessionalDayBlocked(supabase, professional_id, date)) {
                return patientError(409, "agenda_closed",
                    `${prof.name} não está atendendo no dia ${date}. Escolha outra data ou outro profissional.`);
            }

            // Check overlap
            const { data: overlap, error: overlapErr } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: professional_id,
                p_start_time: startDate.toISOString(),
                p_end_time: endDate.toISOString(),
                p_exclude_id: null,
            });
            if (overlapErr) {
                // sem a checagem de conflito, agendar às cegas marcaria em cima de outro paciente
                return patientDbError("overlap_check_failed", "verificar se o horário escolhido está livre", overlapErr,
                    "Não conseguimos confirmar se esse horário está livre. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (overlap) {
                return patientError(409, "slot_taken",
                    `O horário de ${time} do dia ${date} com ${prof.name} acabou de ser ocupado. Escolha outro horário.`,
                    `Duração do serviço: ${duration} min`);
            }

            const campaign = await resolveActiveCampaign();
            // Preço com desconto de campanha (se o serviço agendado estiver na campanha
            // ativa); a venda criada pelo trigger herda esse valor
            const finalPrice = applyCampaignDiscount(svc.price || 0, campaign, service_id);

            const { data: created, error: insertErr } = await supabase.from("appointments").insert({
                user_id,
                professional_id,
                contact_id,
                service_id,
                category_id: svc.category_id,
                service_name_id: svc.service_name_id,
                service_name: svc.name,
                professional_name: prof.name || "",
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                price: finalPrice,
                type: "appointment",
                campaign_id: campaign?.id ?? null,
                instance_id,
                created_via: "public_link",
            }).select().single();

            if (insertErr) {
                return patientDbError("appointment_insert_failed", "gravar o agendamento", insertErr,
                    "Não conseguimos registrar o seu agendamento. Tente novamente em alguns instantes ou fale com a clínica para marcar por telefone.");
            }

            // Falha no funil NÃO invalida o agendamento (já está gravado): vira aviso.
            let crmWarning: string | null = null;
            const crmFail = (operation: string, err: unknown) => {
                crmWarning = describeDbError(operation, err);
                console.warn("[api-public-booking]", crmWarning);
            };

            // CRM sync: create/move card to Agendado + add service — funil da conexão do link
            try {
                const terminals = TERMINAL_STAGES;
                const activeCard = await findActiveCardForChannel(supabase, {
                    contactId: contact_id,
                    instanceId: instance_id,
                    instagramInstanceId: null,
                });

                if (activeCard) {
                    if (terminals.includes(activeCard.stage)) {
                        // Terminal → create new card
                        const { data: newCard, error: newCardErr } = await supabase.from("crm_client").insert({
                            user_id, contact_id, stage: "Agendado", instance_id,
                            stage_changed_at: new Date().toISOString(), value: 0,
                            professional_id, priority: "medium", is_active: true,
                        }).select().single();
                        if (newCardErr) crmFail("abrir uma negociação nova na etapa Agendado", newCardErr);
                        if (newCard) {
                            const { error: svcInsErr } = await supabase.from("crm_client_services").insert({
                                crm_client_id: newCard.id, service_client_id: service_id,
                                service_name: svc.name, quantity: 1, unit_price: finalPrice, min_price: 0,
                            });
                            if (svcInsErr) crmFail("vincular o serviço à negociação nova", svcInsErr);
                            const { error: valErr } = await supabase.from("crm_client").update({ value: finalPrice }).eq("id", newCard.id);
                            if (valErr) crmFail("atualizar o valor da negociação nova", valErr);
                        }
                    } else {
                        // Move to Agendado
                        if (activeCard.stage !== "Agendado") {
                            const { error: moveErr } = await supabase.from("crm_client").update({
                                stage: "Agendado", stage_changed_at: new Date().toISOString(),
                            }).eq("id", activeCard.id);
                            if (moveErr) crmFail("mover a negociação para a etapa Agendado", moveErr);
                        }
                        // Add service if not duplicate
                        const { data: existingSvc, error: existingSvcErr } = await supabase.from("crm_client_services")
                            .select("id").eq("crm_client_id", activeCard.id).eq("service_client_id", service_id).maybeSingle();
                        if (existingSvcErr) crmFail("verificar se o serviço já está na negociação", existingSvcErr);
                        if (!existingSvc) {
                            const { error: svcInsErr } = await supabase.from("crm_client_services").insert({
                                crm_client_id: activeCard.id, service_client_id: service_id,
                                service_name: svc.name, quantity: 1, unit_price: finalPrice, min_price: 0,
                            });
                            if (svcInsErr) crmFail("vincular o serviço à negociação", svcInsErr);
                            const { data: allSvcs, error: allSvcsErr } = await supabase.from("crm_client_services")
                                .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                            if (allSvcsErr) crmFail("somar os serviços da negociação", allSvcsErr);
                            const total = (allSvcs || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            const { error: valErr } = await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                            if (valErr) crmFail("atualizar o valor da negociação", valErr);
                        }
                    }
                } else {
                    // No card → create
                    const { data: newCard, error: newCardErr } = await supabase.from("crm_client").insert({
                        user_id, contact_id, stage: "Agendado", instance_id,
                        stage_changed_at: new Date().toISOString(), value: finalPrice,
                        professional_id, priority: "medium", is_active: true,
                    }).select().single();
                    if (newCardErr) crmFail("abrir a negociação na etapa Agendado", newCardErr);
                    if (newCard) {
                        const { error: svcInsErr } = await supabase.from("crm_client_services").insert({
                            crm_client_id: newCard.id, service_client_id: service_id,
                            service_name: svc.name, quantity: 1, unit_price: finalPrice, min_price: 0,
                        });
                        if (svcInsErr) crmFail("vincular o serviço à negociação", svcInsErr);
                    }
                }
            } catch (crmErr) {
                crmFail("sincronizar o funil com o agendamento criado", crmErr);
            }

            return new Response(JSON.stringify({
                success: true,
                appointment_id: created.id,
                // presente só quando o agendamento foi criado mas o funil não acompanhou
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_pending: pending/confirmed appointments for this contact ──
        if (action === "get_pending") {
            if (!contact_id) {
                return patientError(400, "booking_link_invalid",
                    "Este link de agendamento está incompleto (falta a identificação do paciente). Peça um link novo à clínica.");
            }

            const { data: apts, error: aptsErr } = await supabase.from("appointments")
                .select("id, service_name, professional_name, start_time, end_time, status, service_id, professional_id")
                .eq("contact_id", contact_id).eq("type", "appointment")
                .in("status", ["pending", "confirmed", "rescheduled"])
                .gte("start_time", new Date().toISOString())
                .order("start_time", { ascending: true });
            if (aptsErr) {
                return patientDbError("appointments_read_failed", "buscar os agendamentos do paciente", aptsErr,
                    "Não conseguimos carregar os seus agendamentos agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            return new Response(JSON.stringify({ appointments: apts || [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── cancel_booking ──
        if (action === "cancel_booking") {
            if (!appointment_id) {
                return patientError(400, "missing_fields",
                    "Não dá para cancelar: o agendamento não foi identificado. Volte, escolha o agendamento na lista e tente de novo.",
                    "Campo ausente: appointment_id");
            }

            const { data: toCancel, error: findErr } = await supabase.from("appointments")
                .select("id, user_id, status").eq("id", appointment_id).maybeSingle();
            if (findErr) {
                return patientDbError("appointment_read_failed", "buscar o agendamento a cancelar", findErr,
                    "Não conseguimos localizar esse agendamento agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!toCancel) {
                return patientError(404, "appointment_not_found",
                    "Esse agendamento não existe mais — ele pode já ter sido cancelado ou removido pela clínica.",
                    `appointment_id=${appointment_id}`);
            }
            if (toCancel.user_id !== user_id) {
                return patientError(403, "appointment_wrong_tenant",
                    "Esse agendamento não pertence à clínica deste link. Peça um link novo à clínica.",
                    `appointment_id=${appointment_id}`);
            }
            if (toCancel.status === "canceled") {
                return new Response(JSON.stringify({ success: true, status: "canceled", already_canceled: true }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const { data: updated, error: upErr } = await supabase.from("appointments")
                .update({ status: "canceled" }).eq("id", appointment_id).select().single();
            if (upErr) {
                return patientDbError("appointment_cancel_failed", "cancelar o agendamento", upErr,
                    "Não conseguimos cancelar o seu agendamento. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            // Falha no funil NÃO invalida o cancelamento (já foi gravado): vira aviso.
            let cancelCrmWarning: string | null = null;
            const cancelCrmFail = (operation: string, err: unknown) => {
                cancelCrmWarning = describeDbError(operation, err);
                console.warn("[api-public-booking]", cancelCrmWarning);
            };

            // CRM: create Perdido card + remove service from active card
            if (updated.contact_id && updated.service_id) {
                try {
                    const { error: lostErr } = await supabase.from("crm_client").insert({
                        user_id, contact_id: updated.contact_id, stage: "Perdido",
                        instance_id: updated.instance_id ?? null,
                        stage_changed_at: new Date().toISOString(), value: updated.price || 0,
                        loss_reason: "canceled", loss_reason_other: "Cliente cancelou o agendamento via link",
                        is_active: false,
                    });
                    if (lostErr) cancelCrmFail("registrar a negociação perdida do cancelamento", lostErr);

                    const activeCard = await findActiveCardForChannel(supabase, {
                        contactId: updated.contact_id,
                        instanceId: updated.instance_id ?? null,
                        instagramInstanceId: null,
                    });
                    if (activeCard) {
                        const { error: delErr } = await supabase.from("crm_client_services").delete()
                            .eq("crm_client_id", activeCard.id).eq("service_client_id", updated.service_id);
                        if (delErr) cancelCrmFail("remover o serviço cancelado da negociação", delErr);

                        const { data: remaining, error: remErr } = await supabase.from("crm_client_services")
                            .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                        if (remErr) cancelCrmFail("somar os serviços restantes da negociação", remErr);

                        if (remaining && remaining.length > 0) {
                            const total = remaining.reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            const { error: valErr } = await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                            if (valErr) cancelCrmFail("atualizar o valor da negociação", valErr);
                        } else {
                            const { error: offErr } = await supabase.from("crm_client").update({ is_active: false }).eq("id", activeCard.id);
                            if (offErr) cancelCrmFail("encerrar a negociação que ficou sem serviços", offErr);
                        }
                    }
                } catch (crmErr) {
                    cancelCrmFail("sincronizar o funil com o cancelamento", crmErr);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                status: "canceled",
                ...(cancelCrmWarning ? { crm_warning: cancelCrmWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── reschedule_booking ──
        if (action === "reschedule_booking") {
            const missingResched = [
                [appointment_id, "o agendamento", "appointment_id"],
                [date, "a nova data", "date"],
                [time, "o novo horário", "time"],
            ].filter(([v]) => !v);
            if (missingResched.length > 0) {
                return patientError(400, "missing_fields",
                    `Não dá para reagendar: falta ${missingResched.map(([, label]) => label).join(", ")}. Volte e complete a seleção.`,
                    `Campos ausentes: ${missingResched.map(([, , field]) => field).join(", ")}`);
            }
            const badReschedDateTime = checkDateTime();
            if (badReschedDateTime) return badReschedDateTime;

            const { data: existing, error: existingErr } = await supabase.from("appointments")
                .select("start_time, end_time, professional_id, professional_name, user_id, status")
                .eq("id", appointment_id).maybeSingle();
            if (existingErr) {
                return patientDbError("appointment_read_failed", "buscar o agendamento a reagendar", existingErr,
                    "Não conseguimos localizar esse agendamento agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!existing) {
                return patientError(404, "appointment_not_found",
                    "Esse agendamento não existe mais — ele pode já ter sido cancelado ou removido pela clínica.",
                    `appointment_id=${appointment_id}`);
            }
            if (existing.user_id !== user_id) {
                return patientError(403, "appointment_wrong_tenant",
                    "Esse agendamento não pertence à clínica deste link. Peça um link novo à clínica.",
                    `appointment_id=${appointment_id}`);
            }
            if (existing.status === "canceled") {
                return patientError(409, "appointment_canceled",
                    "Esse agendamento está cancelado e não pode ser reagendado. Faça um agendamento novo.",
                    `appointment_id=${appointment_id}`);
            }

            const durationMs = new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime();
            const startISO = `${date}T${time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + durationMs);

            if (startDate < new Date()) {
                return patientError(400, "date_in_the_past",
                    `Não é possível reagendar para ${date} às ${time} porque esse horário já passou. Escolha uma data e um horário futuros.`,
                    `Agora em Brasília: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
            }

            // Agenda fechada nesse dia (cadeado da agenda)
            if (await isProfessionalDayBlocked(supabase, existing.professional_id, date)) {
                return patientError(409, "agenda_closed",
                    `${existing.professional_name || "O profissional"} não está atendendo no dia ${date}. Escolha outra data.`);
            }

            const { data: overlap, error: overlapErr } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: existing.professional_id,
                p_start_time: startDate.toISOString(),
                p_end_time: endDate.toISOString(),
                p_exclude_id: appointment_id,
            });
            if (overlapErr) {
                return patientDbError("overlap_check_failed", "verificar se o novo horário está livre", overlapErr,
                    "Não conseguimos confirmar se esse horário está livre. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (overlap) {
                return patientError(409, "slot_taken",
                    `O horário de ${time} do dia ${date} com ${existing.professional_name || "esse profissional"} já está ocupado. Escolha outro horário.`);
            }

            const { data: rescheduled, error: upErr } = await supabase.from("appointments").update({
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "rescheduled",
            }).eq("id", appointment_id).select().single();
            if (upErr) {
                return patientDbError("appointment_update_failed", "gravar o novo horário do agendamento", upErr,
                    "Não conseguimos reagendar o seu horário. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            // Falha no funil NÃO invalida o reagendamento (já foi gravado): vira aviso.
            let reschedCrmWarning: string | null = null;
            const reschedCrmFail = (operation: string, err: unknown) => {
                reschedCrmWarning = describeDbError(operation, err);
                console.warn("[api-public-booking]", reschedCrmWarning);
            };

            // CRM: move card to Agendado
            if (rescheduled.contact_id) {
                try {
                    const activeCard = await findActiveCardForChannel(supabase, {
                        contactId: rescheduled.contact_id,
                        instanceId: rescheduled.instance_id ?? null,
                        instagramInstanceId: null,
                    });
                    if (activeCard && activeCard.stage !== "Agendado") {
                        const { error: moveErr } = await supabase.from("crm_client").update({
                            stage: "Agendado", stage_changed_at: new Date().toISOString(),
                        }).eq("id", activeCard.id);
                        if (moveErr) reschedCrmFail("mover a negociação para a etapa Agendado", moveErr);
                    }
                } catch (crmErr) {
                    reschedCrmFail("sincronizar o funil com o reagendamento", crmErr);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                status: "rescheduled",
                ...(reschedCrmWarning ? { crm_warning: reschedCrmWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return unknownAction(corsHeaders, action, VALID_ACTIONS);

    } catch (error) {
        // Paciente não pode ler texto do Postgres: mensagem humana em `error`,
        // motivo técnico só em `details` (e no log da função).
        console.error("[api-public-booking] erro inesperado:", error);
        return patientError(
            500,
            "unexpected_error",
            "Tivemos um problema para processar o seu agendamento. Tente novamente em alguns instantes — se continuar, fale com a clínica.",
            (error as Error)?.message ?? error,
        );
    }
});
