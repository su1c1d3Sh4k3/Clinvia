import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getWorkHoursForDay } from "../_shared/professional-schedule.ts";
import { isProfessionalDayBlocked } from "../_shared/day-blocks.ts";
import { TERMINAL_STAGES } from "../_shared/crm-stages.ts";
import { bufferedOverlapWindow, getSlotSettings, padBusyRange } from "../_shared/slot-settings.ts";
import { serviceDisplayName } from "../_shared/service-display-name.ts";
import { createServiceLabelResolver } from "../_shared/service-label.ts";
import {
    apiError,
    describeDbError,
    readJsonBody,
    unknownAction,
} from "../_shared/api-errors.ts";
import {
    CONVENIO_PROF_COLUMNS,
    convenioRanges,
    type ConvenioSelection,
    filterRoomsForConvenio,
    getConvenioCatalog,
    getConvenioRoomIds,
    insideConvenio,
    NO_CONVENIO,
    overlapsConvenio,
} from "../_shared/convenio-schedule.ts";
import { loadSandboxContext, logSandboxCall, type SandboxContext } from "../_shared/sandbox.ts";

/**
 * api-public-booking-sandbox
 *
 * Gêmea de `api-public-booking` para o link de agendamento do ambiente de teste
 * (`/agendar?sb=1`). O catálogo (serviços, salas, convênios) é o REAL da conta —
 * é o que o cliente quer testar —, mas tudo que é escrito vive em `sandbox_*`:
 * agendamento em `sandbox_appointments`, funil em `sandbox_crm`.
 *
 * Não existe conexão de WhatsApp aqui: o link do teste não carrega instance_id.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ACTIONS = [
    "get_services", "get_prof_list", "get_slots",
    "create_booking", "get_pending", "cancel_booking", "reschedule_booking",
];

function pad(n: number): string { return String(n).padStart(2, "0"); }

/** Quem lê esta resposta é um PACIENTE (tela do link): texto humano em `error`. */
function patientError(status: number, code: string, message: string, technicalDetail?: unknown): Response {
    return apiError(corsHeaders, {
        status,
        code,
        message,
        details: technicalDetail ? String(technicalDetail) : undefined,
    });
}

