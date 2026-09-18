import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getWorkHoursForDay } from "../_shared/professional-schedule.ts";
import { isProfessionalDayBlocked } from "../_shared/day-blocks.ts";
import { TERMINAL_STAGES } from "../_shared/crm-stages.ts";
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
import { createServiceLabelResolver, findServiceByDisplayName } from "../_shared/service-label.ts";
import { loadSandboxContext, logSandboxCall, toSaoPaulo, type SandboxContext } from "../_shared/sandbox.ts";

/**
 * api-scheduling-sandbox
 *
 * Gêmea de `api-scheduling` no ambiente de teste. Mesmas 5 ações e as MESMAS
 * validações (expediente, intervalo, cadeado do dia, convênio, folga entre
 * atendimentos) — o que muda é onde o agendamento nasce:
 *
 *   - grava em `sandbox_appointments` (nunca em `appointments`)
 *   - o funil vai para `sandbox_crm` (nunca para `crm_client`)
 *   - não existe Google Calendar nem sessão de confirmação automática
 *   - agenda_mode='real' também respeita a agenda real da sala; 'livre' ignora
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function parseWorkTime(t: any): number | null {
    if (t == null) return null;
    if (typeof t === "string" && t.includes(":")) {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
    }
    const num = parseFloat(t);
    return isNaN(num) ? null : num * 60;
}

function normalize(s: string): string {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

const DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const VALID_ACTIONS = [
    "fetch_appointments", "create_appointment", "confirm_appointment",
    "reschedule_appointment", "cancel_appointment",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function checkDateTimeFormat(
    date: unknown, time: unknown, dateField: string, timeField: string,
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

/** Mesma validação de expediente/intervalo/convênio da produção. */
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

