import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getWorkHoursForDay } from "../_shared/professional-schedule.ts";
import { isProfessionalDayBlocked } from "../_shared/day-blocks.ts";
import { TERMINAL_STAGES } from "../_shared/crm-stages.ts";
import { applyCampaignDiscount, type CampaignDiscountInfo } from "../_shared/campaign-discount.ts";
import { bufferedOverlapWindow, getSlotSettings } from "../_shared/slot-settings.ts";
import {
    CONVENIO_PROF_COLUMNS,
    NO_CONVENIO,
    assertServiceAptoConvenio,
    convenioRanges,
    describeRanges,
    filterRoomsForConvenio,
    getConvenioRoomIds,
    insideConvenio,
    overlapsConvenio,
    resolveConvenioSelection,
    selectionFromConvenioId,
    type ConvenioSelection,
} from "../_shared/convenio-schedule.ts";
import {
    findActiveCardForChannel,
    resolveConversation,
} from "../_shared/resolve-conversation.ts";
import {
    ApiError,
    apiError,
    dbErrorResponse,
    describeDbError,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
    unknownAction,
} from "../_shared/api-errors.ts";

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

const VALID_ACTIONS = [
    "fetch_appointments", "create_appointment", "confirm_appointment",
    "reschedule_appointment", "cancel_appointment",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** 400 dizendo exatamente qual formato veio errado, em vez de deixar virar "Invalid Date". */
function checkDateTimeFormat(
    date: unknown,
    time: unknown,
    dateField: string,
    timeField: string,
): Response | null {
    if (!DATE_RE.test(String(date))) {
        return apiError(corsHeaders, {
            status: 400,
            code: "invalid_date_format",
            message: `Campo ${dateField} com formato inválido: "${date}". Use AAAA-MM-DD (ex.: 2026-08-30).`,
        });
    }
    if (!TIME_RE.test(String(time))) {
        return apiError(corsHeaders, {
            status: 400,
            code: "invalid_time_format",
            message: `Campo ${timeField} com formato inválido: "${time}". Use HH:MM em 24 horas, horário de Brasília (ex.: 14:30).`,
        });
    }
    if (isNaN(new Date(`${date}T${time}:00-03:00`).getTime())) {
        return apiError(corsHeaders, {
            status: 400,
            code: "invalid_datetime",
            message: `A data/hora "${date} ${time}" não existe no calendário. Confira dia, mês e hora.`,
        });
    }
    return null;
}

/**
 * Validates the professional's work schedule (work_days, work_hours, break) for a
 * local date/time. Returns an error message or null if valid.
 * check_appointment_overlap only catches conflicts with other appointments — without
 * this, bookings could silently land outside the professional's schedule.
 */
function validateWorkSchedule(
    prof: any, dateStr: string, timeStr: string, duration: number,
    convenio: ConvenioSelection = NO_CONVENIO,
): string | null {
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

    // Faixas dedicadas a convênio: agendamento de convênio só cabe DENTRO delas,
    // agendamento particular nunca pode encostar.
    const ranges = convenioRanges(prof, dow, { start: whStart, end: whEnd, breakStart, breakEnd });
    if (convenio.requested) {
        if (ranges.length === 0) {
            return `${prof.name} não tem horário de convênio na ${DAY_NAMES[dow]} (${dateStr})`;
        }
        if (!insideConvenio(start, duration, ranges)) {
            return `${timeStr} está fora do horário de convênio de ${prof.name} nesse dia (${describeRanges(ranges)})`;
        }
    } else if (overlapsConvenio(start, duration, ranges)) {
        return `${timeStr} cai no horário reservado para convênio de ${prof.name} (${describeRanges(ranges)})`;
    }

    return null;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body: parsedBody, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;
        const body = parsedBody!;

        const { action, user_id } = body;

        const missingUser = missingFields(corsHeaders, body, ["user_id"],
            "Envie o id da conta (bd_data.user_id no prompt da IA).");
        if (missingUser) return missingUser;

        if (!action) return unknownAction(corsHeaders, action, VALID_ACTIONS);

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // A conversa carrega contato + conexão. `fetch_appointments` e
        // `create_appointment` exigem conversation_id; reschedule/cancel derivam
        // a conexão do próprio agendamento (appointments.instance_id).
        const conv = (action === "fetch_appointments" || action === "create_appointment" ||
                action === "confirm_appointment")
            ? await resolveConversation(supabase, body.conversation_id, user_id)
            : null;

        // Helper: resolve service_client by application name
        const resolveService = async (serviceName: string) => {
            const { data, error } = await supabase.from("services_client")
                .select("id, name, price, min_price, duration_minutes, category_id, service_name_id, professionals")
                .eq("user_id", user_id).ilike("name", serviceName).eq("status", true)
                .limit(1).maybeSingle();
            if (error) {
                throw new ApiError({
                    status: 500, code: "service_lookup_failed",
                    message: describeDbError(`buscar a aplicação "${serviceName}" no catálogo desta conta`, error),
                    details: String((error as any)?.message ?? error),
                });
            }
            if (!data) {
                throw new ApiError({
                    status: 404, code: "service_not_found",
                    message: `Aplicação "${serviceName}" não encontrada no catálogo ativo desta conta. Confira o nome exato em Serviços — aplicações desativadas não podem ser agendadas.`,
                });
            }
            return data;
        };

        // Helper: find a professional for the service
        const resolveProfessional = async (
            sc: any, preferredName?: string, convenio: ConvenioSelection = NO_CONVENIO,
        ) => {
            const profIds: string[] = sc.professionals || [];
            if (profIds.length === 0) {
                throw new ApiError({
                    status: 409, code: "service_without_professional",
                    message: `A aplicação "${sc.name}" não tem nenhum profissional vinculado, então não é possível agendar. Vincule um profissional a ela em Serviços antes de tentar de novo.`,
                });
            }

            const { data: allProfs, error } = await supabase.from("professionals")
                .select(`id, name, work_hours, work_days, use_daily_schedule, work_hours_daily, ${CONVENIO_PROF_COLUMNS}`)
                .in("id", profIds)
                .eq("active", true);
            if (error) {
                throw new ApiError({
                    status: 500, code: "professional_lookup_failed",
                    message: describeDbError(`buscar os profissionais vinculados à aplicação "${sc.name}"`, error),
                    details: String((error as any)?.message ?? error),
                });
            }
            if (!allProfs || allProfs.length === 0) {
                throw new ApiError({
                    status: 409, code: "professional_not_found",
                    message: `A aplicação "${sc.name}" aponta para ${profIds.length} profissional(is) que não existem mais no cadastro. Revise os profissionais vinculados a ela em Serviços.`,
                    details: `ids vinculados: ${profIds.join(", ")}`,
                });
            }

            // Convênio só agenda em sala habilitada (e ligada ao convênio escolhido)
            let profs = allProfs as any[];
            if (convenio.requested && convenio.convenio) {
                const roomIds = await getConvenioRoomIds(supabase, convenio.convenio.id);
                profs = filterRoomsForConvenio(allProfs as any[], roomIds);
                if (profs.length === 0) {
                    throw new ApiError({
                        status: 409, code: "convenio_without_rooms",
                        message: `Nenhuma sala que atende a aplicação "${sc.name}" está habilitada para ${convenio.catchAll ? "convênio" : `o convênio ${convenio.convenio.nome}`}. Habilite o atendimento de convênio na sala em Equipe > Salas, ou agende como particular (convenio="nao").`,
                    });
                }
            }

            const names = profs.map((p: any) => p.name).join(", ");

            if (preferredName) {
                const match = profs.find((p: any) => p.name.toLowerCase().includes(preferredName.toLowerCase()));
                if (match) return match;
                throw new ApiError({
                    status: 404, code: "professional_does_not_serve",
                    message: `O profissional "${preferredName}" não atende a aplicação "${sc.name}". Profissionais disponíveis para ela: ${names}.`,
                });
            }

            if (profs.length === 1) return profs[0];
            throw new ApiError({
                status: 400, code: "professional_name_required",
                message: `A aplicação "${sc.name}" é atendida por mais de um profissional — informe o campo professional_name. Profissionais disponíveis: ${names}.`,
            });
        };

        // Helper: campanha ativa da instância onde o contato recebeu envio.
        // A instância vem da conversa → vincula o agendamento à campanha (congela
        // a entrada como 'Agendado') e aplica discount_pct se o serviço estiver nela.
        const resolveCampaignForContact = async (cid: string, instanceId?: string | null): Promise<CampaignDiscountInfo | null> => {
            if (!instanceId) return null;
            try {
                const { data: camps, error: campErr } = await supabase.from("campaigns")
                    .select("id, discount_pct, services")
                    .eq("user_id", user_id)
                    .eq("instance_id", instanceId)
                    .in("status", ["dispatching", "dispatched"])
                    .gt("valid_until", new Date().toISOString())
                    .order("scheduled_at", { ascending: false });

                // Desconto de campanha é um bônus: se a busca falhar, o agendamento
                // continua com o preço cheio — mas o motivo real fica no log.
                if (campErr) {
                    console.warn("[api-scheduling]", describeDbError("buscar as campanhas ativas da instância para aplicar desconto", campErr));
                    return null;
                }

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

            if (error) {
                return dbErrorResponse(corsHeaders, "appointments_read_failed",
                    `listar os agendamentos do contato ${contactId}`, error);
            }

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
        // ACTION: confirm_appointment
        // ══════════════════════════════════════════════
        // Espelha o botão "Sim, pode confirmar": marca os agendamentos como
        // confirmados e encerra a sessão de confirmação que ficou aberta. Sem
        // appointment_ids, confirma todos os agendamentos futuros ainda pendentes
        // do contato — é o mesmo lote que a mensagem automática apresentou.
        if (action === "confirm_appointment") {
            const contactId = conv!.contactId;
            const ids: string[] = Array.isArray(body.appointment_ids)
                ? body.appointment_ids
                : (body.appointment_id ? [body.appointment_id] : []);

            let query = supabase.from("appointments")
                .select("id, user_id, status, service_name, professional_name, start_time")
                .eq("user_id", user_id)
                .eq("contact_id", contactId)
                .eq("type", "appointment");

            if (ids.length > 0) {
                query = query.in("id", ids);
            } else {
                query = query
                    .in("status", ["pending", "waiting", "rescheduled"])
                    .gte("start_time", new Date().toISOString());
            }

            const { data: targets, error: targetsErr } = await query.order("start_time", { ascending: true });
            if (targetsErr) {
                return dbErrorResponse(corsHeaders, "appointments_read_failed",
                    `buscar os agendamentos do contato ${contactId} para confirmar`, targetsErr);
            }

            if (!targets || targets.length === 0) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "no_appointment_to_confirm",
                    message: ids.length > 0
                        ? `Nenhum agendamento deste contato corresponde aos ids enviados (${ids.join(", ")}). Use a ação fetch_appointments para obter os ids válidos.`
                        : "Este contato não tem nenhum agendamento futuro aguardando confirmação.",
                });
            }

            const confirmIds = targets.map((a: any) => a.id);
            const { error: updErr } = await supabase.from("appointments")
                .update({ status: "confirmed" })
                .in("id", confirmIds);
            if (updErr) {
                return dbErrorResponse(corsHeaders, "appointment_confirm_failed",
                    `confirmar o(s) agendamento(s) ${confirmIds.join(", ")}`, updErr);
            }

            // Sessão de confirmação aberta some: sem isso o próximo inbound cairia
            // de novo no fluxo automático em vez de continuar com a IA.
            let sessionWarning: string | null = null;
            const { error: sessErr } = await supabase
                .from("appointment_confirmation_sessions")
                .update({ state: "completed", ended_at: new Date().toISOString() })
                .eq("contact_id", contactId)
                .eq("user_id", user_id)
                .not("state", "in", "(completed,transferred,failed)");
            if (sessErr) {
                sessionWarning = describeDbError(
                    `encerrar a sessão de confirmação automática do contato ${contactId}`, sessErr);
                console.warn("[api-scheduling]", sessionWarning);
            }

            return new Response(JSON.stringify({
                success: true,
                confirmed_count: confirmIds.length,
                appointments: targets.map((a: any) => ({
                    id: a.id,
                    service: a.service_name,
                    professional: a.professional_name,
                    start_time: toSaoPaulo(a.start_time),
                    status: "confirmed",
                })),
                ...(sessionWarning ? { session_warning: sessionWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: create_appointment
        // ══════════════════════════════════════════════
        if (action === "create_appointment") {
            const { service_name, date, time, professional_name, description } = body;
            const missingCreate = missingFields(corsHeaders, body, ["service_name", "date", "time"],
                "Formatos esperados: date no formato AAAA-MM-DD e time no formato HH:MM (horário de Brasília).");
            if (missingCreate) return missingCreate;

            const formatFail = checkDateTimeFormat(date, time, "date", "time");
            if (formatFail) return formatFail;

            const cid = conv!.contactId;
            const campaign = await resolveCampaignForContact(cid, conv!.instanceId);
            const sc = await resolveService(service_name);
            // Convênio pedido na chamada (ausente = particular)
            const convenio = await resolveConvenioSelection(supabase, user_id, body);
            await assertServiceAptoConvenio(supabase, convenio, sc.id, sc.name);
            const prof = await resolveProfessional(sc, professional_name, convenio);
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
                return apiError(corsHeaders, {
                    status: 400,
                    code: "date_in_the_past",
                    message: `Não é possível agendar no passado: ${date} às ${time} já passou (agora são ${toSaoPaulo(new Date().toISOString())} em Brasília). Escolha uma data/hora futura.`,
                });
            }

            // Agenda fechada nesse dia (cadeado da agenda)
            if (await isProfessionalDayBlocked(supabase, prof.id, date)) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "agenda_closed",
                    message: `A agenda de ${prof.name} está fechada em ${date} (o dia inteiro foi bloqueado na agenda). Consulte a disponibilidade (api-availability) para outra data.`,
                });
            }

            // Validate professional work schedule (work_days/work_hours/break)
            const scheduleError = validateWorkSchedule(prof, date, time, duration, convenio);
            if (scheduleError) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "outside_work_schedule",
                    message: `${scheduleError}. Consulte a disponibilidade (api-availability) para horários válidos.`,
                });
            }

            // Check overlap — a janela inclui a folga entre atendimentos da conta
            const { bufferMinutes } = await getSlotSettings(supabase, user_id);
            const overlapWindow = bufferedOverlapWindow(startDate, endDate, bufferMinutes);
            const { data: overlap, error: overlapError } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: prof.id,
                p_start_time: overlapWindow.start,
                p_end_time: overlapWindow.end,
                p_exclude_id: null,
            });
            if (overlapError) {
                return dbErrorResponse(corsHeaders, "overlap_check_failed",
                    `verificar se ${prof.name} já tem outro agendamento em ${date} às ${time} (RPC check_appointment_overlap)`, overlapError);
            }
            if (overlap) {
                const folga = bufferMinutes > 0
                    ? ` A conta exige ${bufferMinutes} min de folga antes e depois de cada atendimento.`
                    : "";
                return apiError(corsHeaders, {
                    status: 409,
                    code: "slot_taken",
                    message: `${prof.name} já tem outro agendamento que conflita com ${date} às ${time} (${duration} min).${folga} Consulte a disponibilidade (api-availability) e escolha outro horário.`,
                });
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
                convenio_id: convenio.convenio?.id ?? null,
            };

            const { data: created, error } = await supabase.from("appointments").insert(payload).select().single();
            if (error) {
                return dbErrorResponse(corsHeaders, "appointment_insert_failed",
                    `gravar o agendamento de "${sc.name}" com ${prof.name} em ${date} às ${time}`, error);
            }

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
            // funil da conexão desta conversa.
            // O agendamento já foi gravado: uma falha aqui NÃO derruba a resposta,
            // mas volta descrita em `crm_warning` em vez de sumir no log.
            let crmWarning: string | null = null;
            const crmFail = (operation: string, err: unknown) => {
                crmWarning = describeDbError(operation, err);
                console.warn("[api-scheduling]", crmWarning);
            };

            try {
                const activeCard = await findActiveCardForChannel(supabase, conv!);

                if (activeCard) {
                    const terminals = TERMINAL_STAGES;
                    if (terminals.includes(activeCard.stage)) {
                        // Terminal → create new card
                        const { data: newCard, error: newCardErr } = await supabase.from("crm_client").insert({
                            user_id, contact_id: cid, stage: "Agendado",
                            instance_id: conv!.instanceId,
                            instagram_instance_id: conv!.instagramInstanceId,
                            stage_changed_at: new Date().toISOString(), value: 0,
                            professional_id: prof.id, priority: "medium", is_active: true,
                        }).select().single();
                        if (newCardErr) {
                            crmFail(`criar a negociação "Agendado" do contato ${cid} (a negociação anterior estava em etapa final)`, newCardErr);
                        } else if (newCard) {
                            const { error: svcErr } = await supabase.from("crm_client_services").insert({
                                crm_client_id: newCard.id, service_client_id: sc.id,
                                service_name: sc.name, quantity: 1, unit_price: finalPrice, min_price: sc.min_price || 0,
                            });
                            if (svcErr) crmFail(`adicionar "${sc.name}" à negociação ${newCard.id}`, svcErr);
                            const { error: valErr } = await supabase.from("crm_client").update({ value: finalPrice }).eq("id", newCard.id);
                            if (valErr) crmFail(`gravar o valor da negociação ${newCard.id}`, valErr);
                        }
                    } else {
                        // Move to Agendado
                        if (activeCard.stage !== "Agendado") {
                            const { error: moveErr } = await supabase.from("crm_client").update({
                                stage: "Agendado", stage_changed_at: new Date().toISOString(),
                            }).eq("id", activeCard.id);
                            if (moveErr) crmFail(`mover a negociação ${activeCard.id} para "Agendado"`, moveErr);
                        }
                        // Add service if not duplicate
                        const { data: existingSvc, error: existingSvcErr } = await supabase.from("crm_client_services")
                            .select("id").eq("crm_client_id", activeCard.id).eq("service_client_id", sc.id).maybeSingle();
                        if (existingSvcErr) {
                            crmFail(`verificar se "${sc.name}" já estava na negociação ${activeCard.id}`, existingSvcErr);
                        } else if (!existingSvc) {
                            const { error: svcErr } = await supabase.from("crm_client_services").insert({
                                crm_client_id: activeCard.id, service_client_id: sc.id,
                                service_name: sc.name, quantity: 1, unit_price: finalPrice, min_price: sc.min_price || 0,
                            });
                            if (svcErr) crmFail(`adicionar "${sc.name}" à negociação ${activeCard.id}`, svcErr);
                            // Recalc value
                            const { data: allSvcs, error: allSvcsErr } = await supabase.from("crm_client_services")
                                .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                            if (allSvcsErr) {
                                crmFail(`recalcular o valor da negociação ${activeCard.id}`, allSvcsErr);
                            } else {
                                const total = (allSvcs || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                                const { error: valErr } = await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                                if (valErr) crmFail(`gravar o novo valor da negociação ${activeCard.id}`, valErr);
                            }
                        }
                    }
                } else {
                    // No card → create
                    const { data: newCard, error: newCardErr } = await supabase.from("crm_client").insert({
                        user_id, contact_id: cid, stage: "Agendado",
                        instance_id: conv!.instanceId,
                        instagram_instance_id: conv!.instagramInstanceId,
                        stage_changed_at: new Date().toISOString(), value: finalPrice,
                        professional_id: prof.id, priority: "medium", is_active: true,
                    }).select().single();
                    if (newCardErr) {
                        crmFail(`criar a negociação "Agendado" do contato ${cid}`, newCardErr);
                    } else if (newCard) {
                        const { error: svcErr } = await supabase.from("crm_client_services").insert({
                            crm_client_id: newCard.id, service_client_id: sc.id,
                            service_name: sc.name, quantity: 1, unit_price: finalPrice, min_price: sc.min_price || 0,
                        });
                        if (svcErr) crmFail(`adicionar "${sc.name}" à negociação ${newCard.id}`, svcErr);
                    }
                }
            } catch (crmErr) {
                crmFail("sincronizar o funil do CRM após o agendamento", crmErr);
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
                // presente só quando o agendamento foi criado mas o funil não acompanhou
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: reschedule_appointment
        // ══════════════════════════════════════════════
        if (action === "reschedule_appointment") {
            const { appointment_id, new_date, new_time } = body;
            const missingResched = missingFields(corsHeaders, body, ["appointment_id", "new_date", "new_time"],
                "Use fetch_appointments para obter o appointment_id. Formatos: new_date AAAA-MM-DD e new_time HH:MM (horário de Brasília).");
            if (missingResched) return missingResched;

            const formatFail = checkDateTimeFormat(new_date, new_time, "new_date", "new_time");
            if (formatFail) return formatFail;

            // Fetch existing to get duration
            const { data: existing, error: existingErr } = await supabase.from("appointments")
                .select("start_time, end_time, professional_id, user_id, status, convenio_id")
                .eq("id", appointment_id).maybeSingle();
            if (existingErr) {
                return dbErrorResponse(corsHeaders, "appointment_read_failed",
                    `buscar o agendamento ${appointment_id} para reagendar`, existingErr);
            }
            if (!existing) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "appointment_not_found",
                    message: `Agendamento não encontrado: nenhum agendamento com o id ${appointment_id} existe. Use a ação fetch_appointments para obter os ids válidos deste contato.`,
                });
            }
            if (existing.user_id !== user_id) {
                return apiError(corsHeaders, {
                    status: 403,
                    code: "appointment_wrong_tenant",
                    message: `O agendamento ${appointment_id} pertence a outra conta e não ao user_id ${user_id} enviado na requisição.`,
                });
            }
            if (existing.status === "canceled") {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "appointment_canceled",
                    message: `O agendamento ${appointment_id} está cancelado e não pode ser reagendado. Crie um novo agendamento com create_appointment.`,
                });
            }

            const durationMs = new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime();
            const durationMin = durationMs / 60000;

            const startISO = `${new_date}T${new_time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + durationMin * 60000);

            if (startDate < new Date()) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "date_in_the_past",
                    message: `Não é possível reagendar para o passado: ${new_date} às ${new_time} já passou (agora são ${toSaoPaulo(new Date().toISOString())} em Brasília). Escolha uma data/hora futura.`,
                });
            }

            // Um agendamento de convênio continua sendo de convênio ao remarcar:
            // o novo horário tem de cair na janela dedicada da sala.
            const reschedConvenio = await selectionFromConvenioId(supabase, existing.convenio_id);

            // Validate professional work schedule at the new date/time
            if (existing.professional_id) {
                const { data: profRec, error: profErr } = await supabase.from("professionals")
                    .select(`id, name, work_hours, work_days, use_daily_schedule, work_hours_daily, ${CONVENIO_PROF_COLUMNS}`)
                    .eq("id", existing.professional_id).maybeSingle();
                if (profErr) {
                    return dbErrorResponse(corsHeaders, "professional_lookup_failed",
                        `buscar o profissional ${existing.professional_id} do agendamento ${appointment_id}`, profErr);
                }
                if (profRec) {
                    if (await isProfessionalDayBlocked(supabase, profRec.id, new_date)) {
                        return apiError(corsHeaders, {
                            status: 409,
                            code: "agenda_closed",
                            message: `A agenda de ${profRec.name} está fechada em ${new_date} (o dia inteiro foi bloqueado na agenda). Consulte a disponibilidade (api-availability) para outra data.`,
                        });
                    }
                    const scheduleError = validateWorkSchedule(profRec, new_date, new_time, durationMin, reschedConvenio);
                    if (scheduleError) {
                        return apiError(corsHeaders, {
                            status: 409,
                            code: "outside_work_schedule",
                            message: `${scheduleError}. Consulte a disponibilidade (api-availability) para horários válidos.`,
                        });
                    }
                }
            }

            // Check overlap — a janela inclui a folga entre atendimentos da conta
            const { bufferMinutes: reschedBuffer } = await getSlotSettings(supabase, user_id);
            const reschedWindow = bufferedOverlapWindow(startDate, endDate, reschedBuffer);
            const { data: overlap, error: overlapError } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: existing.professional_id,
                p_start_time: reschedWindow.start,
                p_end_time: reschedWindow.end,
                p_exclude_id: appointment_id,
            });
            if (overlapError) {
                return dbErrorResponse(corsHeaders, "overlap_check_failed",
                    `verificar conflitos de agenda em ${new_date} às ${new_time} (RPC check_appointment_overlap)`, overlapError);
            }
            if (overlap) {
                const folga = reschedBuffer > 0
                    ? ` A conta exige ${reschedBuffer} min de folga antes e depois de cada atendimento.`
                    : "";
                return apiError(corsHeaders, {
                    status: 409,
                    code: "slot_taken",
                    message: `Já existe outro agendamento deste profissional que conflita com ${new_date} às ${new_time} (${durationMin} min).${folga} Consulte a disponibilidade (api-availability) e escolha outro horário.`,
                });
            }

            const { data: updated, error } = await supabase.from("appointments").update({
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "rescheduled",
            }).eq("id", appointment_id).select().single();
            if (error) {
                return dbErrorResponse(corsHeaders, "appointment_update_failed",
                    `reagendar o agendamento ${appointment_id} para ${new_date} às ${new_time}`, error);
            }

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

            // CRM: move card to Agendado — funil da conexão do agendamento.
            // O reagendamento já foi gravado: falha aqui vira aviso, não erro.
            let crmWarning: string | null = null;
            if (updated.contact_id) {
                try {
                    const activeCard = await findActiveCardForChannel(supabase, {
                        contactId: updated.contact_id,
                        instanceId: updated.instance_id ?? null,
                        instagramInstanceId: null,
                    });
                    if (activeCard && activeCard.stage !== "Agendado") {
                        const { error: moveErr } = await supabase.from("crm_client").update({
                            stage: "Agendado", stage_changed_at: new Date().toISOString(),
                        }).eq("id", activeCard.id);
                        if (moveErr) {
                            crmWarning = describeDbError(`mover a negociação ${activeCard.id} para "Agendado"`, moveErr);
                        }
                    }
                } catch (crmErr) {
                    crmWarning = describeDbError("sincronizar o funil do CRM após o reagendamento", crmErr);
                }
                if (crmWarning) console.warn("[api-scheduling]", crmWarning);
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
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: cancel_appointment
        // ══════════════════════════════════════════════
        if (action === "cancel_appointment") {
            const { appointment_id } = body;
            const missingCancel = missingFields(corsHeaders, body, ["appointment_id"],
                "Use fetch_appointments para obter o appointment_id.");
            if (missingCancel) return missingCancel;

            const { data: current, error: currentErr } = await supabase.from("appointments")
                .select("id, user_id, status").eq("id", appointment_id).maybeSingle();
            if (currentErr) {
                return dbErrorResponse(corsHeaders, "appointment_read_failed",
                    `buscar o agendamento ${appointment_id} para cancelar`, currentErr);
            }
            if (!current) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "appointment_not_found",
                    message: `Agendamento não encontrado: nenhum agendamento com o id ${appointment_id} existe. Use a ação fetch_appointments para obter os ids válidos deste contato.`,
                });
            }
            if (current.user_id !== user_id) {
                return apiError(corsHeaders, {
                    status: 403,
                    code: "appointment_wrong_tenant",
                    message: `O agendamento ${appointment_id} pertence a outra conta e não ao user_id ${user_id} enviado na requisição.`,
                });
            }

            const { data: updated, error } = await supabase.from("appointments")
                .update({ status: "canceled" }).eq("id", appointment_id).select().single();
            if (error) {
                return dbErrorResponse(corsHeaders, "appointment_cancel_failed",
                    `cancelar o agendamento ${appointment_id}`, error);
            }

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

            // CRM: create Perdido card for the canceled service.
            // O cancelamento já foi gravado: falha aqui vira aviso, não erro.
            let crmWarning: string | null = null;
            if (updated.contact_id && updated.service_id) {
                try {
                    const { error: lostErr } = await supabase.from("crm_client").insert({
                        user_id, contact_id: updated.contact_id, stage: "Perdido",
                        instance_id: updated.instance_id ?? null,
                        stage_changed_at: new Date().toISOString(), value: updated.price || 0,
                        loss_reason: "canceled", loss_reason_other: "Cliente cancelou o agendamento",
                        is_active: false,
                    });
                    if (lostErr) {
                        crmWarning = describeDbError(`registrar a negociação "Perdido" do contato ${updated.contact_id}`, lostErr);
                    }
                    // Remove service from active deal — funil da conexão do agendamento
                    const activeCard = await findActiveCardForChannel(supabase, {
                        contactId: updated.contact_id,
                        instanceId: updated.instance_id ?? null,
                        instagramInstanceId: null,
                    });
                    if (activeCard) {
                        const { error: delErr } = await supabase.from("crm_client_services").delete()
                            .eq("crm_client_id", activeCard.id).eq("service_client_id", updated.service_id);
                        if (delErr) {
                            crmWarning = describeDbError(`remover o serviço cancelado da negociação ${activeCard.id}`, delErr);
                        }
                        const { data: remaining, error: remErr } = await supabase.from("crm_client_services")
                            .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                        if (remErr) {
                            crmWarning = describeDbError(`recalcular o valor da negociação ${activeCard.id}`, remErr);
                        } else if (remaining && remaining.length > 0) {
                            const total = remaining.reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            const { error: valErr } = await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                            if (valErr) crmWarning = describeDbError(`gravar o novo valor da negociação ${activeCard.id}`, valErr);
                        } else {
                            const { error: offErr } = await supabase.from("crm_client").update({ is_active: false }).eq("id", activeCard.id);
                            if (offErr) crmWarning = describeDbError(`encerrar a negociação ${activeCard.id}, que ficou sem serviços`, offErr);
                        }
                    }
                } catch (crmErr) {
                    crmWarning = describeDbError("sincronizar o funil do CRM após o cancelamento", crmErr);
                }
                if (crmWarning) console.warn("[api-scheduling]", crmWarning);
            }

            return new Response(JSON.stringify({
                success: true,
                appointment: { id: updated.id, status: "canceled" },
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return unknownAction(corsHeaders, action, VALID_ACTIONS);

    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de agendamento (api-scheduling)", error);
    }
});