function patientDbError(code: string, operation: string, error: unknown, advice: string): Response {
    console.error("[api-public-booking-sandbox]", describeDbError(operation, error));
    return patientError(500, code, advice, (error as any)?.message ?? error);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const normalize = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Minuto do dia no fuso de São Paulo (o banco guarda UTC). */
function spMinuteOfDay(iso: string): number {
    const hhmm = new Date(iso).toLocaleTimeString("sv-SE", {
        timeZone: "America/Sao_Paulo", hour12: false,
    });
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + (m || 0);
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { action, user_id, service_id, professional_id, date, time, appointment_id, convenio_id } = body!;

        if (!user_id) {
            return patientError(400, "booking_link_invalid",
                "Este link de agendamento de teste está incompleto (falta a identificação da clínica). Gere o link de novo na página Sandbox da IA.");
        }
        if (!action) return unknownAction(corsHeaders, action, VALID_ACTIONS);

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        let ctx: SandboxContext;
        try {
            ctx = await loadSandboxContext(supabase, { userId: user_id });
        } catch (err) {
            return patientError(404, "sandbox_session_not_found",
                "O ambiente de teste desta conta não existe mais. Abra a página Sandbox da IA no sistema e gere um link novo.",
                (err as Error)?.message ?? err);
        }
        const userId = ctx.userId;
        const contactId = ctx.contact.id;
        const agendaReal = ctx.session.agenda_mode !== "livre";

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

        const resolveConvenio = async (): Promise<
            { selection: ConvenioSelection; response: null } | { selection: null; response: Response }
        > => {
            if (!convenio_id) return { selection: NO_CONVENIO, response: null };
            const { data, error } = await supabase.from("convenios")
                .select("id, nome, descricao, is_catch_all")
                .eq("id", convenio_id).eq("user_id", userId).eq("active", true).maybeSingle();
            if (error) {
                return {
                    selection: null,
                    response: patientDbError("convenio_read_failed", "buscar o convênio escolhido", error,
                        "Não conseguimos confirmar o convênio escolhido. Tente novamente em alguns instantes."),
                };
            }
            if (!data) {
                return {
                    selection: null,
                    response: patientError(404, "convenio_not_found",
                        "O convênio escolhido não está mais cadastrado na clínica. Volte e escolha outra opção.",
                        `convenio_id=${convenio_id}`),
                };
            }
            return { selection: { requested: true, convenio: data, catchAll: !!data.is_catch_all }, response: null };
        };

        /** Campanha simulada ativa da sessão (serviços vêm por NOME em text[]). */
        const campanhaAtiva = async (): Promise<any | null> => {
            const { data, error } = await supabase.from("sandbox_campaigns")
                .select("id, name, discount_pct, services")
                .eq("session_id", ctx.session.id).eq("is_active", true)
                .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (error) {
                console.warn("[api-public-booking-sandbox]",
                    describeDbError("buscar a campanha simulada ativa", error));
                return null;
            }
            return data;
        };

        const descontoDaCampanha = (campanha: any, precoBase: number, nomeServico: string): number => {
            const pct = Number(campanha?.discount_pct);
            if (!campanha || !isFinite(pct) || pct <= 0 || pct > 100) return precoBase;
            const nomes = (campanha.services || []).map(normalize);
            if (!nomes.includes(normalize(nomeServico))) return precoBase;
            return Math.round(precoBase * (1 - pct / 100) * 100) / 100;
        };

        // ── get_services ──────────────────────────────────────────────────────
        if (action === "get_services") {
            const { data: sc, error: scErr } = await supabase.from("services_client")
                .select("id, name, description, duration_minutes, category_id, service_name_id, professionals")
                .eq("user_id", userId).eq("status", true);
            if (scErr) {
                return patientDbError("services_read_failed", "carregar os serviços da clínica", scErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes.");
            }

            const allCatIds = [...new Set((sc || []).map((s: any) => s.category_id))];
            const { data: allCats, error: catErr } = await supabase.from("services_category")
                .select("id, name, category_type").in("id", allCatIds).order("name");
            if (catErr) {
                return patientDbError("service_categories_read_failed", "carregar as categorias de serviço", catErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes.");
            }

            const avaliacaoCatIds = new Set((allCats || [])
                .filter((c: any) => normalize(c.name) === "avaliacao").map((c: any) => c.id));

            // Compras pendentes do paciente fictício (venda sem agendamento)
            const { data: pendingSales, error: salesErr } = await supabase.from("sandbox_sales")
                .select("service_client_id")
                .eq("session_id", ctx.session.id)
                .is("appointment_id", null)
                .not("service_client_id", "is", null);
            if (salesErr) {
                return patientDbError("purchased_services_read_failed",
                    "buscar os serviços comprados no ambiente de teste", salesErr,
                    "Não conseguimos verificar os serviços já comprados. Tente novamente em alguns instantes.");
            }
            const purchasedServiceIds = new Set<string>((pendingSales || []).map((s: any) => s.service_client_id));

            // Serviços da campanha simulada também entram (por nome)
            const campanha = await campanhaAtiva();
            const nomesCampanha = new Set<string>((campanha?.services || []).map(normalize));

            const visibleApps = (sc || []).filter((s: any) =>
                avaliacaoCatIds.has(s.category_id) ||
                purchasedServiceIds.has(s.id) ||
                nomesCampanha.has(normalize(s.name)));

            const catIds = [...new Set(visibleApps.map((s: any) => s.category_id))];
            const snIds = [...new Set(visibleApps.map((s: any) => s.service_name_id))];

            const cats = (allCats || []).filter((c: any) => catIds.includes(c.id));
            const { data: sns, error: snErr } = await supabase.from("service_name")
                .select("id, name, category_id").in("id", snIds).order("name");
            if (snErr) {
                return patientDbError("service_names_read_failed", "carregar os nomes dos serviços", snErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes.");
            }

            const { catchAll, list } = await getConvenioCatalog(supabase, userId);
            const convenioOptions = catchAll
                ? [{ id: catchAll.id, nome: "Habilitado para todos os convênios", descricao: catchAll.descricao ?? null }]
                : list.map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao ?? null }));

            const convenioRooms = new Map<string, string[]>();
            if (convenioOptions.length > 0) {
                const { data: convProfs, error: convProfErr } = await supabase.from("professionals")
                    .select(`id, ${CONVENIO_PROF_COLUMNS}`)
                    .eq("user_id", userId).eq("active", true);
                if (convProfErr) {
                    return patientDbError("convenio_rooms_read_failed", "buscar as salas que atendem convênio", convProfErr,
                        "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes.");
                }
                for (const opt of convenioOptions) {
                    const roomIds = await getConvenioRoomIds(supabase, opt.id);
                    convenioRooms.set(opt.id, filterRoomsForConvenio(convProfs || [], roomIds).map((p: any) => p.id));
                }
            }

            const aptoByService = new Map<string, string[]>();
            if (convenioOptions.length > 0 && visibleApps.length > 0) {
                const { data: aptos, error: aptosErr } = await supabase.from("convenio_servicos")
                    .select("convenio_id, service_client_id")
                    .in("convenio_id", convenioOptions.map((c) => c.id))
                    .in("service_client_id", visibleApps.map((s: any) => s.id));
                if (aptosErr) {
                    return patientDbError("convenio_services_read_failed", "buscar os serviços aptos a convênio", aptosErr,
                        "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes.");
                }
                for (const row of aptos || []) {
                    const arr = aptoByService.get(row.service_client_id) || [];
                    arr.push(row.convenio_id);
                    aptoByService.set(row.service_client_id, arr);
                }
            }

            const snById = new Map((sns || []).map((s: any) => [s.id, s.name]));
            const catTypeById = new Map((allCats || []).map((c: any) => [c.id, c.category_type]));

            await logSandboxCall(supabase, ctx, {
                function_name: "api-public-booking-sandbox",
                label: `Abriu o link de agendamento de teste (${visibleApps.length} serviço(s) disponível(is))`,
                request: { action },
            });

            return new Response(JSON.stringify({
                sandbox: true,
                categories: cats,
                service_names: sns || [],
                convenios: convenioOptions.map((c) => ({ ...c, professional_ids: convenioRooms.get(c.id) || [] })),
                applications: visibleApps.map((s: any) => ({
                    id: s.id,
                    name: serviceDisplayName({
                        serviceName: snById.get(s.service_name_id),
                        applicationName: s.name,
                        categoryType: catTypeById.get(s.category_id),
                    }),
                    description: s.description, duration_minutes: s.duration_minutes,
                    category_id: s.category_id, service_name_id: s.service_name_id,
                    professionals: s.professionals || [],
                    convenio_ids: aptoByService.get(s.id) || [],
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_prof_list ─────────────────────────────────────────────────────
        if (action === "get_prof_list") {
            const { data: profs, error: profErr } = await supabase.from("professionals")
                .select("id, name, responsavel:responsaveis(role, photo_url)")
                .eq("user_id", userId).eq("active", true);
            if (profErr) {
                return patientDbError("professionals_read_failed", "carregar os profissionais da clínica", profErr,
                    "Não conseguimos carregar a lista de profissionais agora. Tente novamente em alguns instantes.");
            }
            return new Response(JSON.stringify({
                sandbox: true,
                professionals: (profs || []).map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    photo_url: p.responsavel?.photo_url ?? null,
                    role: p.responsavel?.role ?? null,
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_slots ─────────────────────────────────────────────────────────
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

            const { data: svc, error: svcErr } = await supabase.from("services_client")
                .select("duration_minutes").eq("id", service_id).maybeSingle();
            if (svcErr) {
                return patientDbError("service_read_failed", "buscar a duração do serviço escolhido", svcErr,
                    "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes.");
            }
            if (!svc) {
                return patientError(404, "service_not_found",
                    "O serviço escolhido não está mais cadastrado na clínica. Volte e escolha outro serviço.",
                    `service_id=${service_id}`);
            }
            const duration = svc.duration_minutes || 30;

            const { selection: slotConvenio, response: slotConvenioFail } = await resolveConvenio();
            if (slotConvenioFail) return slotConvenioFail;

            const { data: prof, error: profErr } = await supabase.from("professionals")
                .select(`id, work_hours, work_days, use_daily_schedule, work_hours_daily, ${CONVENIO_PROF_COLUMNS}`)
                .eq("id", professional_id).eq("active", true).maybeSingle();
            if (profErr) {
                return patientDbError("professional_read_failed", "buscar os horários de trabalho do profissional", profErr,
                    "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes.");
            }
            if (!prof) {
                return patientError(404, "professional_not_found",
                    "O profissional escolhido não está mais cadastrado na clínica. Volte e escolha outro profissional.",
                    `professional_id=${professional_id}`);
            }

            const semHorario = () => new Response(JSON.stringify({ sandbox: true, slots: [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });

            // Cadeado do dia só vale quando o teste segue a agenda real
            if (agendaReal && await isProfessionalDayBlocked(supabase, professional_id, date)) return semHorario();

            const workDays: number[] = prof.work_days || [1, 2, 3, 4, 5];
            const reqDate = new Date(date + "T12:00:00");
            const wh = getWorkHoursForDay(prof, reqDate.getDay());
            if (!workDays.includes(reqDate.getDay())) return semHorario();

            const parseT = (t: any): number => {
                if (!t) return 0;
                if (typeof t === "string" && t.includes(":")) { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
                return parseFloat(t) * 60 || 0;
            };

            const whStart = parseT(wh.start) || 8 * 60;
            const whEnd = parseT(wh.end) || 20 * 60;
            const brkStart = wh.break_start ? parseT(wh.break_start) : null;
            const brkEnd = wh.break_end ? parseT(wh.break_end) : null;

            const convRanges = convenioRanges(prof, reqDate.getDay(), {
                start: whStart, end: whEnd, breakStart: brkStart, breakEnd: brkEnd,
            });
            if (slotConvenio.requested) {
                const roomIds = slotConvenio.convenio
                    ? await getConvenioRoomIds(supabase, slotConvenio.convenio.id)
                    : new Set<string>();
                const allowed = filterRoomsForConvenio([prof as any], roomIds).length > 0;
                if (!allowed || convRanges.length === 0) return semHorario();
            }

            // Ocupação: sempre os agendamentos do teste; a agenda real só entra
            // quando a sessão está em 'Agenda Real'.
            const { data: sandboxApts, error: sbErr } = await supabase.from("sandbox_appointments")
                .select("start_time, end_time")
                .eq("session_id", ctx.session.id).eq("professional_id", professional_id)
                .neq("status", "canceled")
                .gte("start_time", `${date}T00:00:00-03:00`).lte("start_time", `${date}T23:59:59-03:00`);
            if (sbErr) {
                return patientDbError("sandbox_appointments_read_failed",
                    "buscar os agendamentos já marcados no ambiente de teste", sbErr,
                    "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes.");
            }
            const ocupados: any[] = [...(sandboxApts || [])];

            if (agendaReal) {
                const { data: apts, error: aptsErr } = await supabase.from("appointments")
                    .select("start_time, end_time").eq("professional_id", professional_id).neq("status", "canceled")
                    .gte("start_time", `${date}T00:00:00-03:00`).lte("start_time", `${date}T23:59:59-03:00`);
                if (aptsErr) {
                    return patientDbError("appointments_read_failed",
                        "buscar os agendamentos reais do profissional nesta data", aptsErr,
                        "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes.");
                }
                ocupados.push(...(apts || []));
            }

            const slotSettings = await getSlotSettings(supabase, userId);
            const busy = ocupados.map((a: any) => padBusyRange(
                { start: spMinuteOfDay(a.start_time), end: spMinuteOfDay(a.end_time) },
                slotSettings.bufferMinutes,
            ));

            const available: string[] = [];
            for (let m = whStart; m + duration <= whEnd; m += slotSettings.stepMinutes) {
                if (brkStart !== null && brkEnd !== null && m < brkEnd && m + duration > brkStart) continue;
                if (slotConvenio.requested) {
                    if (!insideConvenio(m, duration, convRanges)) continue;
                } else if (overlapsConvenio(m, duration, convRanges)) {
                    continue;
                }
                let conflict = false;
                for (const b of busy) { if (m < b.end && m + duration > b.start) { conflict = true; break; } }
                if (!conflict) available.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
            }

            return new Response(JSON.stringify({
                sandbox: true,
                agenda_mode: agendaReal ? "real" : "livre",
                slots: available,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── create_booking ────────────────────────────────────────────────────
        if (action === "create_booking") {
            const missingBooking = [
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
                supabase.from("services_client")
                    .select("id, name, price, duration_minutes, category_id, service_name_id")
                    .eq("id", service_id).maybeSingle(),
                supabase.from("professionals").select(`id, name, ${CONVENIO_PROF_COLUMNS}`)
                    .eq("id", professional_id).eq("active", true).maybeSingle(),
            ]);
            if (svcErr) {
                return patientDbError("service_read_failed", "buscar o serviço escolhido", svcErr,
                    "Não conseguimos concluir o agendamento agora. Tente novamente em alguns instantes.");
            }
            if (profErr) {
                return patientDbError("professional_read_failed", "buscar o profissional escolhido", profErr,
                    "Não conseguimos concluir o agendamento agora. Tente novamente em alguns instantes.");
            }
            if (!svc) {
                return patientError(404, "service_not_found",
                    "O serviço escolhido não está mais cadastrado na clínica. Volte e escolha outro serviço.",
                    `service_id=${service_id}`);
            }
            if (!prof) {
                return patientError(404, "professional_not_found",
                    "O profissional escolhido não está mais cadastrado na clínica. Volte e escolha outro profissional.",
                    `professional_id=${professional_id}`);
            }

            const { selection: bookingConvenio, response: bookingConvenioFail } = await resolveConvenio();
            if (bookingConvenioFail) return bookingConvenioFail;

            if (bookingConvenio.requested && bookingConvenio.convenio) {
                const { data: apto, error: aptoErr } = await supabase.from("convenio_servicos")
                    .select("service_client_id")
                    .eq("convenio_id", bookingConvenio.convenio.id)
                    .eq("service_client_id", service_id).maybeSingle();
                if (aptoErr) {
                    return patientDbError("convenio_service_check_failed", "checar se o serviço é atendido pelo convênio", aptoErr,
                        "Não conseguimos confirmar se esse serviço é atendido pelo convênio. Tente novamente em alguns instantes.");
                }
                if (!apto) {
                    return patientError(409, "service_not_convenio",
                        `O serviço "${svc.name}" não é atendido por convênio nesta clínica. Volte e escolha a opção Particular ou outro serviço.`);
                }
                const roomIds = await getConvenioRoomIds(supabase, bookingConvenio.convenio.id);
                if (filterRoomsForConvenio([prof as any], roomIds).length === 0) {
                    return patientError(409, "professional_not_convenio",
                        `${prof.name} não atende por convênio. Volte e escolha outro profissional ou a opção Particular.`);
                }
            }

            const duration = svc.duration_minutes || 30;
            const startDate = new Date(`${date}T${time}:00-03:00`);
            const endDate = new Date(startDate.getTime() + duration * 60000);

            if (startDate < new Date()) {
                return patientError(400, "date_in_the_past",
                    `Não é possível agendar para ${date} às ${time} porque esse horário já passou. Escolha uma data e um horário futuros.`,
                    `Agora em Brasília: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
            }

            if (agendaReal && await isProfessionalDayBlocked(supabase, professional_id, date)) {
                return patientError(409, "agenda_closed",
                    `${prof.name} não está atendendo no dia ${date}. Escolha outra data ou outro profissional.`);
            }

            const { bufferMinutes } = await getSlotSettings(supabase, userId);
            const win = bufferedOverlapWindow(startDate, endDate, bufferMinutes);

            const { data: sbConflict, error: sbConflictErr } = await supabase.from("sandbox_appointments")
                .select("id")
                .eq("session_id", ctx.session.id).eq("professional_id", professional_id)
                .neq("status", "canceled")
                .lt("start_time", win.end).gt("end_time", win.start)
                .limit(1);
            if (sbConflictErr) {
                return patientDbError("overlap_check_failed", "verificar se o horário está livre no ambiente de teste", sbConflictErr,
                    "Não conseguimos confirmar se esse horário está livre. Tente novamente em alguns instantes.");
            }
            if ((sbConflict || []).length > 0) {
                return patientError(409, "slot_taken",
                    `O horário de ${time} do dia ${date} com ${prof.name} já foi ocupado neste teste. Escolha outro horário.`,
                    `Duração do serviço: ${duration} min; folga entre atendimentos: ${bufferMinutes} min`);
            }

            if (agendaReal) {
                const { data: overlap, error: overlapErr } = await supabase.rpc("check_appointment_overlap", {
                    p_professional_id: professional_id,
                    p_start_time: win.start,
                    p_end_time: win.end,
                    p_exclude_id: null,
                });
                if (overlapErr) {
                    return patientDbError("overlap_check_failed", "verificar se o horário escolhido está livre na agenda real", overlapErr,
                        "Não conseguimos confirmar se esse horário está livre. Tente novamente em alguns instantes.");
                }
                if (overlap) {
                    return patientError(409, "slot_taken",
                        `O horário de ${time} do dia ${date} com ${prof.name} está ocupado na agenda real. Escolha outro horário.`,
                        `Duração do serviço: ${duration} min; folga entre atendimentos: ${bufferMinutes} min`);
                }
            }

            const campanha = await campanhaAtiva();
            const finalPrice = descontoDaCampanha(campanha, Number(svc.price) || 0, svc.name);

            const { data: created, error: insertErr } = await supabase.from("sandbox_appointments").insert({
                session_id: ctx.session.id,
                user_id: userId,
                contact_id: contactId,
                professional_id,
                service_id,
                title: svc.name,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "pending",
            }).select().single();

            if (insertErr) {
                return patientDbError("appointment_insert_failed", "gravar o agendamento no ambiente de teste", insertErr,
                    "Não conseguimos registrar o agendamento de teste. Tente novamente em alguns instantes.");
            }

            // Consome a compra pendente do mesmo serviço (espelha o trigger da produção)
            const { data: venda } = await supabase.from("sandbox_sales")
                .select("id").eq("session_id", ctx.session.id)
                .eq("service_client_id", service_id).is("appointment_id", null)
                .limit(1).maybeSingle();
            if (venda) {
                await supabase.from("sandbox_sales").update({ appointment_id: created.id }).eq("id", venda.id);
            }

            // Funil do teste: card ativo vai para Agendado
            let crmWarning: string | null = null;
            try {
                const { data: card } = await supabase.from("sandbox_crm").select("*")
                    .eq("session_id", ctx.session.id).eq("is_active", true).limit(1).maybeSingle();

                if (card && !TERMINAL_STAGES.includes(card.stage)) {
                    if (card.stage !== "Agendado") {
                        await supabase.from("sandbox_crm")
                            .update({ stage: "Agendado", updated_at: new Date().toISOString() }).eq("id", card.id);
                        await supabase.from("sandbox_crm_history").insert({
                            crm_id: card.id, user_id: userId, from_stage: card.stage, to_stage: "Agendado",
                        });
                    }
                    const { data: jaTem } = await supabase.from("sandbox_crm_services")
                        .select("id").eq("crm_id", card.id).eq("service_client_id", service_id).maybeSingle();
                    if (!jaTem) {
                        await supabase.from("sandbox_crm_services").insert({
                            crm_id: card.id, user_id: userId, service_client_id: service_id,
                            service_name: svc.name, price: finalPrice,
                        });
                    }
                } else {
                    if (card) await supabase.from("sandbox_crm").update({ is_active: false }).eq("id", card.id);
                    const { data: novo } = await supabase.from("sandbox_crm").insert({
                        session_id: ctx.session.id, user_id: userId, contact_id: contactId,
                        conversation_id: ctx.conversation.id, stage: "Agendado", is_active: true,
                    }).select().single();
                    if (novo) {
                        await supabase.from("sandbox_crm_services").insert({
                            crm_id: novo.id, user_id: userId, service_client_id: service_id,
                            service_name: svc.name, price: finalPrice,
                        });
                        await supabase.from("sandbox_crm_history").insert({
                            crm_id: novo.id, user_id: userId, from_stage: null, to_stage: "Agendado",
                        });
                    }
                }
            } catch (crmErr) {
                crmWarning = describeDbError("sincronizar o funil do teste com o agendamento criado", crmErr);
                console.warn("[api-public-booking-sandbox]", crmWarning);
            }

            await logSandboxCall(supabase, ctx, {
                function_name: "api-public-booking-sandbox",
                label: `Agendou "${svc.name}" com ${prof.name} em ${date} às ${time} pelo link de agendamento`,
                request: { action, service_id, professional_id, date, time },
            });

            return new Response(JSON.stringify({
                success: true,
                sandbox: true,
                appointment_id: created.id,
                price: finalPrice,
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_pending ───────────────────────────────────────────────────────
        if (action === "get_pending") {
            const { data: apts, error: aptsErr } = await supabase.from("sandbox_appointments")
                .select("id, title, service_id, professional_id, start_time, end_time, status")
                .eq("session_id", ctx.session.id)
                .in("status", ["pending", "confirmed", "rescheduled"])
                .gte("start_time", new Date().toISOString())
                .order("start_time", { ascending: true });
            if (aptsErr) {
                return patientDbError("appointments_read_failed", "buscar os agendamentos do ambiente de teste", aptsErr,
                    "Não conseguimos carregar os agendamentos agora. Tente novamente em alguns instantes.");
            }

            const label = await createServiceLabelResolver(supabase, (apts || []).map((a: any) => a.service_id));
            const profIds = [...new Set((apts || []).map((a: any) => a.professional_id).filter(Boolean))];
            const { data: profs } = profIds.length
                ? await supabase.from("professionals").select("id, name").in("id", profIds)
                : { data: [] as any[] };
            const profName = new Map((profs || []).map((p: any) => [p.id, p.name]));

            return new Response(JSON.stringify({
                sandbox: true,
                appointments: (apts || []).map((a: any) => ({
                    id: a.id,
                    service_id: a.service_id,
                    service_name: label(a.service_id, a.title),
                    professional_id: a.professional_id,
                    professional_name: profName.get(a.professional_id) || null,
                    start_time: a.start_time,
                    end_time: a.end_time,
                    status: a.status,
                    convenio_id: null,
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── cancel_booking ────────────────────────────────────────────────────
        if (action === "cancel_booking") {
            if (!appointment_id) {
                return patientError(400, "missing_fields",
                    "Não dá para cancelar: o agendamento não foi identificado. Volte, escolha o agendamento na lista e tente de novo.",
                    "Campo ausente: appointment_id");
            }

            const { data: toCancel, error: findErr } = await supabase.from("sandbox_appointments")
                .select("id, session_id, service_id, status")
                .eq("id", appointment_id).maybeSingle();
            if (findErr) {
                return patientDbError("appointment_read_failed", "buscar o agendamento de teste a cancelar", findErr,
                    "Não conseguimos localizar esse agendamento agora. Tente novamente em alguns instantes.");
            }
            if (!toCancel || toCancel.session_id !== ctx.session.id) {
                return patientError(404, "appointment_not_found",
                    "Esse agendamento não existe mais no ambiente de teste.",
                    `appointment_id=${appointment_id}`);
            }
            if (toCancel.status === "canceled") {
                return new Response(JSON.stringify({ success: true, sandbox: true, status: "canceled", already_canceled: true }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const { error: upErr } = await supabase.from("sandbox_appointments")
                .update({ status: "canceled" }).eq("id", appointment_id);
            if (upErr) {
                return patientDbError("appointment_cancel_failed", "cancelar o agendamento de teste", upErr,
                    "Não conseguimos cancelar o agendamento. Tente novamente em alguns instantes.");
            }

            // Devolve a compra para a lista de pendentes
            await supabase.from("sandbox_sales").update({ appointment_id: null }).eq("appointment_id", appointment_id);

            // Funil: tira o serviço do card ativo; card sem serviço vira Perdido
            let crmWarning: string | null = null;
            try {
                const { data: card } = await supabase.from("sandbox_crm").select("*")
                    .eq("session_id", ctx.session.id).eq("is_active", true).limit(1).maybeSingle();
                if (card) {
                    await supabase.from("sandbox_crm_services").delete()
                        .eq("crm_id", card.id).eq("service_client_id", toCancel.service_id);
                    const { data: restantes } = await supabase.from("sandbox_crm_services")
                        .select("id").eq("crm_id", card.id);
                    if (!restantes || restantes.length === 0) {
                        await supabase.from("sandbox_crm")
                            .update({ stage: "Perdido", is_active: false, updated_at: new Date().toISOString() })
                            .eq("id", card.id);
                        await supabase.from("sandbox_crm_history").insert({
                            crm_id: card.id, user_id: userId, from_stage: card.stage, to_stage: "Perdido",
                        });
                    }
                }
            } catch (crmErr) {
                crmWarning = describeDbError("sincronizar o funil do teste com o cancelamento", crmErr);
                console.warn("[api-public-booking-sandbox]", crmWarning);
            }

            await logSandboxCall(supabase, ctx, {
                function_name: "api-public-booking-sandbox",
                label: "Cancelou um agendamento pelo link de agendamento",
                request: { action, appointment_id },
            });

            return new Response(JSON.stringify({
                success: true, sandbox: true, status: "canceled",
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── reschedule_booking ────────────────────────────────────────────────
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

            const { data: existing, error: existingErr } = await supabase.from("sandbox_appointments")
                .select("id, session_id, start_time, end_time, professional_id, status")
                .eq("id", appointment_id).maybeSingle();
            if (existingErr) {
                return patientDbError("appointment_read_failed", "buscar o agendamento de teste a reagendar", existingErr,
                    "Não conseguimos localizar esse agendamento agora. Tente novamente em alguns instantes.");
            }
            if (!existing || existing.session_id !== ctx.session.id) {
                return patientError(404, "appointment_not_found",
                    "Esse agendamento não existe mais no ambiente de teste.",
                    `appointment_id=${appointment_id}`);
            }
            if (existing.status === "canceled") {
                return patientError(409, "appointment_canceled",
                    "Esse agendamento está cancelado e não pode ser reagendado. Faça um agendamento novo.",
                    `appointment_id=${appointment_id}`);
            }

            const { data: profRow } = await supabase.from("professionals")
                .select("name").eq("id", existing.professional_id).maybeSingle();
            const profNome = profRow?.name || "o profissional";

            const durationMs = new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime();
            const startDate = new Date(`${date}T${time}:00-03:00`);
            const endDate = new Date(startDate.getTime() + durationMs);

            if (startDate < new Date()) {
                return patientError(400, "date_in_the_past",
                    `Não é possível reagendar para ${date} às ${time} porque esse horário já passou. Escolha uma data e um horário futuros.`,
                    `Agora em Brasília: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
            }

            if (agendaReal && await isProfessionalDayBlocked(supabase, existing.professional_id, date)) {
                return patientError(409, "agenda_closed",
                    `${profNome} não está atendendo no dia ${date}. Escolha outra data.`);
            }

            const { bufferMinutes } = await getSlotSettings(supabase, userId);
            const win = bufferedOverlapWindow(startDate, endDate, bufferMinutes);

            const { data: sbConflict, error: sbConflictErr } = await supabase.from("sandbox_appointments")
                .select("id")
                .eq("session_id", ctx.session.id).eq("professional_id", existing.professional_id)
                .neq("status", "canceled").neq("id", appointment_id)
                .lt("start_time", win.end).gt("end_time", win.start)
                .limit(1);
            if (sbConflictErr) {
                return patientDbError("overlap_check_failed", "verificar se o novo horário está livre no ambiente de teste", sbConflictErr,
                    "Não conseguimos confirmar se esse horário está livre. Tente novamente em alguns instantes.");
            }
            if ((sbConflict || []).length > 0) {
                return patientError(409, "slot_taken",
                    `O horário de ${time} do dia ${date} com ${profNome} já foi ocupado neste teste. Escolha outro horário.`);
            }

            if (agendaReal) {
                const { data: overlap, error: overlapErr } = await supabase.rpc("check_appointment_overlap", {
                    p_professional_id: existing.professional_id,
                    p_start_time: win.start,
                    p_end_time: win.end,
                    p_exclude_id: null,
                });
                if (overlapErr) {
                    return patientDbError("overlap_check_failed", "verificar se o novo horário está livre na agenda real", overlapErr,
                        "Não conseguimos confirmar se esse horário está livre. Tente novamente em alguns instantes.");
                }
                if (overlap) {
                    return patientError(409, "slot_taken",
                        `O horário de ${time} do dia ${date} com ${profNome} está ocupado na agenda real. Escolha outro horário.`);
                }
            }

            const { error: upErr } = await supabase.from("sandbox_appointments").update({
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "rescheduled",
            }).eq("id", appointment_id);
            if (upErr) {
                return patientDbError("appointment_update_failed", "gravar o novo horário do agendamento de teste", upErr,
                    "Não conseguimos reagendar o horário. Tente novamente em alguns instantes.");
            }

            await logSandboxCall(supabase, ctx, {
                function_name: "api-public-booking-sandbox",
                label: `Reagendou pelo link para ${date} às ${time}`,
                request: { action, appointment_id, date, time },
            });

            return new Response(JSON.stringify({ success: true, sandbox: true, status: "rescheduled" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return unknownAction(corsHeaders, action, VALID_ACTIONS);
    } catch (error) {
        console.error("[api-public-booking-sandbox] erro inesperado:", error);
        return patientError(
            500,
            "unexpected_error",
            "Tivemos um problema para processar o agendamento de teste. Tente novamente em alguns instantes.",
            (error as Error)?.message ?? error,
        );
    }
});