/** Card ativo do funil do sandbox (só existe um por sessão). */
async function cardAtivo(supabase: any, ctx: SandboxContext) {
    const { data } = await supabase
        .from("sandbox_crm").select("*")
        .eq("session_id", ctx.session.id).eq("is_active", true)
        .limit(1).maybeSingle();
    return data;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body: parsedBody, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;
        const body = parsedBody!;

        const { action } = body;
        if (!action) return unknownAction(corsHeaders, action, VALID_ACTIONS);
        if (!VALID_ACTIONS.includes(action)) return unknownAction(corsHeaders, action, VALID_ACTIONS);

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const ctx = await loadSandboxContext(supabase, {
            conversationId: body.conversation_id,
            userId: body.user_id,
        });
        const userId = ctx.userId;
        const agendaReal = ctx.session.agenda_mode !== "livre";

        const SERVICE_COLUMNS = "id, name, price, min_price, duration_minutes, category_id, service_name_id, professionals";

        const resolveService = async (serviceName: string) => {
            const { data, error } = await supabase.from("services_client")
                .select(SERVICE_COLUMNS)
                .eq("user_id", userId).ilike("name", serviceName).eq("status", true)
                .limit(1).maybeSingle();
            if (error) {
                throw new ApiError({
                    status: 500, code: "service_lookup_failed",
                    message: describeDbError(`buscar a aplicação "${serviceName}" no catálogo desta conta`, error),
                    details: String((error as any)?.message ?? error),
                });
            }
            if (!data) {
                const composedMatch = await findServiceByDisplayName(supabase, userId, serviceName, SERVICE_COLUMNS);
                if (composedMatch) return composedMatch;
                throw new ApiError({
                    status: 404, code: "service_not_found",
                    message: `Aplicação "${serviceName}" não encontrada no catálogo ativo desta conta. Confira o nome exato em Serviços — aplicações desativadas não podem ser agendadas.`,
                });
            }
            return data;
        };

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

        /**
         * Conflito de horário. O sandbox sempre checa os próprios agendamentos;
         * em "Agenda Real" a agenda de produção da sala também bloqueia.
         */
        const hasConflict = async (
            professionalId: string, startDate: Date, endDate: Date, excludeId: string | null,
        ): Promise<{ conflict: boolean; buffer: number; response?: Response }> => {
            const { bufferMinutes } = await getSlotSettings(supabase, userId);
            const win = bufferedOverlapWindow(startDate, endDate, bufferMinutes);

            let query = supabase.from("sandbox_appointments")
                .select("id")
                .eq("session_id", ctx.session.id)
                .eq("professional_id", professionalId)
                .neq("status", "canceled")
                .lt("start_time", win.end)
                .gt("end_time", win.start);
            if (excludeId) query = query.neq("id", excludeId);

            const { data: sbConflicts, error: sbErr } = await query.limit(1);
            if (sbErr) {
                return {
                    conflict: false, buffer: bufferMinutes,
                    response: dbErrorResponse(corsHeaders, "sandbox_overlap_check_failed",
                        "verificar conflitos na agenda do ambiente de teste", sbErr),
                };
            }
            if ((sbConflicts || []).length > 0) return { conflict: true, buffer: bufferMinutes };

            if (!agendaReal) return { conflict: false, buffer: bufferMinutes };

            const { data: overlap, error: overlapError } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: professionalId,
                p_start_time: win.start,
                p_end_time: win.end,
                p_exclude_id: null,
            });
            if (overlapError) {
                return {
                    conflict: false, buffer: bufferMinutes,
                    response: dbErrorResponse(corsHeaders, "overlap_check_failed",
                        "verificar conflitos na agenda real da sala (modo Agenda Real)", overlapError),
                };
            }
            return { conflict: !!overlap, buffer: bufferMinutes };
        };

        // ── fetch_appointments ──
        if (action === "fetch_appointments") {
            let query = supabase.from("sandbox_appointments")
                .select("id, title, service_id, professional_id, start_time, end_time, status")
                .eq("session_id", ctx.session.id);

            if (body.status) {
                query = query.eq("status", body.status);
            } else {
                query = query.not("status", "in", "(completed,canceled,no_show)");
            }

            const { data, error } = await query.order("start_time", { ascending: false });
            if (error) {
                return dbErrorResponse(corsHeaders, "appointments_read_failed",
                    "listar os agendamentos do paciente fictício", error);
            }

            const label = await createServiceLabelResolver(supabase, (data || []).map((a: any) => a.service_id));
            const profIds = [...new Set((data || []).map((a: any) => a.professional_id).filter(Boolean))];
            const { data: profs } = profIds.length
                ? await supabase.from("professionals").select("id, name").in("id", profIds)
                : { data: [] };
            const profMap = new Map((profs || []).map((p: any) => [p.id, p.name]));

            await logSandboxCall(supabase, ctx, {
                function_name: "api-scheduling-sandbox",
                label: `Consultou os agendamentos do paciente (${(data || []).length})`,
                request: body,
            });

            return new Response(JSON.stringify({
                conversation_id: ctx.conversation.id,
                contact_id: ctx.contact.id,
                appointments: (data || []).map((a: any) => ({
                    id: a.id,
                    service: label(a.service_id, a.title),
                    professional: profMap.get(a.professional_id) || null,
                    date: toSaoPaulo(a.start_time)?.split("T")[0],
                    start_time: toSaoPaulo(a.start_time),
                    end_time: toSaoPaulo(a.end_time),
                    status: a.status,
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── confirm_appointment ──
        if (action === "confirm_appointment") {
            const ids: string[] = Array.isArray(body.appointment_ids)
                ? body.appointment_ids
                : (body.appointment_id ? [body.appointment_id] : []);

            let query = supabase.from("sandbox_appointments")
                .select("id, title, service_id, professional_id, start_time, status")
                .eq("session_id", ctx.session.id);

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
                    "buscar os agendamentos do paciente fictício para confirmar", targetsErr);
            }

            if (!targets || targets.length === 0) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "no_appointment_to_confirm",
                    message: ids.length > 0
                        ? `Nenhum agendamento do ambiente de teste corresponde aos ids enviados (${ids.join(", ")}). Use a ação fetch_appointments para obter os ids válidos.`
                        : "O paciente fictício não tem nenhum agendamento futuro aguardando confirmação.",
                });
            }

            const confirmIds = targets.map((a: any) => a.id);
            const { error: updErr } = await supabase.from("sandbox_appointments")
                .update({ status: "confirmed" }).in("id", confirmIds);
            if (updErr) {
                return dbErrorResponse(corsHeaders, "appointment_confirm_failed",
                    `confirmar o(s) agendamento(s) ${confirmIds.join(", ")}`, updErr);
            }

            const confirmLabel = await createServiceLabelResolver(supabase, targets.map((a: any) => a.service_id));

            await logSandboxCall(supabase, ctx, {
                function_name: "api-scheduling-sandbox",
                label: `Confirmou ${confirmIds.length} agendamento(s)`,
                request: body,
            });

            return new Response(JSON.stringify({
                success: true,
                confirmed_count: confirmIds.length,
                appointments: targets.map((a: any) => ({
                    id: a.id,
                    service: confirmLabel(a.service_id, a.title),
                    start_time: toSaoPaulo(a.start_time),
                    status: "confirmed",
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── create_appointment ──
        if (action === "create_appointment") {
            const { service_name, date, time, professional_name, description } = body;
            const missingCreate = missingFields(corsHeaders, body, ["service_name", "date", "time"],
                "Formatos esperados: date no formato AAAA-MM-DD e time no formato HH:MM (horário de Brasília).");
            if (missingCreate) return missingCreate;

            const formatFail = checkDateTimeFormat(date, time, "date", "time");
            if (formatFail) return formatFail;

            const sc = await resolveService(service_name);
            const convenio = await resolveConvenioSelection(supabase, userId, body);
            await assertServiceAptoConvenio(supabase, convenio, sc.id, sc.name);
            const prof = await resolveProfessional(sc, professional_name, convenio);
            const duration = sc.duration_minutes || 30;

            // Desconto da campanha simulada: no sandbox o serviço é casado por NOME
            // (o simulador é preenchido à mão pelo cliente).
            let finalPrice = Number(sc.price) || 0;
            const { data: camp } = await supabase
                .from("sandbox_campaigns")
                .select("name, discount_pct, services")
                .eq("session_id", ctx.session.id)
                .eq("is_active", true)
                .order("created_at", { ascending: false })
                .limit(1).maybeSingle();
            const pct = Number(camp?.discount_pct);
            if (camp && isFinite(pct) && pct > 0 && pct <= 100) {
                const nomes = (camp.services || []).map(normalize);
                if (nomes.includes(normalize(sc.name))) {
                    finalPrice = Math.round(finalPrice * (1 - pct / 100) * 100) / 100;
                }
            }

            const startDate = new Date(`${date}T${time}:00-03:00`);
            const endDate = new Date(startDate.getTime() + duration * 60000);

            if (startDate < new Date()) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "date_in_the_past",
                    message: `Não é possível agendar no passado: ${date} às ${time} já passou (agora são ${toSaoPaulo(new Date().toISOString())} em Brasília). Escolha uma data/hora futura.`,
                });
            }

            if (await isProfessionalDayBlocked(supabase, prof.id, date)) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "agenda_closed",
                    message: `A agenda de ${prof.name} está fechada em ${date} (o dia inteiro foi bloqueado na agenda). Consulte a disponibilidade (api-availability-sandbox) para outra data.`,
                });
            }

            const scheduleError = validateWorkSchedule(prof, date, time, duration, convenio);
            if (scheduleError) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "outside_work_schedule",
                    message: `${scheduleError}. Consulte a disponibilidade (api-availability-sandbox) para horários válidos.`,
                });
            }

            const check = await hasConflict(prof.id, startDate, endDate, null);
            if (check.response) return check.response;
            if (check.conflict) {
                const folga = check.buffer > 0
                    ? ` A conta exige ${check.buffer} min de folga antes e depois de cada atendimento.`
                    : "";
                const origem = agendaReal
                    ? " (a agenda do teste está no modo Agenda Real, então os agendamentos reais da sala também ocupam horário)"
                    : "";
                return apiError(corsHeaders, {
                    status: 409,
                    code: "slot_taken",
                    message: `${prof.name} já tem outro agendamento que conflita com ${date} às ${time} (${duration} min)${origem}.${folga} Consulte a disponibilidade (api-availability-sandbox) e escolha outro horário.`,
                });
            }

            const { data: created, error } = await supabase.from("sandbox_appointments").insert({
                session_id: ctx.session.id,
                user_id: userId,
                contact_id: ctx.contact.id,
                professional_id: prof.id,
                service_id: sc.id,
                title: sc.name,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "pending",
                notes: description || null,
            }).select().single();

            if (error) {
                return dbErrorResponse(corsHeaders, "appointment_insert_failed",
                    `gravar o agendamento de "${sc.name}" com ${prof.name} em ${date} às ${time} no ambiente de teste`, error);
            }

            // Funil do sandbox: card ativo vai para "Agendado" (ou nasce lá).
            let crmWarning: string | null = null;
            try {
                const card = await cardAtivo(supabase, ctx);
                if (card && !TERMINAL_STAGES.includes(card.stage)) {
                    if (card.stage !== "Agendado") {
                        await supabase.from("sandbox_crm")
                            .update({ stage: "Agendado", updated_at: new Date().toISOString() })
                            .eq("id", card.id);
                        await supabase.from("sandbox_crm_history").insert({
                            crm_id: card.id, user_id: userId, from_stage: card.stage, to_stage: "Agendado",
                        });
                    }
                    const { data: jaTem } = await supabase.from("sandbox_crm_services")
                        .select("id").eq("crm_id", card.id).eq("service_client_id", sc.id).maybeSingle();
                    if (!jaTem) {
                        await supabase.from("sandbox_crm_services").insert({
                            crm_id: card.id, user_id: userId, service_client_id: sc.id,
                            service_name: sc.name, price: finalPrice,
                        });
                    }
                } else {
                    // Sem card ativo (ou o anterior já terminou): abre um novo
                    if (card) {
                        await supabase.from("sandbox_crm").update({ is_active: false }).eq("id", card.id);
                    }
                    const { data: novo } = await supabase.from("sandbox_crm").insert({
                        session_id: ctx.session.id, user_id: userId, contact_id: ctx.contact.id,
                        conversation_id: ctx.conversation.id, stage: "Agendado", is_active: true,
                    }).select().single();
                    if (novo) {
                        await supabase.from("sandbox_crm_services").insert({
                            crm_id: novo.id, user_id: userId, service_client_id: sc.id,
                            service_name: sc.name, price: finalPrice,
                        });
                        await supabase.from("sandbox_crm_history").insert({
                            crm_id: novo.id, user_id: userId, from_stage: null, to_stage: "Agendado",
                        });
                    }
                }
            } catch (crmErr) {
                crmWarning = describeDbError("sincronizar o funil do ambiente de teste após o agendamento", crmErr);
                console.warn("[api-scheduling-sandbox]", crmWarning);
            }

            await logSandboxCall(supabase, ctx, {
                function_name: "api-scheduling-sandbox",
                label: `Agendou "${sc.name}" com ${prof.name} em ${date.split("-").reverse().join("/")} às ${time}`,
                request: body,
            });

            return new Response(JSON.stringify({
                success: true,
                appointment: {
                    id: created.id,
                    service: (await createServiceLabelResolver(supabase, [sc.id]))(sc.id, created.title),
                    professional: prof.name,
                    date,
                    start_time: toSaoPaulo(created.start_time),
                    end_time: toSaoPaulo(created.end_time),
                    price: finalPrice,
                    status: created.status,
                },
                sandbox: true,
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── reschedule_appointment ──
        if (action === "reschedule_appointment") {
            const { appointment_id, new_date, new_time } = body;
            const missingResched = missingFields(corsHeaders, body, ["appointment_id", "new_date", "new_time"],
                "Use fetch_appointments para obter o appointment_id. Formatos: new_date AAAA-MM-DD e new_time HH:MM (horário de Brasília).");
            if (missingResched) return missingResched;

            const formatFail = checkDateTimeFormat(new_date, new_time, "new_date", "new_time");
            if (formatFail) return formatFail;

            const { data: existing, error: existingErr } = await supabase.from("sandbox_appointments")
                .select("id, session_id, start_time, end_time, professional_id, status, service_id, title")
                .eq("id", appointment_id).maybeSingle();
            if (existingErr) {
                return dbErrorResponse(corsHeaders, "appointment_read_failed",
                    `buscar o agendamento ${appointment_id} do ambiente de teste para reagendar`, existingErr);
            }
            if (!existing || existing.session_id !== ctx.session.id) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "appointment_not_found",
                    message: `Agendamento ${appointment_id} não existe no ambiente de teste desta conta. Use a ação fetch_appointments para obter os ids válidos.`,
                });
            }
            if (existing.status === "canceled") {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "appointment_canceled",
                    message: `O agendamento ${appointment_id} está cancelado e não pode ser reagendado. Crie um novo agendamento com create_appointment.`,
                });
            }

            const durationMin = (new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime()) / 60000;
            const startDate = new Date(`${new_date}T${new_time}:00-03:00`);
            const endDate = new Date(startDate.getTime() + durationMin * 60000);

            if (startDate < new Date()) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "date_in_the_past",
                    message: `Não é possível reagendar para o passado: ${new_date} às ${new_time} já passou (agora são ${toSaoPaulo(new Date().toISOString())} em Brasília). Escolha uma data/hora futura.`,
                });
            }

            // O convênio do agendamento original continua valendo ao remarcar.
            const reschedConvenio = await selectionFromConvenioId(supabase, body.convenio_id ?? null);

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
                            message: `A agenda de ${profRec.name} está fechada em ${new_date} (o dia inteiro foi bloqueado na agenda). Consulte a disponibilidade (api-availability-sandbox) para outra data.`,
                        });
                    }
                    const scheduleError = validateWorkSchedule(profRec, new_date, new_time, durationMin, reschedConvenio);
                    if (scheduleError) {
                        return apiError(corsHeaders, {
                            status: 409,
                            code: "outside_work_schedule",
                            message: `${scheduleError}. Consulte a disponibilidade (api-availability-sandbox) para horários válidos.`,
                        });
                    }
                }

                const check = await hasConflict(existing.professional_id, startDate, endDate, appointment_id);
                if (check.response) return check.response;
                if (check.conflict) {
                    const folga = check.buffer > 0
                        ? ` A conta exige ${check.buffer} min de folga antes e depois de cada atendimento.`
                        : "";
                    return apiError(corsHeaders, {
                        status: 409,
                        code: "slot_taken",
                        message: `Já existe outro agendamento deste profissional que conflita com ${new_date} às ${new_time} (${durationMin} min).${folga} Consulte a disponibilidade (api-availability-sandbox) e escolha outro horário.`,
                    });
                }
            }

            const { data: updated, error } = await supabase.from("sandbox_appointments").update({
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "rescheduled",
            }).eq("id", appointment_id).select().single();
            if (error) {
                return dbErrorResponse(corsHeaders, "appointment_update_failed",
                    `reagendar o agendamento ${appointment_id} para ${new_date} às ${new_time}`, error);
            }

            await logSandboxCall(supabase, ctx, {
                function_name: "api-scheduling-sandbox",
                label: `Reagendou "${updated.title || "atendimento"}" para ${new_date.split("-").reverse().join("/")} às ${new_time}`,
                request: body,
            });

            return new Response(JSON.stringify({
                success: true,
                appointment: {
                    id: updated.id,
                    service: (await createServiceLabelResolver(supabase, [updated.service_id]))(updated.service_id, updated.title),
                    date: new_date,
                    start_time: toSaoPaulo(updated.start_time),
                    end_time: toSaoPaulo(updated.end_time),
                    status: updated.status,
                },
                sandbox: true,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── cancel_appointment ──
        if (action === "cancel_appointment") {
            const { appointment_id } = body;
            const missingCancel = missingFields(corsHeaders, body, ["appointment_id"],
                "Use fetch_appointments para obter o appointment_id.");
            if (missingCancel) return missingCancel;

            const { data: current, error: currentErr } = await supabase.from("sandbox_appointments")
                .select("id, session_id, status, service_id, title").eq("id", appointment_id).maybeSingle();
            if (currentErr) {
                return dbErrorResponse(corsHeaders, "appointment_read_failed",
                    `buscar o agendamento ${appointment_id} do ambiente de teste para cancelar`, currentErr);
            }
            if (!current || current.session_id !== ctx.session.id) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "appointment_not_found",
                    message: `Agendamento ${appointment_id} não existe no ambiente de teste desta conta. Use a ação fetch_appointments para obter os ids válidos.`,
                });
            }

            const { data: updated, error } = await supabase.from("sandbox_appointments")
                .update({ status: "canceled" }).eq("id", appointment_id).select().single();
            if (error) {
                return dbErrorResponse(corsHeaders, "appointment_cancel_failed",
                    `cancelar o agendamento ${appointment_id}`, error);
            }

            // Funil: o serviço cancelado sai do card ativo; card sem serviço encerra.
            let crmWarning: string | null = null;
            try {
                const card = await cardAtivo(supabase, ctx);
                if (card && updated.service_id) {
                    await supabase.from("sandbox_crm_services").delete()
                        .eq("crm_id", card.id).eq("service_client_id", updated.service_id);
                    const { data: restantes } = await supabase.from("sandbox_crm_services")
                        .select("id").eq("crm_id", card.id);
                    if (!restantes || restantes.length === 0) {
                        await supabase.from("sandbox_crm")
                            .update({ is_active: false, stage: "Perdido", updated_at: new Date().toISOString() })
                            .eq("id", card.id);
                        await supabase.from("sandbox_crm_history").insert({
                            crm_id: card.id, user_id: userId, from_stage: card.stage, to_stage: "Perdido",
                        });
                    }
                }
            } catch (crmErr) {
                crmWarning = describeDbError("sincronizar o funil do ambiente de teste após o cancelamento", crmErr);
                console.warn("[api-scheduling-sandbox]", crmWarning);
            }

            await logSandboxCall(supabase, ctx, {
                function_name: "api-scheduling-sandbox",
                label: `Cancelou o agendamento de "${updated.title || "atendimento"}"`,
                request: body,
            });

            return new Response(JSON.stringify({
                success: true,
                appointment: { id: updated.id, status: "canceled" },
                sandbox: true,
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return unknownAction(corsHeaders, action, VALID_ACTIONS);
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de agendamento do ambiente de teste (api-scheduling-sandbox)", error);
    }
});
